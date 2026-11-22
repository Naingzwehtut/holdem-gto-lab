/**
 * Fast 5- to 7-card hand evaluator.
 *
 * `evaluate()` returns an integer where a higher value is a stronger hand.
 * Bits 20+ hold the category (0 = high card .. 8 = straight flush) and the
 * lower 20 bits hold up to five 4-bit tie-breaking ranks.
 */

const rankCount = new Int8Array(13);
const suitMask = new Int32Array(4);
const suitCount = new Int8Array(4);
const kickers = new Int8Array(7);

/** Highest card of a straight in a 13-bit rank mask, or -1. Handles the wheel. */
export function straightHigh(mask) {
  for (let h = 12; h >= 4; h--) {
    const need = 0x1f << (h - 4);
    if ((mask & need) === need) return h;
  }
  return (mask & 0x100f) === 0x100f ? 3 : -1;
}

function top5(mask) {
  let out = 0;
  let n = 0;
  for (let r = 12; r >= 0 && n < 5; r--) {
    if ((mask >> r) & 1) {
      out = (out << 4) | r;
      n++;
    }
  }
  return out;
}

/**
 * @param {ArrayLike<number>} cards card integers
 * @param {number} [n] number of cards to read (5..7)
 * @returns {number} comparable hand score
 */
export function evaluate(cards, n = cards.length) {
  rankCount.fill(0);
  suitMask.fill(0);
  suitCount.fill(0);
  let rankMask = 0;
  for (let i = 0; i < n; i++) {
    const c = cards[i];
    const r = c >> 2;
    const s = c & 3;
    rankCount[r]++;
    suitMask[s] |= 1 << r;
    suitCount[s]++;
    rankMask |= 1 << r;
  }

  let flush = -1;
  for (let s = 0; s < 4; s++) {
    if (suitCount[s] >= 5) {
      const h = straightHigh(suitMask[s]);
      if (h >= 0) return (8 << 20) | (h << 16);
      flush = (5 << 20) | top5(suitMask[s]);
    }
  }

  let quad = -1;
  let trip1 = -1;
  let trip2 = -1;
  let pair1 = -1;
  let pair2 = -1;
  let pair3 = -1;
  let nk = 0;
  for (let r = 12; r >= 0; r--) {
    const v = rankCount[r];
    if (v === 4) quad = r;
    else if (v === 3) {
      if (trip1 < 0) trip1 = r;
      else if (trip2 < 0) trip2 = r;
    } else if (v === 2) {
      if (pair1 < 0) pair1 = r;
      else if (pair2 < 0) pair2 = r;
      else if (pair3 < 0) pair3 = r;
    } else if (v === 1) kickers[nk++] = r;
  }

  if (quad >= 0) {
    let k = 0;
    for (let r = 12; r >= 0; r--) {
      if (r !== quad && rankCount[r]) {
        k = r;
        break;
      }
    }
    return (7 << 20) | (quad << 16) | (k << 12);
  }
  if (trip1 >= 0 && (trip2 >= 0 || pair1 >= 0)) {
    return (6 << 20) | (trip1 << 16) | (Math.max(trip2, pair1) << 12);
  }
  if (flush >= 0) return flush;
  const st = straightHigh(rankMask);
  if (st >= 0) return (4 << 20) | (st << 16);
  if (trip1 >= 0) return (3 << 20) | (trip1 << 16) | (kickers[0] << 12) | (kickers[1] << 8);
  if (pair2 >= 0) {
    const k = Math.max(pair3, nk ? kickers[0] : 0);
    return (2 << 20) | (pair1 << 16) | (pair2 << 12) | (k << 8);
  }
  if (pair1 >= 0) {
    return (1 << 20) | (pair1 << 16) | (kickers[0] << 12) | (kickers[1] << 8) | (kickers[2] << 4);
  }
  return (kickers[0] << 16) | (kickers[1] << 12) | (kickers[2] << 8) | (kickers[3] << 4) | kickers[4];
}

/** Category index (0..8) of a score returned by `evaluate`. */
export const categoryOf = (score) => score >> 20;
