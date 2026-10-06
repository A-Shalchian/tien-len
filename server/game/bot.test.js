import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identifyCombo } from './validator.js';
import { findBotPlay, planHand } from './bot.js';

const card = (id) => ({ rank: id.slice(0, -1), suit: id.slice(-1), id });
const cards = (ids) => ids.split(' ').map(card);
const ids = (combo) => combo.cards.map((c) => c.id).join(' ');
const many = { opponents: [13, 13, 13] };

test('keeps straights and pairs together when planning', () => {
  const plan = planHand(cards('3C 4D 5S 9C 9H KS'));
  const types = plan.map((u) => u.type).sort();
  assert.deepEqual(types, ['pair', 'sequence', 'single']);
});

test('leads the weakest combo and holds 2s', () => {
  const play = findBotPlay(cards('4C 9H 9S 2H'), null, many);
  assert.equal(ids(play), '4C');
});

test('does not waste a 2 on a low single early', () => {
  assert.equal(findBotPlay(cards('2S 4C 5D 6H 8C 9D JS QH KD'), identifyCombo(cards('KH')), many), null);
  const play = findBotPlay(cards('2S 5C 5D'), identifyCombo(cards('4H')), many);
  assert.ok(!play.cards.some((c) => c.rank === '2'));
});

test('uses a 2 when an opponent is about to go out', () => {
  const play = findBotPlay(cards('2S 5C 5D 7H'), identifyCombo(cards('AH')), { opponents: [1, 9] });
  assert.equal(ids(play), '2S');
});

test('always chops a 2 when it can', () => {
  const play = findBotPlay(cards('6S 6H 7C 7D 8S 8H JC'), identifyCombo(cards('2H')), many);
  assert.equal(play.type, 'double-sequence');
});

test('finishes when the last cards beat the table', () => {
  const play = findBotPlay(cards('JC JD'), identifyCombo(cards('9S 9H')), many);
  assert.equal(ids(play), 'JC JD');
});

test('avoids leading a single when someone has one card left', () => {
  const play = findBotPlay(cards('4C 6S 6H 9D'), null, { opponents: [1, 8] });
  assert.equal(play.type, 'pair');
});

test('plays the 3♠ on the first hand', () => {
  const play = findBotPlay(cards('3S 4D 5C 9H'), null, { ...many, mustPlay3S: true });
  assert.ok(play.cards.some((c) => c.id === '3S'));
});
