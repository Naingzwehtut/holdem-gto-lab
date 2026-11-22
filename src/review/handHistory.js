/**
 * Hand history import for PokerStars and GGPoker text exports.
 *
 * Works on finished hands saved by the poker client. It never reads a live table.
 */
import { parseCards } from '../engine/cards.js';
import { classOf } from '../engine/ranges.js';
import { SPOT, presetById } from '../data/spots.js';

// String.prototype.trim() also removes a leading byte-order mark, so lines are trimmed before matching.
const HEADER = /^(?:PokerStars(?: Zoom)?|Poker|GGPoker) Hand #/;
const STREET = /^\*\*\* (HOLE CARDS|FLOP|TURN|RIVER|SHOW ?DOWN|SUMMARY) \*\*\*/;
const ACTION = /^(.+?): (folds|checks|calls|bets|raises|posts|shows|mucks)\b(.*)$/;
const UNCALLED = /^Uncalled bet \(([^)]+)\) returned to (.+)$/;
const COLLECTED = /^(.+?) collected (\S+) from (?:the )?(?:main |side )?pot/;
const SEAT = /^Seat (\d+): (.+?) \(([^)]*?) in chips[^)]*\)(.*)$/;

const POSITION_NAMES = {
  2: ['BB', 'BTN'],
  3: ['SB', 'BB', 'BTN'],
  4: ['SB', 'BB', 'CO', 'BTN'],
  5: ['SB', 'BB', 'HJ', 'CO', 'BTN'],
  6: ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'],
  7: ['SB', 'BB', 'UTG', 'LJ', 'HJ', 'CO', 'BTN'],
  8: ['SB', 'BB', 'UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN'],
  9: ['SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO', 'BTN'],
  10: ['SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'UTG+3', 'LJ', 'HJ', 'CO', 'BTN'],
};

/** Parse "$1,250.50", "€0.10" or "1500" into a number. */
export const amount = (text) => parseFloat(String(text).replace(/[^\d.]/g, '')) || 0;
const numbers = (text) => (String(text).match(/[\d,]*\.?\d+/g) || []).map((x) => amount(x));

/** Split a file that may hold many hands into one string per hand. */
export function splitHands(text) {
  const lines = String(text).split(/\r?\n/);
  const hands = [];
  let cur = null;
  for (const line of lines) {
    if (HEADER.test(line.trim())) {
      if (cur) hands.push(cur.join('\n'));
      cur = [line.trim()];
    } else if (cur) cur.push(line);
  }
  if (cur) hands.push(cur.join('\n'));
  return hands;
}

/** Position label per player name, counting clockwise from the button. */
export function assignPositions(seats, buttonSeat) {
  const active = seats.filter((s) => !s.sittingOut).sort((a, b) => a.seat - b.seat);
  const n = active.length;
  const names = POSITION_NAMES[n];
  if (!names) return {};
  let start = active.findIndex((s) => s.seat > buttonSeat);
  if (start < 0) start = 0;
  const ordered = [...active.slice(start), ...active.slice(0, start)];
  const out = {};
  ordered.forEach((s, i) => (out[s.name] = names[i]));
  return out;
}

/**
 * Parse one hand.
 * @param {string} text
 */
export function parseHand(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const head = lines[0] || '';
  const hand = {
    id: (head.match(/Hand #([^:\s]+)/) || [])[1] || '?',
    site: /^PokerStars/.test(head) ? 'PokerStars' : 'GGPoker',
    date: (head.match(/(\d{4}\/\d{2}\/\d{2} \d{1,2}:\d{2}:\d{2})/) || [])[1] || '',
    sb: 0,
    bb: 0,
    tableSize: 0,
    button: 0,
    seats: [],
    positions: {},
    hero: null,
    heroCards: null,
    boards: { flop: [], turn: [], river: [] },
    board: [],
    actions: [],
    shown: {},
    collected: {},
    invested: {},
    pot: 0,
    rake: 0,
  };
  const stakes = head.match(/\(([^()]*?)\/([^()]*?)\)/);
  if (stakes) {
    hand.sb = amount(stakes[1]);
    hand.bb = amount(stakes[2]);
  }

  let street = 'setup';
  const commit = {};
  const total = {};
  const potNow = () => Object.values(total).reduce((a, b) => a + b, 0);
  const maxCommit = () => Math.max(0, ...Object.values(commit));

  for (const line of lines.slice(1)) {
    const st = line.match(STREET);
    if (st) {
      const name = st[1].replace(' ', '');
      if (name === 'HOLECARDS') street = 'preflop';
      else if (name === 'SUMMARY') street = 'summary';
      else if (name === 'SHOWDOWN') street = 'showdown';
      else {
        street = name.toLowerCase();
        const cards = parseCards((line.match(/\[[^\]]+\]/g) || []).join(' '));
        if (cards) {
          hand.boards[street] = cards;
          hand.board = cards;
        }
        for (const k of Object.keys(commit)) commit[k] = 0;
      }
      continue;
    }

    if (street === 'setup') {
      const tm = line.match(/Seat #(\d+) is the button/);
      if (tm) {
        hand.button = +tm[1];
        hand.tableSize = +((line.match(/(\d+)-max/) || [])[1] || 0);
        continue;
      }
      const sm = line.match(SEAT);
      if (sm) hand.seats.push({ seat: +sm[1], name: sm[2], stack: amount(sm[3]), sittingOut: /sitting out/.test(sm[4]) });
    }

    if (street === 'summary') {
      const tp = line.match(/^Total pot (\S+)(?:.*?Rake (\S+))?/);
      if (tp) {
        hand.pot = amount(tp[1]);
        hand.rake = tp[2] ? amount(tp[2]) : 0;
      }
      continue;
    }

    const dealt = line.match(/^Dealt to (.+?) \[([^\]]+)\]/);
    if (dealt) {
      hand.hero = dealt[1];
      hand.heroCards = parseCards(dealt[2]);
      continue;
    }

    const un = line.match(UNCALLED);
    if (un) {
      const x = amount(un[1]);
      total[un[2]] = (total[un[2]] || 0) - x;
      commit[un[2]] = (commit[un[2]] || 0) - x;
      continue;
    }

    const col = line.match(COLLECTED);
    if (col) {
      hand.collected[col[1]] = (hand.collected[col[1]] || 0) + amount(col[2]);
      continue;
    }

    const m = line.match(ACTION);
    if (!m) continue;
    const [, player, verb, rest] = m;
    if (verb === 'shows') {
      const cards = parseCards((rest.match(/\[([^\]]+)\]/) || [])[1] || '');
      if (cards) hand.shown[player] = cards;
      continue;
    }
    if (verb === 'mucks') continue;

    const nums = numbers(rest);
    const before = { potBefore: potNow(), toCall: Math.max(0, maxCommit() - (commit[player] || 0)) };
    commit[player] = commit[player] || 0;
    total[player] = total[player] || 0;
    const act = { street: street === 'setup' ? 'preflop' : street, player, verb, amount: 0, allIn: /all-in/.test(rest), ...before };

    if (verb === 'posts') {
      const x = nums[nums.length - 1] || 0;
      act.amount = x;
      total[player] += x;
      if (!/ante/.test(rest)) commit[player] += /small & big/.test(rest) ? Math.min(x, hand.bb || x) : x;
      if (/big blind/.test(rest) && !/small & big/.test(rest) && !hand.bb) hand.bb = x;
    } else if (verb === 'calls' || verb === 'bets') {
      const x = nums[0] || 0;
      act.amount = x;
      commit[player] += x;
      total[player] += x;
    } else if (verb === 'raises') {
      const to = nums.length > 1 ? nums[1] : nums[0] || 0;
      act.amount = to;
      total[player] += to - commit[player];
      commit[player] = to;
    }
    hand.actions.push(act);
  }

  hand.invested = total;
  if (!hand.pot) hand.pot = potNow();
  hand.positions = assignPositions(hand.seats, hand.button);
  return hand;
}

/** Parse every hand in a text blob; malformed hands are skipped. */
export function parseHandHistories(text) {
  const out = [];
  for (const chunk of splitHands(text)) {
    try {
      const h = parseHand(chunk);
      if (h.actions.length) out.push(h);
    } catch {
      /* skip malformed hand */
    }
  }
  return out;
}

const VERB_TO_ACTION = { raises: 'raise', bets: 'raise', calls: 'call', folds: 'fold', checks: 'check' };

/**
 * Compare the hero's first preflop decision with the chart for that spot.
 * Returns null when the hero never acted, or `{ spotId: null, reason }` when no chart covers the spot.
 */
export function gradePreflop(hand) {
  if (!hand.hero || !hand.heroCards) return null;
  const pre = hand.actions.filter((a) => a.street === 'preflop' && a.verb !== 'posts');
  const i = pre.findIndex((a) => a.player === hand.hero);
  if (i < 0) return null;
  const before = pre.slice(0, i);
  const raises = before.filter((a) => a.verb === 'raises' || a.verb === 'bets');
  const calls = before.filter((a) => a.verb === 'calls');
  const heroPos = hand.positions[hand.hero];
  const action = VERB_TO_ACTION[pre[i].verb];
  const cls = classOf(hand.heroCards[0], hand.heroCards[1]);
  const base = { cls, action, heroPos };

  if (action === 'check') return { ...base, spotId: null, reason: 'You checked your option in the big blind.' };
  let spotId = null;
  if (!raises.length && !calls.length) {
    spotId = SPOT[heroPos] ? heroPos : null;
  } else if (raises.length === 1 && !calls.length) {
    const id = `${heroPos}v${hand.positions[raises[0].player]}`;
    spotId = SPOT[id] ? id : null;
  }
  if (!spotId) {
    const reason = calls.length
      ? 'Someone limped or called before you; the charts cover unopened pots and single raises only.'
      : raises.length > 1
        ? 'You faced a 3-bet or more; the charts cover single-raised spots.'
        : `No chart for ${heroPos || 'this seat'} in this spot yet.`;
    return { ...base, spotId: null, reason };
  }

  const spot = SPOT[spotId];
  const f = spot.fr[cls];
  if (spot.group === 'open' && action === 'call') {
    return { ...base, spotId, f, freq: 0, grade: 'bad', reason: 'Open-limped. These charts raise or fold when first in.' };
  }
  const freq = f[{ raise: 0, call: 1, fold: 2 }[action]];
  const grade = freq >= 0.5 ? 'good' : freq >= 0.2 ? 'warn' : 'bad';
  return { ...base, spotId, f, freq, grade };
}

/** Every postflop decision the hero made, with the price they were offered (in big blinds). */
export function heroDecisions(hand) {
  if (!hand.hero || !hand.heroCards || !hand.bb) return [];
  return hand.actions
    .filter((a) => a.player === hand.hero && a.street !== 'preflop' && hand.boards[a.street]?.length)
    .map((a) => ({
      street: a.street,
      board: hand.boards[a.street],
      verb: a.verb,
      potBb: (a.potBefore - a.toCall) / hand.bb,
      betBb: a.toCall / hand.bb,
      amountBb: a.amount / hand.bb,
    }));
}

/** Best guess at the opponent's preset range for a heads-up pot. */
export function guessVillainPreset(hand) {
  const pre = hand.actions.filter((a) => a.street === 'preflop' && a.verb !== 'posts');
  const folded = new Set(pre.filter((a) => a.verb === 'folds').map((a) => a.player));
  const inHand = [...new Set(pre.map((a) => a.player))].filter((p) => !folded.has(p) && p !== hand.hero);
  if (inHand.length !== 1) return 'any';
  const villain = inHand[0];
  const vPos = hand.positions[villain];
  const hPos = hand.positions[hand.hero];
  const raisers = pre.filter((a) => a.verb === 'raises').map((a) => a.player);
  const pick = (...ids) => ids.find((id) => presetById(id)) || 'any';
  if (!raisers.length) return 'any';
  if (raisers.length === 1) {
    return raisers[0] === villain ? pick('open-' + vPos) : pick(`call-${vPos}v${hPos}`, 'open-' + vPos);
  }
  if (raisers.length === 2 && raisers[1] === villain) return pick(`3b-${vPos}v${hPos}`, 'prem');
  if (raisers.length >= 3) return 'prem';
  return pick('open-' + vPos);
}

/** Hero's result in big blinds. */
export function heroNet(hand) {
  if (!hand.hero || !hand.bb) return 0;
  return ((hand.collected[hand.hero] || 0) - (hand.invested[hand.hero] || 0)) / hand.bb;
}

/** Session summary across many hands. */
export function sessionStats(hands) {
  let net = 0;
  let vpip = 0;
  let pfr = 0;
  let graded = 0;
  let correct = 0;
  for (const h of hands) {
    net += heroNet(h);
    const heroPre = h.actions.filter((a) => a.street === 'preflop' && a.player === h.hero && a.verb !== 'posts');
    if (heroPre.some((a) => a.verb === 'calls' || a.verb === 'raises')) vpip++;
    if (heroPre.some((a) => a.verb === 'raises')) pfr++;
    const g = gradePreflop(h);
    if (g && g.spotId) {
      graded++;
      if (g.grade !== 'bad') correct++;
    }
  }
  const n = hands.length || 1;
  return { hands: hands.length, net, vpip: vpip / n, pfr: pfr / n, graded, correct };
}
