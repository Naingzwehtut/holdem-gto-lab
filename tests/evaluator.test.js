import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORY_NAMES, parseCards } from '../src/engine/cards.js';
import { evaluate, categoryOf } from '../src/engine/evaluator.js';

const score = (s) => evaluate(parseCards(s));
const category = (s) => CATEGORY_NAMES[categoryOf(score(s))];

test('recognises every category', () => {
  assert.equal(category('AsKsQsJsTs'), 'Straight flush');
  assert.equal(category('AhAdAsAc2d'), 'Quads');
  assert.equal(category('KhKdKs2c2d'), 'Full house');
  assert.equal(category('2h7h9hJhKh'), 'Flush');
  assert.equal(category('Ah2d3c4s5h'), 'Straight');
  assert.equal(category('7h7d7s2c9d'), 'Trips');
  assert.equal(category('7h7d2s2c9d'), 'Two pair');
  assert.equal(category('7h7d3s2c9d'), 'Pair');
  assert.equal(category('7h8d3s2cKd'), 'High card');
});

test('wheel is the lowest straight', () => {
  assert.ok(score('Ah2d3c4s5h') < score('2h3d4c5s6h'));
});

test('picks the best five of seven cards', () => {
  assert.equal(category('9h8h7h6h5hAdAc'), 'Straight flush');
  assert.equal(category('2h5h9hJhKhQdTc'), 'Flush');
  assert.equal(score('KhKdKs9c9dQsQc'), score('KhKdKsQcQd2s3c'), 'best full house is kings full of queens');
});

test('kickers break ties', () => {
  assert.ok(score('KhKd9s9cAdQs2c') > score('KhKd9s9cQd2s3c'), 'two pair with ace kicker wins');
  assert.ok(score('AhAd9s7c4d') > score('AcAs9h7d3c'), 'pair of aces, fifth card decides');
  assert.equal(score('AhKdQs9c7d'), score('AcKsQh9d7c'), 'same ranks in different suits tie');
});

test('parseCards rejects bad input', () => {
  assert.equal(parseCards('AhAh'), null);
  assert.equal(parseCards('Zx'), null);
  assert.deepEqual(parseCards('10s 9s'), parseCards('Ts9s'));
});
