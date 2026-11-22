import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cardToString } from '../src/engine/cards.js';
import { gradePreflop, guessVillainPreset, heroDecisions, heroNet, parseHandHistories, sessionStats } from '../src/review/handHistory.js';

const read = (f) => readFileSync(new URL('../samples/' + f, import.meta.url), 'utf8');
const stars = parseHandHistories(read('pokerstars-6max.txt'));
const gg = parseHandHistories(read('ggpoker-6max.txt'));
const str = (cards) => cards.map(cardToString).join(' ');

test('splits and parses PokerStars hands', () => {
  assert.equal(stars.length, 3);
  const h = stars[0];
  assert.equal(h.site, 'PokerStars');
  assert.equal(h.hero, 'Hero');
  assert.equal(str(h.heroCards), 'Kh Qh');
  assert.equal(str(h.board), 'Qs 7h 2d 9c 3s');
  assert.equal(h.bb, 0.1);
  assert.equal(h.positions.Hero, 'BTN');
  assert.equal(h.positions.Villain6, 'BB');
  assert.equal(h.positions.Villain1, 'UTG');
  assert.equal(str(h.shown.Villain6), 'Qd 9d');
});

test('tracks the pot and the hero result', () => {
  const [h1, h2, h3] = stars;
  assert.ok(Math.abs(heroNet(h1) - -24.5) < 1e-9);
  assert.ok(Math.abs(heroNet(h2) - 3) < 1e-9, 'uncalled 3-bet is returned');
  assert.ok(Math.abs(heroNet(h3) - -2.5) < 1e-9);
});

test('grades preflop decisions against the charts', () => {
  const [h1, h2, h3] = stars;
  assert.deepEqual([gradePreflop(h1).spotId, gradePreflop(h1).grade], ['BTN', 'good']);
  assert.deepEqual([gradePreflop(h2).spotId, gradePreflop(h2).action, gradePreflop(h2).grade], ['BBvCO', 'raise', 'good']);
  assert.deepEqual([gradePreflop(h3).spotId, gradePreflop(h3).cls, gradePreflop(h3).grade], ['UTG', '98o', 'bad']);
});

test('extracts postflop decisions in big blinds', () => {
  const d = heroDecisions(stars[0]);
  assert.deepEqual(
    d.map((x) => x.street),
    ['flop', 'turn', 'river'],
  );
  const turn = d[1];
  assert.ok(Math.abs(turn.potBb - 9.1) < 1e-9);
  assert.ok(Math.abs(turn.betBb - 6.2) < 1e-9);
  assert.equal(guessVillainPreset(stars[0]), 'call-BBvBTN');
});

test('parses GGPoker hands', () => {
  assert.equal(gg.length, 1);
  const h = gg[0];
  assert.equal(h.site, 'GGPoker');
  assert.equal(str(h.heroCards), 'Jd Td');
  assert.equal(h.positions.Hero, 'BB');
  assert.equal(h.positions.e2b7c6f0, 'BTN');
  assert.ok(Math.abs(heroNet(h) - 8) < 1e-9);
  assert.equal(gradePreflop(h).spotId, 'BBvBTN');
  assert.equal(gradePreflop(h).action, 'call');
  const raise = heroDecisions(h).find((x) => x.verb === 'raises');
  assert.ok(Math.abs(raise.potBb - 5.6) < 1e-9);
  assert.ok(Math.abs(raise.betBb - 1.8) < 1e-9);
  assert.equal(guessVillainPreset(h), 'open-BTN');
});

test('session stats', () => {
  const s = sessionStats([...stars, ...gg]);
  assert.equal(s.hands, 4);
  assert.equal(s.graded, 4);
  assert.equal(s.correct, 3);
  assert.equal(s.vpip, 1);
});
