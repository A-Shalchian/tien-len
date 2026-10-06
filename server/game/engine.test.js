import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identifyCombo, canBeat } from './validator.js';
import { createGame, setupHand, playCards, pass, mustPlay3S } from './engine.js';
import { settleChips } from './payout.js';

const card = (id) => ({ rank: id.slice(0, -1), suit: id.slice(-1), id });
const cards = (ids) => ids.split(' ').map(card);
const combo = (ids) => identifyCombo(cards(ids));

function game(hands, leader, { firstHand = false, balances } = {}) {
  const ids = Object.keys(hands);
  const g = createGame(ids, 10, balances);
  g.firstHand = firstHand;
  setupHand(g, Object.fromEntries(ids.map((id) => [id, cards(hands[id])])), leader);
  return g;
}

const play = (g, id, ids) => {
  const r = playCards(g, id, ids.split(' '));
  assert.equal(r.error, undefined, r.error);
  return r;
};

test('combos are recognised', () => {
  assert.equal(combo('5S 6D 7H').type, 'sequence');
  assert.equal(combo('4S 4H 5C 5D 6S 6H').type, 'double-sequence');
  assert.equal(combo('8S 8C 8D 8H').type, 'four-of-a-kind');
  assert.equal(combo('KS AS 2S'), null);
});

test('bombs beat 2s by size', () => {
  const threePairs = combo('4S 4H 5C 5D 6S 6H');
  const quad = combo('8S 8C 8D 8H');
  const fourPairs = combo('4S 4H 5C 5D 6S 6H 7S 7H');
  const fivePairs = combo('4S 4H 5C 5D 6S 6H 7S 7H 8S 8H');

  assert.ok(canBeat(threePairs, combo('2H')));
  assert.ok(!canBeat(threePairs, combo('2S 2H')));
  assert.ok(canBeat(quad, combo('2S 2H')));
  assert.ok(!canBeat(quad, combo('2S 2C 2H')));
  assert.ok(canBeat(fourPairs, combo('2S 2H')));
  assert.ok(canBeat(fivePairs, combo('2S 2C 2H')));
  assert.ok(!canBeat(quad, combo('AS AH')));
});

test('bigger chops beat smaller chops', () => {
  const threePairs = combo('4S 4H 5C 5D 6S 6H');
  const higherThreePairs = combo('9S 9H 10C 10D JS JH');
  const quad = combo('3S 3C 3D 3H');
  const fourPairs = combo('7S 7H 8C 8D 9S 9H 10S 10H');

  assert.ok(canBeat(quad, threePairs));
  assert.ok(!canBeat(threePairs, quad));
  assert.ok(canBeat(fourPairs, quad));
  assert.ok(!canBeat(quad, fourPairs));
  assert.ok(canBeat(higherThreePairs, threePairs));
});

test('3♠ is only required on the first hand', () => {
  const first = game({ a: '3S 4S', b: '5S 6S' }, 'a', { firstHand: true });
  assert.ok(mustPlay3S(first, 'a'));
  assert.match(playCards(first, 'a', ['4S']).error, /3♠/);

  const later = game({ a: '3S 4S', b: '5S 6S' }, 'a');
  assert.ok(!mustPlay3S(later, 'a'));
  assert.equal(playCards(later, 'a', ['4S']).error, undefined);
});

test('the hand plays out every place and scores like the tracker', () => {
  const g = game({ a: '3C 10C', b: '4C 9D', c: '5C 6C', d: '7C 8C' }, 'a');
  play(g, 'a', '3C');
  play(g, 'b', '4C');
  play(g, 'c', '5C');
  play(g, 'd', '7C');
  play(g, 'a', '10C');
  assert.deepEqual(g.finished, ['a']);
  assert.deepEqual(g.cong, []);
  pass(g, 'b');
  pass(g, 'c');
  pass(g, 'd');
  assert.equal(g.table, null);
  assert.equal(g.turn, 'b');
  play(g, 'b', '9D');
  pass(g, 'c');
  pass(g, 'd');
  assert.equal(g.turn, 'c');
  const r = play(g, 'c', '6C');

  assert.equal(r.type, 'hand-over');
  assert.deepEqual(r.data.order, ['a', 'b', 'c', 'd']);
  assert.deepEqual(r.points, { a: 3, b: 2, c: 1, d: 0 });
  assert.deepEqual(r.chips, { a: 15, b: 5, c: -5, d: -15 });
  assert.equal(g.previousWinner, 'a');
});

test('after a player goes out, the next player leads once everyone passes', () => {
  const g = game({ a: 'AS', b: '3C 4C', c: '5C 6C' }, 'a');
  play(g, 'a', 'AS');
  pass(g, 'b');
  pass(g, 'c');
  assert.equal(g.table, null);
  assert.equal(g.turn, 'b');
});

test('chops and chops over chops are recorded', () => {
  const g = game({
    a: '2H 3C',
    b: '4S 4H 5C 5D 6S 6H 9C',
    c: '8S 8C 8D 8H 10C',
  }, 'a');
  play(g, 'a', '2H');
  const chop = play(g, 'b', '4S 4H 5C 5D 6S 6H');
  assert.deepEqual(chop.chop, { by: 'b', victim: 'a', black: 0, red: 1 });
  const over = play(g, 'c', '8S 8C 8D 8H');
  assert.deepEqual(over.chop, { by: 'c', victim: 'b', black: 0, red: 1 });
  assert.equal(g.chops.length, 2);
});

test('cóng, 2s left and the 3♠ finish count', () => {
  const g = game({ a: '3S', b: '2S 2D 5C', c: '7C 8C' }, 'a');
  play(g, 'a', '3S');
  assert.deepEqual(g.cong, ['b', 'c']);
  assert.equal(g.threeSpadeWin, true);
  play(g, 'b', '5C');
  play(g, 'c', '7C');
  pass(g, 'b');
  const r = play(g, 'c', '8C');
  assert.deepEqual(r.data.order, ['a', 'c', 'b']);
  assert.deepEqual(r.data.stuckLast, { black: 1, red: 1 });
  assert.deepEqual(r.points, { a: 4, b: -4, c: 3 });
});

test('nobody loses more chips than they have', () => {
  const chips = settleChips({ a: 6, b: 0, c: -6 }, 100, { a: 1000, b: 1000, c: 200 });
  assert.equal(chips.c, -200);
  assert.equal(chips.a + chips.b + chips.c, 0);
  assert.ok(chips.a > 0);
});

test('bots finish hundreds of random hands with zero-sum chips', async () => {
  const { dealHand } = await import('./engine.js');
  const { findBotPlay } = await import('./bot.js');
  for (const count of [2, 3, 4]) {
    const ids = ['a', 'b', 'c', 'd'].slice(0, count);
    const g = createGame(ids, 10, Object.fromEntries(ids.map((id) => [id, 100000])));
    for (let hand = 0; hand < 150; hand++) {
      const before = ids.reduce((sum, id) => sum + g.balances[id], 0);
      const deal = dealHand(g);
      let result = deal.result;
      let steps = 0;
      while (!result) {
        assert.ok(steps++ < 500, 'hand never ended');
        const id = g.turn;
        const table = g.table ? g.table.combo : null;
        const choice = findBotPlay(g.hands[id], table, { mustPlay3S: mustPlay3S(g, id) });
        let r = choice ? playCards(g, id, choice.cards.map((c) => c.id)) : null;
        if (!r || r.error) r = table ? pass(g, id) : playCards(g, id, [g.hands[id][0].id]);
        assert.equal(r.error, undefined, r.error);
        if (r.type === 'hand-over') result = r;
      }
      if (!result.data.instantWin) assert.equal(result.data.order.length, count);
      assert.equal(ids.reduce((sum, id) => sum + g.balances[id], 0), before);
    }
  }
});
