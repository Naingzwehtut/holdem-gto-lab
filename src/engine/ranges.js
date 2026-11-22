/**
 * Starting-hand classes (AA, AKs, AKo …) and range text.
 *
 * A range is a `Map<handClass, weight>` where weight is 0..1. The text format
 * is the one used by most poker tools: `22+, A2s+, KTo-K8o, A5s:50`.
 */
import { RANKS, card } from './cards.js';

/** Hand class shown in row i, column j of the standard 13×13 grid. */
export function cellClass(i, j) {
  const a = 12 - i;
  const b = 12 - j;
  if (i === j) return RANKS[a] + RANKS[a];
  if (j > i) return RANKS[a] + RANKS[b] + 's';
  return RANKS[b] + RANKS[a] + 'o';
}

/** All 169 classes in grid order. */
export const HAND_CLASSES = [];
for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) HAND_CLASSES.push(cellClass(i, j));

/** Every concrete two-card combo for each class. */
export const COMBOS = {};
for (const cls of HAND_CLASSES) {
  const a = RANKS.indexOf(cls[0]);
  const b = RANKS.indexOf(cls[1]);
  const out = [];
  if (cls.length === 2) {
    for (let s1 = 0; s1 < 4; s1++) for (let s2 = s1 + 1; s2 < 4; s2++) out.push([card(a, s1), card(a, s2)]);
  } else if (cls[2] === 's') {
    for (let s = 0; s < 4; s++) out.push([card(a, s), card(b, s)]);
  } else {
    for (let s1 = 0; s1 < 4; s1++) for (let s2 = 0; s2 < 4; s2++) if (s1 !== s2) out.push([card(a, s1), card(b, s2)]);
  }
  COMBOS[cls] = out;
}

export const comboCount = (cls) => (cls.length === 2 ? 6 : cls[2] === 's' ? 4 : 12);

/** Class of two concrete cards, e.g. [Ah, Kh] -> "AKs". */
export function classOf(c1, c2) {
  const r1 = c1 >> 2;
  const r2 = c2 >> 2;
  const hi = Math.max(r1, r2);
  const lo = Math.min(r1, r2);
  if (hi === lo) return RANKS[hi] + RANKS[hi];
  return RANKS[hi] + RANKS[lo] + ((c1 & 3) === (c2 & 3) ? 's' : 'o');
}

const RK = '[2-9TJQKA]';
const PAIR_PLUS = new RegExp(`^(${RK})\\1\\+$`);
const PAIR_SPAN = new RegExp(`^(${RK})\\1-(${RK})\\2$`);
const PAIR = new RegExp(`^(${RK})\\1$`);
const NONPAIR_PLUS = new RegExp(`^(${RK})(${RK})([SO])?\\+$`);
const NONPAIR_SPAN = new RegExp(`^(${RK})(${RK})([SO])?-(${RK})(${RK})([SO])?$`);
const NONPAIR = new RegExp(`^(${RK})(${RK})([SO])?$`);

/**
 * Parse range text. Later tokens override earlier ones.
 * @param {string} text
 * @returns {{ map: Map<string, number>, errors: string[] }}
 */
export function parseRange(text) {
  const map = new Map();
  const errors = [];
  const idx = (ch) => RANKS.indexOf(ch);
  const setNonPair = (hi, lo, type, w) => {
    for (const t of type ? [type.toLowerCase()] : ['s', 'o']) map.set(RANKS[hi] + RANKS[lo] + t, w);
  };

  for (const raw of String(text).split(/[\s,;]+/)) {
    if (!raw) continue;
    const parts = raw.split(':');
    let w = 1;
    if (parts.length > 1) {
      w = parseFloat(parts[1]);
      if (Number.isNaN(w) || w < 0) {
        errors.push(raw);
        continue;
      }
      if (w > 1) w /= 100;
      w = Math.min(1, w);
    }
    const tok = parts[0].toUpperCase().replace(/10/g, 'T');
    let m;
    if (/^(ANY|RANDOM|100%)$/.test(tok)) {
      for (const c of HAND_CLASSES) map.set(c, w);
    } else if ((m = tok.match(PAIR_PLUS))) {
      for (let r = idx(m[1]); r < 13; r++) map.set(RANKS[r] + RANKS[r], w);
    } else if ((m = tok.match(PAIR_SPAN))) {
      const [a, b] = [idx(m[1]), idx(m[2])].sort((x, y) => x - y);
      for (let r = a; r <= b; r++) map.set(RANKS[r] + RANKS[r], w);
    } else if ((m = tok.match(PAIR))) {
      map.set(m[1] + m[1], w);
    } else if ((m = tok.match(NONPAIR_PLUS))) {
      const [b, a] = [idx(m[1]), idx(m[2])].sort((x, y) => x - y);
      if (a === b) errors.push(raw);
      else for (let lo = b; lo < a; lo++) setNonPair(a, lo, m[3], w);
    } else if ((m = tok.match(NONPAIR_SPAN))) {
      const a = idx(m[1]);
      const b1 = idx(m[2]);
      const b2 = idx(m[5]);
      if (a !== idx(m[4]) || (m[3] || '') !== (m[6] || '') || b1 >= a || b2 >= a) errors.push(raw);
      else for (let lo = Math.min(b1, b2); lo <= Math.max(b1, b2); lo++) setNonPair(a, lo, m[3], w);
    } else if ((m = tok.match(NONPAIR))) {
      const [b, a] = [idx(m[1]), idx(m[2])].sort((x, y) => x - y);
      if (a === b) errors.push(raw);
      else setNonPair(a, b, m[3], w);
    } else {
      errors.push(raw);
    }
  }
  for (const [k, v] of map) if (v <= 0) map.delete(k);
  return { map, errors };
}

/** Turn a range map back into compact text such as "TT+,A2s+,KQo:50". */
export function compressRange(map) {
  const out = [];
  const tag = (w) => (w >= 0.999 ? '' : ':' + Math.round(w * 100));
  const get = (cls) => map.get(cls) || 0;
  const P = (r) => RANKS[r] + RANKS[r];

  for (let r = 12; r >= 0; ) {
    const w = get(P(r));
    if (!w) {
      r--;
      continue;
    }
    let b = r;
    while (b - 1 >= 0 && get(P(b - 1)) === w) b--;
    out.push((r === 12 && b < 12 ? P(b) + '+' : r === b ? P(r) : P(r) + '-' + P(b)) + tag(w));
    r = b - 1;
  }
  for (const t of ['s', 'o']) {
    for (let hi = 12; hi >= 1; hi--) {
      const n = (l) => RANKS[hi] + RANKS[l] + t;
      for (let lo = hi - 1; lo >= 0; ) {
        const w = get(n(lo));
        if (!w) {
          lo--;
          continue;
        }
        let b = lo;
        while (b - 1 >= 0 && get(n(b - 1)) === w) b--;
        out.push((lo === hi - 1 && b < lo ? n(b) + '+' : lo === b ? n(lo) : n(lo) + '-' + n(b)) + tag(w));
        lo = b - 1;
      }
    }
  }
  return out.join(',');
}

/** Weighted combo count and share of all 1,326 starting hands. */
export function rangeStats(map) {
  let combos = 0;
  for (const [cls, w] of map) combos += w * comboCount(cls);
  return { combos, pct: (combos / 1326) * 100 };
}
