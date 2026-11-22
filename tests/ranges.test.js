import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMBOS, HAND_CLASSES, classOf, compressRange, parseRange, rangeStats } from '../src/engine/ranges.js';
import { parseCards } from '../src/engine/cards.js';
import { SPOTS, PRESETS } from '../src/data/spots.js';

test('169 classes and 1,326 combos', () => {
  assert.equal(HAND_CLASSES.length, 169);
  assert.equal(
    Object.values(COMBOS).reduce((n, c) => n + c.length, 0),
    1326,
  );
});

test('parses common range notation', () => {
  const { map, errors } = parseRange('TT+, A2s+, KJo-K9o, 76s:50');
  assert.deepEqual(errors, []);
  assert.deepEqual([...map.keys()].filter((k) => k.length === 2).sort(), ['AA', 'JJ', 'KK', 'QQ', 'TT']);
  assert.equal(map.get('A2s'), 1);
  assert.equal(map.get('AKs'), 1);
  assert.ok(map.has('KTo') && !map.has('KQo'));
  assert.equal(map.get('76s'), 0.5);
});

test('reports tokens it cannot read', () => {
  assert.deepEqual(parseRange('AA, XYZ, AAs').errors, ['XYZ', 'AAs']);
});

test('compressRange round-trips', () => {
  const text = '22+,A2s+,KTs+,ATo-A8o,K9o:50,A5s:50';
  const once = parseRange(text).map;
  const again = parseRange(compressRange(once)).map;
  assert.deepEqual([...again].sort(), [...once].sort());
});

test('classOf names concrete hands', () => {
  const [a, b] = parseCards('AhKh');
  assert.equal(classOf(a, b), 'AKs');
  const [c, d] = parseCards('7d7c');
  assert.equal(classOf(c, d), '77');
});

test('every chart parses cleanly and opening ranges widen by position', () => {
  for (const s of SPOTS) {
    assert.deepEqual(parseRange(s.raise).errors, [], s.id + ' raise');
    assert.deepEqual(parseRange(s.call).errors, [], s.id + ' call');
    for (const f of Object.values(s.fr)) assert.ok(Math.abs(f[0] + f[1] + f[2] - 1) < 1e-9);
  }
  const width = (id) => rangeStats(PRESETS.find((p) => p.id === 'open-' + id).map).pct;
  assert.ok(width('UTG') < width('HJ') && width('HJ') < width('CO') && width('CO') < width('BTN'));
  assert.ok(width('UTG') > 15 && width('UTG') < 21);
  assert.ok(width('BTN') > 40 && width('BTN') < 50);
});
