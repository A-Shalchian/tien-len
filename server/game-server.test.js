import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';
import { createGameServer, MAX_MESSAGE_BYTES } from './game-server.js';

const EVENTS = [
  'watch-rooms', 'unwatch-rooms', 'create-room', 'join-room', 'start-game', 'play-cards', 'pass',
  'new-hand', 'rejoin', 'find-match', 'cancel-match', 'emote', 'leave-room',
];

const JUNK = [
  undefined, null, 0, 1, -1, 1e308, '', 'x', 'A'.repeat(3000), true, false, [], [null], [{}], {},
  JSON.parse('{"__proto__": {"nickname": "x"}}'),
  { toString: 'x', valueOf: 'y' },
  { nickname: { toString: 1 } }, { nickname: ['a'] }, { nickname: 'n'.repeat(500) },
  { stake: { valueOf: 1 } }, { stake: 'abc' }, { stake: -5 }, { stake: 1e20 }, { stake: null },
  { maxPlayers: '9' }, { maxPlayers: {} }, { fillWithBots: 'yes', isPublic: 1 },
  { roomCode: { toString: 'x' } }, { roomCode: 12345 }, { roomCode: ['ABCD'] }, { roomCode: 'ZZZZ' },
  { cardIds: 1 }, { cardIds: 'AS' }, { cardIds: [null] }, { cardIds: [{}] }, { cardIds: [1, 2] },
  { cardIds: new Array(60).fill('3S') }, { cardIds: [] }, { cardIds: { length: 2, 0: '3S' } },
  { bet: { valueOf: 1 } }, { bet: 'x' }, { bet: -1, maxPlayers: 99 },
  { emoteId: { a: 1 } }, { emoteId: 'x'.repeat(500) }, { emoteId: ['gg'] }, { emoteId: null },
];

const errors = [];
let http;
let io;
let url;
const clients = [];

function client(user) {
  const socket = connect(url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    extraHeaders: user ? { 'x-test-user': user } : {},
    auth: { key: `test-key-${clients.length}-abcdef` },
  });
  clients.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function nextEvent(socket, event, ms = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${event} within ${ms} ms`)), ms);
    timer.unref();
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

async function stillAnswers() {
  const probe = await client();
  probe.emit('create-room', { nickname: 'Probe' });
  const { roomCode } = await nextEvent(probe, 'room-created');
  assert.match(roomCode, /^[A-Z0-9]{4}$/);
  probe.emit('leave-room');
  probe.disconnect();
}

before(async () => {
  process.on('uncaughtException', (err) => errors.push(`uncaught: ${err.message}`));
  process.on('unhandledRejection', (err) => errors.push(`unhandled: ${err.message}`));
  http = createServer();
  io = new Server(http, { maxHttpBufferSize: MAX_MESSAGE_BYTES });
  createGameServer(io, {
    getUser: async (headers) => (headers['x-test-user'] ? { id: headers['x-test-user'] } : null),
    loadPlayer: async (id) => ({ userId: id, name: `Player ${id}`, termsAccepted: true }),
    getBalance: async () => 5000,
    recordOnlineHand: async () => {},
    onError: (err, where) => errors.push(`${where}: ${err.stack}`),
  });
  await new Promise((resolve) => http.listen(0, resolve));
  url = `http://localhost:${http.address().port}`;
});

after(() => {
  for (const socket of clients) socket.disconnect();
  io.close();
  http.close();
});

test('junk payloads on every event never throw, for guests and signed-in players', async () => {
  for (const user of [null, 'fuzz-user']) {
    const socket = await client(user);
    for (const event of EVENTS) {
      for (const payload of JUNK) socket.emit(event, payload);
    }
    socket.emit('create-room', { nickname: 'Barrier' });
    await nextEvent(socket, 'room-created');
    socket.disconnect();
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.deepEqual(errors, []);
  await stillAnswers();
});

test('junk moves during a live hand get rejected, never thrown', async () => {
  const socket = await client();
  const rejected = [];
  socket.on('invalid-play', ({ reason }) => rejected.push(reason));

  socket.emit('create-room', { nickname: 'Fuzzer', fillWithBots: true });
  await nextEvent(socket, 'room-created');
  socket.emit('start-game');
  const start = await nextEvent(socket, 'game-start');

  let myTurn = start.firstPlayer === start.you;
  const deadline = Date.now() + 20000;
  while (!myTurn) {
    assert.ok(Date.now() < deadline, 'never got a turn');
    const event = await Promise.race([
      nextEvent(socket, 'game-state', 20000).then((s) => ({ s })),
      nextEvent(socket, 'hand-over', 20000).then(() => ({ over: true })),
    ]);
    if (event.over) {
      socket.emit('new-hand');
      const again = await nextEvent(socket, 'game-start');
      myTurn = again.firstPlayer === again.you;
    } else {
      myTurn = event.s.turn === start.you;
    }
  }

  for (const payload of JUNK) {
    socket.emit('play-cards', payload);
    socket.emit('emote', payload);
  }
  socket.emit('create-room', { nickname: 'Barrier' });
  await nextEvent(socket, 'room-created');

  assert.ok(rejected.length > 0, 'junk moves should come back as invalid-play');
  assert.ok(rejected.every((r) => typeof r === 'string'));
  assert.deepEqual(errors, []);
  socket.disconnect();
  await stillAnswers();
});

test('an oversized message drops that connection and nothing else', async () => {
  const socket = await client();
  const dropped = nextEvent(socket, 'disconnect');
  socket.emit('create-room', { nickname: 'x'.repeat(MAX_MESSAGE_BYTES * 2) });
  await dropped;
  assert.deepEqual(errors, []);
  await stillAnswers();
});
