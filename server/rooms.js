import { createGame, dealHand, resolveInstantWin } from './game/engine.js';

const rooms = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function createRoom(hostSocketId, nickname, ante = 10) {
  let code = generateCode();
  while (rooms.has(code)) code = generateCode();

  rooms.set(code, {
    code,
    host: hostSocketId,
    players: [{ id: hostSocketId, nickname }],
    game: null,
    ante,
    readyForNext: new Set(),
  });

  return code;
}

function joinRoom(code, socketId, nickname) {
  const room = rooms.get(code);
  if (!room) return { error: 'Room not found' };
  if (room.players.length >= 2) return { error: 'Room is full' };
  if (room.players.some(p => p.id === socketId)) return { error: 'Already in room' };

  room.players.push({ id: socketId, nickname });

  // Start game
  const p1 = room.players[0].id;
  const p2 = room.players[1].id;
  room.game = createGame(p1, p2, room.ante);

  const result = dealHand(room.game);
  return { room, dealResult: result };
}

function getRoomBySocket(socketId) {
  for (const [code, room] of rooms) {
    if (room.players.some(p => p.id === socketId)) {
      return room;
    }
  }
  return null;
}

function getNicknames(room) {
  const map = {};
  for (const p of room.players) {
    map[p.id] = p.nickname;
  }
  return map;
}

function removePlayer(socketId) {
  const room = getRoomBySocket(socketId);
  if (!room) return null;
  rooms.delete(room.code);
  return room;
}

function requestNewHand(room, socketId) {
  room.readyForNext.add(socketId);
  if (room.readyForNext.size === 2) {
    room.readyForNext.clear();
    const result = dealHand(room.game);
    return result;
  }
  return null;
}

export { rooms, createRoom, joinRoom, getRoomBySocket, getNicknames, removePlayer, requestNewHand };
