import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rooms, createRoom, startManually, leaveSeat, closeIfAbandoned, dropAwayPlayers,
  joinMatchmaking, busyReason, STILL_FINISHING, REJOIN_GRACE_MS,
} from './rooms.js';
import { playCards, pass, mustPlay3S, dealHand } from './game/engine.js';
import { findBotPlay } from './game/bot.js';

function playOut(game) {
  for (let step = 0; step < 600 && !game.handOver; step++) {
    const id = game.turn;
    const table = game.table ? game.table.combo : null;
    const choice = findBotPlay(game.hands[id], table, { mustPlay3S: mustPlay3S(game, id) });
    let result = choice ? playCards(game, id, choice.cards.map((c) => c.id)) : null;
    if (!result || result.error) result = table ? pass(game, id) : playCards(game, id, [game.hands[id][0].id]);
    assert.equal(result.error, undefined, result.error);
  }
  assert.ok(game.handOver, 'hand never finished');
}

test('a dropped player keeps their seat until the hand ends, then the room closes', () => {
  const code = createRoom({ socketId: 'sock-1', key: 'key-1', nickname: 'Linh' }, 10, 4, true, false);
  const { room } = startManually('sock-1');
  const seat = room.players.find((p) => !p.isBot);

  const out = leaveSeat('sock-1', { left: false });
  assert.equal(out.away, true);
  seat.awaySince = Date.now() - REJOIN_GRACE_MS - 1000;

  assert.equal(closeIfAbandoned(room), false);
  assert.ok(room.game.players.includes(seat.id));
  assert.ok(Array.isArray(room.game.hands[seat.id]));

  playOut(room.game);
  assert.equal(closeIfAbandoned(room), true);
  assert.equal(rooms.has(code), false);
});

test('leaving a Quick Match keeps you busy until that hand is over', () => {
  joinMatchmaking({ socketId: 'q-1', userId: 'user-a', nickname: 'A' }, 10, 2, 1000);
  const { room } = joinMatchmaking({ socketId: 'q-2', userId: 'user-b', nickname: 'B' }, 10, 2, 1000);
  while (room.game.handOver) dealHand(room.game);

  leaveSeat('q-1', { left: true });
  assert.equal(busyReason('user-a'), STILL_FINISHING);

  playOut(room.game);
  dropAwayPlayers(room);
  assert.equal(busyReason('user-a'), null);
});
