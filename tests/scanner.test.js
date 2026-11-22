import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignRoles, classifyColor, correlation, findComponents, isCardWhite, suitsForColor, vectorize } from '../src/review/scanner.js';

test('classifies glyph colours for two- and four-colour decks', () => {
  assert.equal(classifyColor(20, 20, 25), 'black');
  assert.equal(classifyColor(208, 47, 42), 'red');
  assert.equal(classifyColor(31, 93, 198), 'blue');
  assert.equal(classifyColor(29, 135, 60), 'green');
  assert.deepEqual(suitsForColor('red'), [1, 2]);
  assert.deepEqual(suitsForColor('green'), [3]);
  assert.ok(isCardWhite(250, 250, 248));
  assert.ok(!isCardWhite(31, 90, 70));
});

test('finds connected components', () => {
  const w = 8;
  const h = 5;
  const mask = new Uint8Array(w * h);
  // two blobs: a 2x2 square and an L shape
  for (const [x, y] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
    [5, 2],
    [5, 3],
    [6, 3],
    [7, 3],
  ])
    mask[y * w + x] = 1;
  const { comps } = findComponents(mask, w, h);
  assert.equal(comps.length, 2);
  assert.deepEqual(comps.map((c) => c.area).sort(), [4, 4]);
  assert.deepEqual([comps[1].x0, comps[1].y0, comps[1].w, comps[1].h], [5, 2, 3, 2]);
});

test('glyph vectors are normalised and self-similar', () => {
  const w = 10;
  const mask = new Uint8Array(w * w);
  for (let i = 0; i < 10; i++) mask[i * w + 4] = mask[i * w + 5] = 1; // vertical bar
  const v = vectorize(mask, w, { x0: 0, y0: 0, w: 10, h: 10 });
  assert.ok(Math.abs(correlation(v, v) - 1) < 1e-5);
  const flat = new Uint8Array(w * w);
  for (let i = 0; i < 10; i++) flat[4 * w + i] = flat[5 * w + i] = 1; // horizontal bar
  const u = vectorize(flat, w, { x0: 0, y0: 0, w: 10, h: 10 });
  assert.ok(correlation(v, u) < 0.2);
});

test('assigns board and hero cards by position', () => {
  const at = (x, y) => ({ x, y, w: 70, h: 100 });
  const board = [at(400, 280), at(480, 280), at(560, 280), at(640, 280), at(720, 280)];
  const hero = [at(580, 500), at(624, 500)];
  const other = [at(100, 120), at(144, 120)];
  const r = assignRoles([...hero, ...other, ...board], 720);
  assert.deepEqual(r.board, board);
  assert.deepEqual(r.hero, hero);
  assert.deepEqual(r.others, other);
});
