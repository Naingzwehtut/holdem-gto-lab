/** Small DOM and formatting helpers shared by every view. */
import { RANKS, SUIT_SYMBOLS, cardToString } from '../engine/cards.js';
import { rangeStats } from '../engine/ranges.js';
import { PRESETS } from '../data/spots.js';

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
export const pct = (x, digits = 1) => (x * 100).toFixed(digits) + '%';
export const fmt = (x) => (Math.round(x * 100) / 100).toString();
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function cardHTML(c, cls = '') {
  if (c == null) return `<span class="pc empty ${cls}"></span>`;
  return `<span class="pc s${c & 3} ${cls}" aria-label="${cardToString(c)}"><b>${RANKS[c >> 2]}</b><i>${SUIT_SYMBOLS[c & 3]}</i></span>`;
}
export const cardsHTML = (arr, cls = '') => `<span class="cards">${arr.map((c) => cardHTML(c, cls)).join('')}</span>`;

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function presetOptions(selected) {
  return (
    `<option value="custom">Custom range</option>` +
    PRESETS.map(
      (p) =>
        `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${esc(p.label)} · ${rangeStats(p.map).pct.toFixed(0)}%</option>`,
    ).join('')
  );
}

/** Cell background showing raise / call / fold frequencies left to right. */
export function freqBackground(f) {
  if (f[2] >= 0.999) return '';
  const r = f[0] * 100;
  const c = r + f[1] * 100;
  return `background:linear-gradient(to right,var(--raise) 0 ${r}%,var(--call) ${r}% ${c}%,var(--fold) ${c}% 100%)`;
}

export function freqBars(spot, f) {
  const rows = [[spot.raiseName, 'raise', f[0]], ...(spot.callEff.size ? [['Call', 'call', f[1]]] : []), ['Fold', 'fold', f[2]]];
  return `<div class="freqs">${rows
    .map(
      ([n, v, x]) =>
        `<div class="freq"><span>${n}</span><span class="track"><span style="width:${x * 100}%;background:var(--${v})"></span></span><span class="v">${pct(x, 0)}</span></div>`,
    )
    .join('')}</div>`;
}

const STORE_KEY = 'holdem-gto-lab.v1';
export function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch {
    return {};
  }
}
export function saveStore(value) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable: scores just won't persist */
  }
}

/** Monotonic job counter so a newer calculation can cancel an older one. */
export function jobCounter() {
  let current = 0;
  return () => {
    const id = ++current;
    return () => id !== current;
  };
}
