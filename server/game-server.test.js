import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';
import { createGameServer, MAX_MESSAGE_BYTES } from './game-server.js';
import { SLOW_DOWN } from './security.js';

const EVENTS = [
  'watch-rooms', 'unwatch-rooms', 'create-room', 'join-room', 'start-game', 'play-cards', 'pass',
  'new-hand', 'rejoin', 'find-match', 'cancel-match', 'emote', 'leave-room', 'resume',
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

function client(user, target = url) {
  const socket = connect(target, {
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
    limits: { events: 1e6, rooms: 1e6, connections: 1e6 },
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

  let me = null;
  let myTurn = false;
  socket.on('game-start', (d) => { me = d.you; myTurn = d.firstPlayer === d.you; });
  socket.on('game-state', (d) => { myTurn = d.turn === me; });
  socket.on('hand-over', () => { myTurn = false; socket.emit('new-hand'); });

  socket.emit('create-room', { nickname: 'Fuzzer', fillWithBots: true });
  await nextEvent(socket, 'room-created');
  socket.emit('start-game');

  const deadline = Date.now() + 30000;
  while (!myTurn) {
    assert.ok(Date.now() < deadline, 'never got a turn');
    await new Promise((resolve) => setTimeout(resolve, 50));
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

test('only real emotes reach the other players', async () => {
  const host = await client();
  const guest = await client();
  host.emit('create-room', { nickname: 'Host' });
  const { roomCode } = await nextEvent(host, 'room-created');
  guest.emit('join-room', { roomCode, nickname: 'Guest' });
  await nextEvent(host, 'player-joined');

  const seen = [];
  guest.on('emote', ({ emoteId }) => seen.push(emoteId));
  host.emit('emote', { emoteId: '💀' });
  host.emit('emote', { emoteId: 'not-an-emote' });
  host.emit('emote', { emoteId: 'gg' });
  host.emit('emote', { emoteId: 'chat' });
  await new Promise((resolve) => setTimeout(resolve, 400));

  assert.deepEqual(seen, ['gg']);
  host.disconnect();
  guest.disconnect();
});

test('spam gets cut off: rooms, messages and connections', async () => {
  const server = createServer();
  const strict = new Server(server);
  createGameServer(strict, {
    getUser: async () => null,
    loadPlayer: async () => null,
    getBalance: async () => 0,
    recordOnlineHand: async () => {},
    onError: (err, where) => errors.push(`${where}: ${err.stack}`),
    limits: { events: 10, eventWindowMs: 60000, rooms: 2, roomWindowMs: 60000, connections: 3, connectionWindowMs: 60000 },
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const strictUrl = `http://localhost:${server.address().port}`;

  const roomMaker = await client(null, strictUrl);
  const roomErrors = [];
  roomMaker.on('join-error', ({ error }) => roomErrors.push(error));
  for (let i = 0; i < 3; i++) roomMaker.emit('create-room', { nickname: 'Spam' });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.deepEqual(roomErrors, [SLOW_DOWN]);

  const watcher = await client(null, strictUrl);
  let lists = 0;
  watcher.on('room-list', () => { lists += 1; });
  for (let i = 0; i < 25; i++) watcher.emit('watch-rooms');
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(lists, 10);

  await client(null, strictUrl);
  await assert.rejects(client(null, strictUrl), (err) => err.message === SLOW_DOWN);

  assert.deepEqual(errors, []);
  strict.close();
  server.close();
});

test('a player who runs out of time gets skipped, then goes idle, then can come back', async () => {
  const server = createServer();
  const fast = new Server(server);
  createGameServer(fast, {
    getUser: async () => null,
    loadPlayer: async () => null,
    getBalance: async () => 0,
    recordOnlineHand: async () => {},
    onError: (err, where) => errors.push(`${where}: ${err.stack}`),
    turnMs: 300,
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const socket = await client(null, `http://localhost:${server.address().port}`);

  let me = null;
  let idle = [];
  let turnMsLeft = null;
  const timeouts = [];
  socket.on('game-start', (d) => { me = d.you; turnMsLeft = d.firstPlayer === d.you ? d.turnMsLeft : turnMsLeft; });
  socket.on('game-state', (d) => { idle = d.idle; if (d.turn === me) turnMsLeft = d.turnMsLeft; });
  socket.on('turn-timeout', (d) => { if (d.playerId === me) timeouts.push(d); });
  socket.on('hand-over', () => socket.emit('new-hand'));

  socket.emit('create-room', { nickname: 'Sleepy', fillWithBots: true });
  await nextEvent(socket, 'room-created');
  socket.emit('start-game');

  const deadline = Date.now() + 30000;
  while (timeouts.length < 2) {
    assert.ok(Date.now() < deadline, 'never timed out twice');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(turnMsLeft > 0 && turnMsLeft <= 300);
  assert.equal(timeouts[0].idle, false);
  assert.equal(timeouts[1].idle, true);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(idle.includes(me));

  socket.emit('resume');
  const back = Date.now() + 10000;
  while (idle.includes(me)) {
    assert.ok(Date.now() < back, 'resume never cleared idle');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  assert.deepEqual(errors, []);
  socket.disconnect();
  fast.close();
  server.close();
});

async function fastServer(extra = {}) {
  const server = createServer();
  const fast = new Server(server);
  const game = createGameServer(fast, {
    getUser: async () => null,
    loadPlayer: async () => null,
    getBalance: async () => 0,
    recordOnlineHand: async () => {},
    onError: (err, where) => errors.push(`${where}: ${err.stack}`),
    turnMs: 40,
    botDelay: () => 5,
    ...extra,
  });
  await new Promise((resolve) => server.listen(0, resolve));
  return { game, url: `http://localhost:${server.address().port}`, close: () => { fast.close(); server.close(); } };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('the next hand deals after the wait and a bot covers whoever did not press', async () => {
  const { url, close } = await fastServer({ nextHandMs: 400 });
  const a = await client(null, url);
  const b = await client(null, url);
  const starts = { a: [], b: [] };
  const overs = [];
  a.on('game-start', (d) => starts.a.push(d));
  b.on('game-start', (d) => starts.b.push(d));
  a.on('hand-over', (d) => overs.push(d));

  a.emit('create-room', { nickname: 'A', maxPlayers: 2 });
  const { roomCode } = await nextEvent(a, 'room-created');
  b.emit('join-room', { roomCode, nickname: 'B' });

  const handEnd = Date.now() + 30000;
  while (overs.length === 0) {
    assert.ok(Date.now() < handEnd, 'first hand never ended');
    await sleep(50);
  }
  assert.equal(overs[0].nextHandMs, 400);

  await sleep(900);
  assert.equal(starts.a.length, 1, 'nobody pressed, so no new hand');

  b.emit('resume');
  await sleep(100);
  a.emit('new-hand');
  await nextEvent(a, 'waiting-for-opponent');
  const dealEnd = Date.now() + 3000;
  while (starts.b.length < 2) {
    assert.ok(Date.now() < dealEnd, 'second hand never dealt');
    await sleep(50);
  }
  const second = starts.b[1];
  assert.ok(second.idle.includes(second.you), 'the player who did not press is covered by a bot');
  assert.deepEqual(errors, []);
  a.disconnect();
  b.disconnect();
  close();
});
