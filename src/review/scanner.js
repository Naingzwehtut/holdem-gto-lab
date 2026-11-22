/**
 * Screenshot card scanner for post-session review.
 *
 * Reads a still image the user uploads (a screenshot of a finished hand) and
 * finds the cards in it with classic computer vision, entirely in the browser:
 *
 *   1. Mask bright, unsaturated pixels and group them into connected regions
 *      (card faces).
 *   2. Inside each region, mask the "ink" (rank and suit glyphs) and find the
 *      corner indices near the top edge. Fanned hole cards that overlap still
 *      show each corner index, so one region can yield several cards.
 *   3. Identify the rank by normalized cross-correlation against glyphs
 *      rendered in common fonts, and the suit by ink colour (four-colour decks)
 *      plus the shape of the suit glyph.
 *   4. Group cards into rows: a row of 3-5 is the board, the lowest pair is
 *      the hero's hand.
 *
 * It deliberately works on uploaded images only. It does not capture the
 * screen or watch a running poker client.
 */
import { RANKS, card } from '../engine/cards.js';

export const GLYPH_W = 16;
export const GLYPH_H = 24;

export const luminance = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

export function isCardWhite(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mn > 190 && mx - mn < 45;
}

export function isInk(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return luminance(r, g, b) < 170 || mx - mn > 80;
}

/** Colour family of a suit/rank glyph. */
export function classifyColor(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx < 100 || mx - mn < 40) return 'black';
  if (r > g + 50 && r > b + 50) return 'red';
  if (b > r + 30 && b >= g) return 'blue';
  if (g > r + 30 && g > b) return 'green';
  return 'unknown';
}

/** Suits a colour allows: red→♥♦, black→♠♣, and four-colour blue→♦, green→♣. */
export function suitsForColor(color) {
  return { red: [1, 2], black: [0, 3], blue: [2], green: [3] }[color] || [0, 1, 2, 3];
}

/**
 * 4-connected components of a binary mask.
 * @param {Uint8Array} mask
 * @param {number} w
 * @param {number} h
 * @returns {{ comps: {id:number,x0:number,y0:number,x1:number,y1:number,w:number,h:number,area:number}[], label: Int32Array }}
 */
export function findComponents(mask, w, h) {
  const label = new Int32Array(w * h).fill(-1);
  const stack = new Int32Array(w * h);
  const comps = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || label[i] >= 0) continue;
    const id = comps.length;
    let sp = 0;
    stack[sp++] = i;
    label[i] = id;
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    let area = 0;
    while (sp) {
      const p = stack[--sp];
      const x = p % w;
      const y = (p / w) | 0;
      area++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0 && mask[p - 1] && label[p - 1] < 0) (label[p - 1] = id), (stack[sp++] = p - 1);
      if (x < w - 1 && mask[p + 1] && label[p + 1] < 0) (label[p + 1] = id), (stack[sp++] = p + 1);
      if (y > 0 && mask[p - w] && label[p - w] < 0) (label[p - w] = id), (stack[sp++] = p - w);
      if (y < h - 1 && mask[p + w] && label[p + w] < 0) (label[p + w] = id), (stack[sp++] = p + w);
    }
    comps.push({ id, x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, area });
  }
  return { comps, label };
}

/** Resample the masked pixels inside `box` to a zero-mean, unit-length GLYPH_W×GLYPH_H vector. */
export function vectorize(mask, maskW, box) {
  const v = new Float32Array(GLYPH_W * GLYPH_H);
  for (let gy = 0; gy < GLYPH_H; gy++) {
    const sy0 = box.y0 + (gy * box.h) / GLYPH_H;
    const sy1 = box.y0 + ((gy + 1) * box.h) / GLYPH_H;
    for (let gx = 0; gx < GLYPH_W; gx++) {
      const sx0 = box.x0 + (gx * box.w) / GLYPH_W;
      const sx1 = box.x0 + ((gx + 1) * box.w) / GLYPH_W;
      let sum = 0;
      let n = 0;
      for (let y = Math.floor(sy0); y < Math.max(Math.ceil(sy1), Math.floor(sy0) + 1); y++) {
        for (let x = Math.floor(sx0); x < Math.max(Math.ceil(sx1), Math.floor(sx0) + 1); x++) {
          sum += mask[y * maskW + x] ? 1 : 0;
          n++;
        }
      }
      v[gy * GLYPH_W + gx] = sum / n;
    }
  }
  let mean = 0;
  for (const x of v) mean += x;
  mean /= v.length;
  let norm = 0;
  for (let i = 0; i < v.length; i++) {
    v[i] -= mean;
    norm += v[i] * v[i];
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

export function correlation(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * Best template for a glyph; aspect-ratio mismatch is penalised.
 * `margin` is how far the best key beats the best different key (Infinity when only one key competes).
 */
export function matchGlyph(vec, aspect, templates, allowedKeys) {
  const perKey = new Map();
  for (const t of templates) {
    if (allowedKeys && !allowedKeys.includes(t.key)) continue;
    const score = correlation(vec, t.vec) - 0.35 * Math.abs(Math.log(aspect / t.aspect));
    if (!perKey.has(t.key) || score > perKey.get(t.key)) perKey.set(t.key, score);
  }
  const ranked = [...perKey].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return { key: null, score: -Infinity, margin: 0 };
  return { key: ranked[0][0], score: ranked[0][1], margin: ranked.length > 1 ? ranked[0][1] - ranked[1][1] : Infinity };
}

/**
 * Split detected cards into board and hero hand by screen position.
 * @param {{x:number,y:number,w:number,h:number}[]} cards
 * @param {number} imageHeight
 */
export function assignRoles(cards, imageHeight) {
  const rows = [];
  for (const c of [...cards].sort((a, b) => a.y - b.y)) {
    const row = rows.find((r) => Math.abs(r.y - c.y) < c.h * 0.5);
    if (row) row.cards.push(c);
    else rows.push({ y: c.y, cards: [c] });
  }
  rows.forEach((r) => r.cards.sort((a, b) => a.x - b.x));
  const mid = imageHeight / 2;
  const boardRow = rows
    .filter((r) => r.cards.length >= 3 && r.cards.length <= 5)
    .sort((a, b) => Math.abs(a.y - mid) - Math.abs(b.y - mid))[0];
  const heroRow = rows.filter((r) => r !== boardRow && r.cards.length === 2).sort((a, b) => b.y - a.y)[0];
  return {
    board: boardRow ? boardRow.cards : [],
    hero: heroRow ? heroRow.cards : [],
    others: rows.filter((r) => r !== boardRow && r !== heroRow).flatMap((r) => r.cards),
  };
}

/* ---------------- browser-only part ---------------- */

const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'T'];
const rankIndex = (label) => (label === '10' ? 8 : RANKS.indexOf(label));
const SUIT_GLYPHS = ['♠︎', '♥︎', '♦︎', '♣︎'];
const FONTS = [
  'Arial',
  'Helvetica',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'Segoe UI',
  'Roboto',
  'Georgia',
  'Times New Roman',
  'sans-serif',
  'serif',
];

let cachedTemplates = null;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function renderTemplate(text, font) {
  const S = 120;
  const cv = makeCanvas(S, S);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#000';
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, S / 2, S / 2);
  const { data } = ctx.getImageData(0, 0, S, S);
  const mask = new Uint8Array(S * S);
  let x0 = S;
  let y0 = S;
  let x1 = -1;
  let y1 = -1;
  for (let i = 0; i < S * S; i++) {
    if (isInk(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])) {
      mask[i] = 1;
      const x = i % S;
      const y = (i / S) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  const box = { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  return { vec: vectorize(mask, S, box), aspect: box.w / box.h };
}

/** Render rank and suit templates once per page. */
export function buildTemplates() {
  if (cachedTemplates) return cachedTemplates;
  const ranks = [];
  const suits = [];
  for (const family of FONTS) {
    for (const weight of ['bold', 'normal']) {
      const font = `${weight} 80px "${family}"`;
      for (const label of RANK_LABELS) {
        const t = renderTemplate(label, font);
        if (t) ranks.push({ key: rankIndex(label), ...t });
      }
      SUIT_GLYPHS.forEach((g, s) => {
        const t = renderTemplate(g, font);
        if (t) suits.push({ key: s, ...t });
      });
    }
  }
  cachedTemplates = { ranks, suits };
  return cachedTemplates;
}

function readRegion(data, W, region, templates) {
  const { x0: rx, y0: ry, w: rw, h: rh } = region;
  const ink = new Uint8Array(rw * rh);
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const p = ((ry + y) * W + rx + x) * 4;
      ink[y * rw + x] = isInk(data[p], data[p + 1], data[p + 2]) ? 1 : 0;
    }
  }
  const comps = findComponents(ink, rw, rh).comps.filter((c) => c.area >= 6 && c.x0 > 0 && c.y0 > 0 && c.x1 < rw - 1 && c.y1 < rh - 1);

  const sorted = comps.filter((c) => c.h >= rh * 0.1 && c.h <= rh * 0.42 && c.y0 <= rh * 0.3).sort((a, b) => a.x0 - b.x0);
  const glyphs = [];
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    const n = sorted[i + 1];
    // "10" is drawn as two components side by side
    if (n && c.w < 0.5 * c.h && Math.abs(c.y0 - n.y0) < 0.2 * c.h && n.h / c.h > 0.75 && n.h / c.h < 1.33 && n.x0 - c.x1 < 0.5 * c.h) {
      glyphs.push({ x0: c.x0, y0: Math.min(c.y0, n.y0), x1: n.x1, y1: Math.max(c.y1, n.y1), parts: [c, n] });
      i++;
    } else glyphs.push({ x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, parts: [c] });
  }

  const found = [];
  for (const g of glyphs) {
    const box = { x0: g.x0, y0: g.y0, w: g.x1 - g.x0 + 1, h: g.y1 - g.y0 + 1 };
    const rankMatch = matchGlyph(vectorize(ink, rw, box), box.w / box.h, templates.ranks);
    if (rankMatch.score < 0.5) continue;
    if (found.some((f) => Math.abs(f.gx - g.x0) < rh * 0.22)) continue;

    // colour of the rank ink
    let r = 0;
    let gg = 0;
    let b = 0;
    let n = 0;
    for (let y = g.y0; y <= g.y1; y++) {
      for (let x = g.x0; x <= g.x1; x++) {
        if (!ink[y * rw + x]) continue;
        const p = ((ry + y) * W + rx + x) * 4;
        r += data[p];
        gg += data[p + 1];
        b += data[p + 2];
        n++;
      }
    }
    const color = classifyColor(r / n, gg / n, b / n);
    const allowed = suitsForColor(color);

    // suit glyph: directly below the rank, else to its right
    const gh = box.h;
    const below = comps
      .filter(
        (c) =>
          !g.parts.includes(c) &&
          c.y0 >= g.y1 - 2 &&
          c.y0 < g.y1 + 1.3 * gh &&
          c.x1 >= g.x0 - 0.4 * gh &&
          c.x0 <= g.x1 + 0.4 * gh &&
          c.h >= 0.3 * gh &&
          c.h <= 1.6 * gh,
      )
      .sort((a, c) => a.y0 - c.y0);
    const right = comps
      .filter(
        (c) =>
          !g.parts.includes(c) &&
          c.x0 > g.x1 &&
          c.x0 < g.x1 + gh &&
          Math.abs((c.y0 + c.y1) / 2 - (g.y0 + g.y1) / 2) < 0.6 * gh &&
          c.h >= 0.3 * gh,
      )
      .sort((a, c) => a.x0 - c.x0);
    const suitComp = below[0] || right[0];
    let suit = allowed[0];
    let suitScore = allowed.length === 1 ? 0.6 : 0.2;
    // Colour already narrows the suit to one (four-colour deck) or two; the shape only has to split those.
    let suitSure = allowed.length === 1;
    if (suitComp) {
      const sbox = { x0: suitComp.x0, y0: suitComp.y0, w: suitComp.w, h: suitComp.h };
      const sm = matchGlyph(vectorize(ink, rw, sbox), sbox.w / sbox.h, templates.suits, allowed);
      if (sm.key != null) {
        suit = sm.key;
        suitScore = sm.score;
        suitSure = suitSure || (sm.score >= 0.35 && sm.margin >= 0.08);
      }
    }

    found.push({
      gx: g.x0,
      rank: rankMatch.key,
      suit,
      color,
      rankScore: rankMatch.score,
      suitScore,
      confident: rankMatch.score >= 0.7 && rankMatch.margin >= 0.05 && suitSure,
      x: rx + Math.max(0, g.x0 - box.w * 0.5),
      y: ry,
      w: Math.min(rh * 0.72, rw),
      h: rh,
    });
  }
  return found.map((f) => ({ ...f, card: card(f.rank, f.suit) }));
}

/**
 * Scan an image (HTMLImageElement, ImageBitmap or canvas) for playing cards.
 * @returns {Promise<{ width:number, height:number, canvas:HTMLCanvasElement, cards:object[], board:object[], hero:object[], others:object[] }>}
 */
export async function scanImage(source, { maxWidth = 1600 } = {}) {
  const templates = buildTemplates();
  const sw = source.naturalWidth || source.width;
  const sh = source.naturalHeight || source.height;
  const scale = Math.min(1, maxWidth / sw);
  const W = Math.round(sw * scale);
  const H = Math.round(sh * scale);
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);

  const white = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) white[i] = isCardWhite(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) ? 1 : 0;
  const regions = findComponents(white, W, H).comps.filter(
    (c) => c.h >= H * 0.035 && c.h <= H * 0.5 && c.w >= c.h * 0.4 && c.w <= c.h * 3.5 && c.area / (c.w * c.h) > 0.5,
  );

  const cards = [];
  for (const region of regions) {
    await new Promise((r) => setTimeout(r, 0));
    cards.push(...readRegion(data, W, region, templates));
  }
  // drop duplicate cards, keeping the most confident read
  const unique = [];
  for (const c of cards.sort((a, b) => b.rankScore + b.suitScore - (a.rankScore + a.suitScore))) {
    if (!unique.some((u) => u.card === c.card)) unique.push(c);
  }
  return { width: W, height: H, canvas, cards: unique, ...assignRoles(unique, H) };
}

/**
 * Draw a fake table screenshot. Used by the demo button and the browser test,
 * so the scanner can be tried without a real screenshot.
 */
export function drawDemoTable(canvas, { hero, board, fourColor = true }) {
  const W = 1280;
  const H = 720;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#14191f';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#3b2a20';
  ctx.beginPath();
  ctx.ellipse(W / 2, H / 2, 560, 290, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1f5a46';
  ctx.beginPath();
  ctx.ellipse(W / 2, H / 2, 530, 262, 0, 0, Math.PI * 2);
  ctx.fill();

  const colors = fourColor ? ['#111111', '#d0302a', '#1f5dc6', '#1d873c'] : ['#111111', '#d0302a', '#d0302a', '#111111'];
  const symbols = ['♠︎', '♥︎', '♦︎', '♣︎'];
  const cw = 72;
  const ch = 100;
  const drawCard = (c, x, y) => {
    const r = c >> 2;
    const s = c & 3;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(x, y, cw, ch, 7);
    ctx.fill();
    ctx.strokeStyle = '#9aa0a6';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = colors[s];
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.font = 'bold 30px Arial';
    ctx.fillText(r === 8 ? '10' : RANKS[r], x + 7, y + 7);
    ctx.font = '24px Arial';
    ctx.fillText(symbols[s], x + 9, y + 42);
    ctx.font = '40px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(symbols[s], x + cw * 0.62, y + ch * 0.55);
  };

  ctx.fillStyle = '#ffffff';
  ctx.font = '600 22px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Pot: 9.1 BB', W / 2, 250);
  const bx = W / 2 - (5 * cw + 4 * 10) / 2;
  board.forEach((c, i) => drawCard(c, bx + i * (cw + 10), 280));

  const seats = [
    [W / 2, 640, 'Hero  100 BB'],
    [190, 470, 'Villain1  88 BB'],
    [190, 200, 'Villain2  124 BB'],
    [W / 2, 90, 'Villain3  98 BB'],
    [W - 190, 200, 'Villain5  100 BB'],
    [W - 190, 470, 'Villain6  152 BB'],
  ];
  for (const [x, y, label] of seats) {
    ctx.fillStyle = '#0c0f13';
    ctx.beginPath();
    ctx.roundRect(x - 90, y - 24, 180, 44, 22);
    ctx.fill();
    ctx.fillStyle = '#f2f2f2';
    ctx.font = '600 17px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y + 5);
  }
  hero.forEach((c, i) => drawCard(c, W / 2 - 60 + i * 44, 500));
}
