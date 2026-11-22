/**
 * Card primitives.
 *
 * A card is an integer 0..51: `rank * 4 + suit`.
 * Ranks run 0 (deuce) .. 12 (ace); suits are spades, hearts, diamonds, clubs.
 */

export const RANKS = '23456789TJQKA';
export const SUITS = 'shdc';
export const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣'];
export const CATEGORY_NAMES = ['High card', 'Pair', 'Two pair', 'Trips', 'Straight', 'Flush', 'Full house', 'Quads', 'Straight flush'];

export const card = (rank, suit) => rank * 4 + suit;
export const rankOf = (c) => c >> 2;
export const suitOf = (c) => c & 3;
export const cardToString = (c) => RANKS[c >> 2] + SUITS[c & 3];

/**
 * Parse a string such as "AhKd", "Ah Kd" or "10s 9s" into card integers.
 * Returns null when the text is malformed or repeats a card.
 * @param {string} text
 * @returns {number[] | null}
 */
export function parseCards(text) {
  const s = String(text)
    .replace(/10/g, 'T')
    .replace(/[\s,[\]]/g, '');
  if (s.length % 2) return null;
  const out = [];
  for (let i = 0; i < s.length; i += 2) {
    const r = RANKS.indexOf(s[i].toUpperCase());
    const su = SUITS.indexOf(s[i + 1].toLowerCase());
    if (r < 0 || su < 0) return null;
    const c = card(r, su);
    if (out.includes(c)) return null;
    out.push(c);
  }
  return out;
}
