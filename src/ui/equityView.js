/** Multi-way equity calculator with a card picker. */
import { CATEGORY_NAMES, RANKS, SUIT_SYMBOLS, card, cardToString } from '../engine/cards.js';
import { compressRange, parseRange, rangeStats } from '../engine/ranges.js';
import { calculateEquity } from '../engine/equity.js';
import { presetById } from '../data/spots.js';
import { $, cardHTML, debounce, esc, jobCounter, pct, presetOptions } from './dom.js';
import { go, nav } from './nav.js';

const blankPlayer = (p = {}) => ({ mode: 'random', cards: [null, null], range: '', preset: 'custom', ...p });
const state = {
  players: [
    blankPlayer({ mode: 'cards', cards: [card(12, 0), card(11, 0)] }),
    blankPlayer({ mode: 'range', preset: '3b-BBvBTN', range: compressRange(presetById('3b-BBvBTN').map) }),
  ],
  board: [null, null, null, null, null],
  active: { p: 0, k: 0 },
};
const nextJob = jobCounter();
let started = false;

const usedCards = () => {
  const u = new Set();
  state.players.forEach((p) => p.mode === 'cards' && p.cards.forEach((c) => c != null && u.add(c)));
  state.board.forEach((c) => c != null && u.add(c));
  return u;
};

export function init() {
  let h = '';
  for (let s = 0; s < 4; s++) {
    for (let r = 12; r >= 0; r--) {
      h += `<button type="button" class="s${s}" data-card="${card(r, s)}" aria-label="${RANKS[r]}${'shdc'[s]}">${RANKS[r]}<span>${SUIT_SYMBOLS[s]}</span></button>`;
    }
  }
  $('#eqPicker').innerHTML = h;
  $('#eqPicker').addEventListener('click', (e) => {
    const b = e.target.closest('[data-card]');
    if (b && !b.disabled) placeCard(+b.dataset.card);
  });
  $('#eqAdd').onclick = () => {
    if (state.players.length >= 6) return;
    state.players.push(blankPlayer());
    refresh();
  };
  $('#eqClear').onclick = () => {
    state.players.forEach((p) => (p.cards = [null, null]));
    state.board = [null, null, null, null, null];
    state.active = { p: 0, k: 0 };
    refresh();
  };
  $('#eqPlayers').addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const i = +t.closest('.player').dataset.i;
    const p = state.players[i];
    if (t.dataset.mode) {
      p.mode = t.dataset.mode;
      if (p.mode === 'range' && !p.range) {
        p.preset = 'open-BTN';
        p.range = compressRange(presetById('open-BTN').map);
      }
      if (p.mode === 'cards') state.active = { p: i, k: p.cards[0] == null ? 0 : 1 };
    } else if (t.dataset.slot != null) {
      const k = +t.dataset.slot;
      p.cards[k] = null;
      state.active = { p: i, k };
    } else if (t.dataset.remove != null) {
      state.players.splice(i, 1);
      state.active = { p: 0, k: 0 };
    } else return;
    refresh();
  });
  $('#eqPlayers').addEventListener('change', (e) => {
    if (!e.target.matches('select')) return;
    const p = state.players[+e.target.closest('.player').dataset.i];
    p.preset = e.target.value;
    const pr = presetById(p.preset);
    if (pr) p.range = compressRange(pr.map);
    refresh();
  });
  $('#eqPlayers').addEventListener('input', (e) => {
    if (!e.target.matches('textarea')) return;
    const el = e.target.closest('.player');
    const p = state.players[+el.dataset.i];
    p.range = e.target.value;
    p.preset = 'custom';
    $('select', el).value = 'custom';
    rangeInfo($('.rinfo', el), p.range);
    runSoon();
  });
  $('#eqBoard').addEventListener('click', (e) => {
    const t = e.target.closest('[data-b]');
    if (!t) return;
    const k = +t.dataset.b;
    state.board[k] = null;
    state.active = { b: k };
    refresh();
  });

  nav.openEquity = (players, board) => {
    state.players = players.map((p) => blankPlayer(p));
    state.board = board || [null, null, null, null, null];
    state.active = nextEmpty();
    go('equity');
    refresh();
  };
}

export function show() {
  render();
  if (!started) {
    started = true;
    run();
  }
}

function refresh() {
  render();
  runSoon();
}

function rangeInfo(el, text) {
  const { map, errors } = parseRange(text);
  const st = rangeStats(map);
  el.innerHTML = errors.length
    ? `<span class="err">Couldn't read: ${esc(errors.join(', '))}</span>`
    : `${st.combos.toFixed(0)} combos · ${st.pct.toFixed(1)}% of hands`;
}

function nextEmpty() {
  const slots = [];
  state.players.forEach((p, i) => {
    if (p.mode === 'cards') slots.push({ p: i, k: 0 }, { p: i, k: 1 });
  });
  for (let k = 0; k < 5; k++) slots.push({ b: k });
  return slots.find((s) => (s.b != null ? state.board[s.b] == null : state.players[s.p].cards[s.k] == null)) || null;
}

function placeCard(c) {
  const a = state.active || nextEmpty();
  if (!a) return;
  if (a.b != null) {
    const firstGap = state.board.findIndex((x) => x == null);
    state.board[firstGap >= 0 && firstGap < a.b ? firstGap : a.b] = c;
  } else state.players[a.p].cards[a.k] = c;
  state.active = nextEmpty();
  refresh();
}

function render() {
  const isActive = (p, k) => state.active && state.active.p === p && state.active.k === k;
  $('#eqPlayers').innerHTML = state.players
    .map(
      (p, i) => `
    <div class="player ${i === 0 ? 'hero' : ''}" data-i="${i}">
      <div class="player-head">
        <span class="player-name">${i === 0 ? 'You' : 'Opponent ' + i}</span>
        <span class="row tight">
          <span class="seg">${['cards', 'range', 'random']
            .map((m) => `<button type="button" data-mode="${m}" aria-pressed="${p.mode === m}">${m[0].toUpperCase() + m.slice(1)}</button>`)
            .join('')}</span>
          ${state.players.length > 2 && i > 0 ? `<button type="button" class="x" data-remove="${i}" aria-label="Remove player">×</button>` : ''}
        </span>
      </div>
      ${
        p.mode === 'cards'
          ? `<div class="cards">${p.cards
              .map(
                (c, k) =>
                  `<button type="button" class="slot ${isActive(i, k) ? 'active' : ''}" data-slot="${k}" aria-label="${c == null ? 'Empty slot' : 'Remove ' + cardToString(c)}">${cardHTML(c)}</button>`,
              )
              .join('')}</div>`
          : ''
      }
      ${p.mode === 'range' ? `<select aria-label="Range preset">${presetOptions(p.preset)}</select><textarea spellcheck="false" aria-label="Range text">${esc(p.range)}</textarea><span class="rinfo muted small-text"></span>` : ''}
      ${p.mode === 'random' ? `<span class="muted small-text">Any two cards.</span>` : ''}
    </div>`,
    )
    .join('');
  state.players.forEach((p, i) => {
    if (p.mode === 'range') rangeInfo($(`.player[data-i="${i}"] .rinfo`), p.range);
  });
  $('#eqBoard').innerHTML = state.board
    .map(
      (c, k) =>
        `<button type="button" class="slot ${state.active && state.active.b === k ? 'active' : ''}" data-b="${k}" aria-label="${c == null ? 'Empty board slot' : 'Remove ' + cardToString(c)}">${cardHTML(c)}</button>`,
    )
    .join('');
  const used = usedCards();
  document.querySelectorAll('#eqPicker [data-card]').forEach((b) => (b.disabled = used.has(+b.dataset.card)));
  $('#eqAdd').disabled = state.players.length >= 6;
}

const runSoon = debounce(run, 220);

async function run() {
  const out = $('#eqResults');
  const board = state.board.filter((c) => c != null);
  const players = [];
  for (const [i, p] of state.players.entries()) {
    const name = i === 0 ? 'You' : 'Opponent ' + i;
    if (p.mode === 'cards') {
      const cs = p.cards.filter((c) => c != null);
      if (cs.length === 0) players.push({ random: true, name });
      else if (cs.length === 1) {
        out.innerHTML = `<h2>Results</h2><p class="muted">${name}: pick a second card, or clear both for a random hand.</p>`;
        return;
      } else players.push({ cards: cs, name });
    } else if (p.mode === 'range') {
      const { map, errors } = parseRange(p.range);
      if (errors.length || !map.size) {
        out.innerHTML = `<h2>Results</h2><p class="err">${name}: ${errors.length ? "couldn't read " + esc(errors.join(', ')) : 'the range is empty'}.</p>`;
        return;
      }
      players.push({ map, name });
    } else players.push({ random: true, name });
  }
  if (board.length > 0 && board.length < 3) {
    out.innerHTML = `<h2>Results</h2><p class="muted">Add at least three board cards for a flop, or clear the board for preflop.</p>`;
    return;
  }
  const isCancelled = nextJob();
  const draw = (r, done) => {
    const T = r.total || 1;
    const describe = (p, i) =>
      p.mode === 'cards' && players[i].cards
        ? players[i].cards.map(cardToString).join(' ')
        : p.mode === 'range'
          ? rangeStats(players[i].map).pct.toFixed(1) + '% range'
          : 'random hand';
    out.innerHTML = `
      <div class="row between"><h2>Results</h2><span class="muted mono tiny">${
        r.exact
          ? 'exact · ' + r.total.toLocaleString() + ' boards'
          : (done ? '' : 'running · ') + r.total.toLocaleString() + ' simulated deals'
      }</span></div>
      <div>${state.players
        .map(
          (p, i) => `
        <div class="res-row">
          <div><div class="strong">${players[i].name}</div>
          <div class="muted small-text">${describe(p, i)} · win ${pct(r.win[i] / T)} · tie ${pct(r.tie[i] / T)}</div></div>
          <div class="res-eq">${pct(r.eq[i] / T)}</div>
          <div class="bar"><span class="w" style="width:${(r.win[i] / T) * 100}%"></span><span class="t" style="width:${(r.tie[i] / T) * 100}%"></span></div>
        </div>`,
        )
        .join('')}</div>
      <div><h3 class="mb-8">Your final hand</h3>
        <div class="dist">${CATEGORY_NAMES.map((c, k) => [c, r.cats[k] / T])
          .reverse()
          .filter((x) => x[1] > 0.0005)
          .map(
            ([c, v]) =>
              `<span>${c}</span><span class="track"><span style="width:${v * 100}%"></span></span><span class="v">${pct(v)}</span>`,
          )
          .join('')}</div>
      </div>
      <p class="fine">Equity is your share of the pot if all cards are dealt with no more betting. ${r.exact ? '' : 'Simulated results are within about ±0.5%.'}</p>`;
  };
  try {
    const r = await calculateEquity(players, board, { iterations: 60000, isCancelled, onProgress: (_, partial) => draw(partial, false) });
    if (r) draw(r, true);
  } catch (e) {
    out.innerHTML = `<h2>Results</h2><p class="err">${esc(e.message)}</p>`;
  }
}
