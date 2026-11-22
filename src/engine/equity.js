/**
 * Equity calculation: exact enumeration where it is cheap, Monte Carlo otherwise.
 */
import { evaluate } from './evaluator.js';
import { COMBOS } from './ranges.js';

const yieldToEventLoop = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Flatten a weighted range into combos that avoid dead cards, with a cumulative weight table. */
export function prepareRange(map, dead) {
  const list = [];
  const cum = [];
  let total = 0;
  for (const [cls, w] of map) {
    if (w <= 0) continue;
    for (const [a, b] of COMBOS[cls]) {
      if (dead[a] || dead[b]) continue;
      total += w;
      list.push(a, b);
      cum.push(total);
    }
  }
  return { list, cum, total };
}

function sampleCombo(prepared, used) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const x = Math.random() * prepared.total;
    let lo = 0;
    let hi = prepared.cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (prepared.cum[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    if (!used[prepared.list[2 * lo]] && !used[prepared.list[2 * lo + 1]]) return lo;
  }
  return -1;
}

/**
 * @typedef {{ cards: number[], name?: string } | { map: Map<string, number>, name?: string } | { random: true, name?: string }} Player
 * @typedef {{ eq: Float64Array, win: Float64Array, tie: Float64Array, cats: Float64Array, total: number, exact: boolean }} EquityResult
 */

/**
 * Equity for 2..6 players. Each player holds exact cards, a weighted range or a random hand.
 * Enumerates exactly when every player has exact cards and at most two board cards remain.
 *
 * @param {Player[]} players
 * @param {number[]} board 0, 3, 4 or 5 known cards
 * @param {{ iterations?: number, isCancelled?: () => boolean, onProgress?: (fraction: number, partial: EquityResult) => void }} [options]
 * @returns {Promise<EquityResult | null>} null when cancelled
 */
export async function calculateEquity(players, board, options = {}) {
  const { iterations = 60000, isCancelled, onProgress } = options;
  const n = players.length;
  const dead = new Uint8Array(52);
  for (const c of board) dead[c] = 1;
  for (const p of players) if (p.cards) for (const c of p.cards) dead[c] = 1;

  const prepared = players.map((p, i) => {
    if (!p.map) return null;
    const pr = prepareRange(p.map, dead);
    if (!pr.total) throw new Error(`${p.name || 'Player ' + (i + 1)} has no hands left in range after card removal.`);
    return pr;
  });

  const res = {
    eq: new Float64Array(n),
    win: new Float64Array(n),
    tie: new Float64Array(n),
    cats: new Float64Array(9),
    total: 0,
    exact: false,
  };
  const buf = new Array(7);
  const scores = new Int32Array(n);
  const holes = new Int32Array(n * 2);
  const bd = new Int32Array(5);

  const settle = () => {
    let best = -1;
    let count = 0;
    for (let i = 0; i < n; i++) {
      buf[0] = holes[2 * i];
      buf[1] = holes[2 * i + 1];
      for (let k = 0; k < 5; k++) buf[2 + k] = bd[k];
      const s = evaluate(buf, 7);
      scores[i] = s;
      if (s > best) {
        best = s;
        count = 1;
      } else if (s === best) count++;
    }
    res.cats[scores[0] >> 20]++;
    for (let i = 0; i < n; i++) {
      if (scores[i] === best) {
        res.eq[i] += 1 / count;
        if (count === 1) res.win[i]++;
        else res.tie[i]++;
      }
    }
    res.total++;
  };

  board.forEach((c, k) => (bd[k] = c));
  const need = 5 - board.length;

  if (players.every((p) => p.cards) && need <= 2) {
    players.forEach((p, i) => {
      holes[2 * i] = p.cards[0];
      holes[2 * i + 1] = p.cards[1];
    });
    const deck = [];
    for (let c = 0; c < 52; c++) if (!dead[c]) deck.push(c);
    if (need === 0) settle();
    else if (need === 1) {
      for (const c of deck) {
        bd[4] = c;
        settle();
      }
    } else {
      for (let a = 0; a < deck.length; a++) {
        for (let b = a + 1; b < deck.length; b++) {
          bd[3] = deck[a];
          bd[4] = deck[b];
          settle();
        }
      }
    }
    res.exact = true;
    return res;
  }

  const used = new Uint8Array(52);
  let failures = 0;
  for (let it = 0; it < iterations; it++) {
    if (it && it % 3000 === 0) {
      await yieldToEventLoop();
      if (isCancelled && isCancelled()) return null;
      if (onProgress) onProgress(it / iterations, res);
    }
    used.set(dead);
    let ok = true;
    for (let i = 0; i < n; i++) {
      const p = players[i];
      if (p.cards) {
        holes[2 * i] = p.cards[0];
        holes[2 * i + 1] = p.cards[1];
      } else if (prepared[i]) {
        const k = sampleCombo(prepared[i], used);
        if (k < 0) {
          ok = false;
          break;
        }
        const a = prepared[i].list[2 * k];
        const b = prepared[i].list[2 * k + 1];
        holes[2 * i] = a;
        holes[2 * i + 1] = b;
        used[a] = used[b] = 1;
      } else {
        let a;
        let b;
        do a = (Math.random() * 52) | 0;
        while (used[a]);
        used[a] = 1;
        do b = (Math.random() * 52) | 0;
        while (used[b]);
        used[b] = 1;
        holes[2 * i] = a;
        holes[2 * i + 1] = b;
      }
    }
    if (!ok) {
      if (++failures > iterations) break;
      it--;
      continue;
    }
    for (let k = board.length; k < 5; k++) {
      let c;
      do c = (Math.random() * 52) | 0;
      while (used[c]);
      used[c] = 1;
      bd[k] = c;
    }
    settle();
  }
  if (!res.total) throw new Error('These ranges collide on every deal. Widen one of them.');
  return res;
}

/** Exact equity of a hand against a weighted range on the turn or river. */
export function equityVsRangeExact(hero, board, map) {
  const dead = new Uint8Array(52);
  [...hero, ...board].forEach((c) => (dead[c] = 1));
  const pr = prepareRange(map, dead);
  if (!pr.total) return null;
  const h = new Array(7);
  const v = new Array(7);
  h[0] = hero[0];
  h[1] = hero[1];
  board.forEach((c, i) => {
    h[2 + i] = c;
    v[2 + i] = c;
  });
  let eq = 0;
  let totalWeight = 0;
  for (let k = 0; k < pr.cum.length; k++) {
    const w = pr.cum[k] - (k ? pr.cum[k - 1] : 0);
    const a = pr.list[2 * k];
    const b = pr.list[2 * k + 1];
    v[0] = a;
    v[1] = b;
    if (board.length === 5) {
      const hs = evaluate(h, 7);
      const vs = evaluate(v, 7);
      eq += w * (hs > vs ? 1 : hs === vs ? 0.5 : 0);
    } else {
      let e = 0;
      let count = 0;
      for (let c = 0; c < 52; c++) {
        if (dead[c] || c === a || c === b) continue;
        h[6] = v[6] = c;
        const hs = evaluate(h, 7);
        const vs = evaluate(v, 7);
        e += hs > vs ? 1 : hs === vs ? 0.5 : 0;
        count++;
      }
      eq += (w * e) / count;
    }
    totalWeight += w;
  }
  return eq / totalWeight;
}

/**
 * What a range holds on the current board, and how much of it is ahead of `hero` right now.
 * Shares are fractions of the weighted combos left after card removal.
 */
export function rangeBreakdown(hero, board, map) {
  const dead = new Uint8Array(52);
  [...hero, ...board].forEach((c) => (dead[c] = 1));
  const pr = prepareRange(map, dead);
  if (!pr.total) return null;
  const n = 2 + board.length;
  const h = [...hero, ...board];
  const v = [0, 0, ...board];
  const heroScore = evaluate(h, n);
  const cats = new Float64Array(9);
  const beat = new Float64Array(9);
  let ahead = 0;
  let tie = 0;
  let behind = 0;
  for (let k = 0; k < pr.cum.length; k++) {
    const w = pr.cum[k] - (k ? pr.cum[k - 1] : 0);
    v[0] = pr.list[2 * k];
    v[1] = pr.list[2 * k + 1];
    const s = evaluate(v, n);
    const cat = s >> 20;
    cats[cat] += w;
    if (s < heroScore) ahead += w;
    else if (s === heroScore) tie += w;
    else {
      behind += w;
      beat[cat] += w;
    }
  }
  const T = pr.total;
  return {
    heroCat: heroScore >> 20,
    cats: [...cats].map((x) => x / T),
    beat: [...beat].map((x) => x / T),
    ahead: ahead / T,
    tie: tie / T,
    behind: behind / T,
    combos: T,
  };
}
