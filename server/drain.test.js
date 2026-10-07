import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';
import { createGameServer, UPDATING } from './game-server.js';

const errors = [];
const sockets = [];
let close = () => {};

function client(url) {
  const socket = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  sockets.push(socket);
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

after(() => {
  for (const socket of sockets) socket.disconnect();
  close();
});

test('a deploy lets the running hand finish, closes other tables and refuses new games', async () => {
  const http = createServer();
  const io = new Server(http);
  const game = createGameServer(io, {
    getUser: async () => null,
    loadPlayer: async () => null,
    getBalance: async () => 0,
    recordOnlineHand: async () => {},
    onError: (err, where) => errors.push(`${where}: ${err.stack}`),
    turnMs: 40,
    botDelay: () => 5,
    drainCloseMs: 50,
  });
  await new Promise((resolve) => http.listen(0, resolve));
  close = () => { io.close(); http.close(); };
  const url = `http://localhost:${http.address().port}`;
  const player = await client(url);
  const waiter = await client(url);
  const newcomer = await client(url);

  player.emit('create-room', { nickname: 'P', fillWithBots: true });
  await nextEvent(player, 'room-created');
  player.emit('start-game');
  await nextEvent(player, 'game-start');
  waiter.emit('create-room', { nickname: 'W' });
  await nextEvent(waiter, 'room-created');

  const notice = nextEvent(player, 'server-update');
  const waiterClosed = nextEvent(waiter, 'room-closed');
  const playerClosed = nextEvent(player, 'room-closed', 30000);
  const started = Date.now();
  const drained = game.drain(20000);

  assert.match((await notice).reason, /This hand will finish/);
  assert.match((await waiterClosed).reason, /updating/);
  newcomer.emit('create-room', { nickname: 'N' });
  assert.equal((await nextEvent(newcomer, 'join-error')).error, UPDATING);

  assert.match((await playerClosed).reason, /updating/);
  assert.deepEqual(await drained, { unfinished: 0 });
  assert.ok(Date.now() - started < 20000);
  assert.deepEqual(errors, []);
});
