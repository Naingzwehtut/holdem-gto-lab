import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCards } from '../src/engine/cards.js';
import { parseRange } from '../src/engine/ranges.js';
import { calculateEquity, equityVsRangeExact, rangeBreakdown } from '../src/engine/equity.js';

const C = parseCards;
const eq0 = (r) => r.eq[0] / r.total;

test('AA vs KK preflop is about 82%', async () => {
  const r = await calculateEquity([{ cards: C('AsAh') }, { cards: C('KsKh') }], [], { iterations: 60000 });
  assert.ok(Math.abs(eq0(r) - 0.82) < 0.015, eq0(r));
});

test('flop with two known hands is enumerated exactly', async () => {
  const r = await calculateEquity([{ cards: C('AhKh') }, { cards: C('7c7d') }], C('Qh7h2c'));
  assert.equal(r.exact, true);
  assert.equal(r.total, 990);
  const again = await calculateEquity([{ cards: C('AhKh') }, { cards: C('7c7d') }], C('Qh7h2c'));
  assert.equal(eq0(r), eq0(again));
});

test('river result is all or nothing', async () => {
  const r = await calculateEquity([{ cards: C('AhAd') }, { cards: C('KcKd') }], C('2s7h9cJdQs'));
  assert.equal(eq0(r), 1);
});

test('equity versus a range and a random hand', async () => {
  const r = await calculateEquity([{ cards: C('AsAh') }, { random: true }], [], { iterations: 60000 });
  assert.ok(Math.abs(eq0(r) - 0.852) < 0.015, eq0(r));
  const vsRange = await calculateEquity([{ cards: C('AsKs') }, { map: parseRange('QQ').map }], [], { iterations: 60000 });
  assert.ok(Math.abs(eq0(vsRange) - 0.46) < 0.02, eq0(vsRange));
});

test('exact turn equity vs range and range breakdown', () => {
  const map = parseRange('AA,KK,QQ,AQ').map;
  const e = equityVsRangeExact(C('KhQh'), C('Qs7h2d9c'), map);
  assert.ok(e > 0 && e < 1);
  const bd = rangeBreakdown(C('KhQh'), C('Qs7h2d9c'), map);
  assert.ok(Math.abs(bd.ahead + bd.tie + bd.behind - 1) < 1e-9);
  assert.ok(bd.behind > 0.5, 'sets and overpairs dominate this range');
});
