import { createGame, dealHand } from './game/engine.js';
import { createBotId, pickBotName } from './game/bot.js';

const rooms = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function createRoom(hostSocketId, nickname, ante = 10, maxPlayers = 4, fillWithBots = false) {
  let code = generateCode();
  while (rooms.has(code)) code = generateCode();

  rooms.set(code, {
    code,
    host: hostSocketId,
    players: [{ id: hostSocketId, nickname, isBot: false }],
    game: null,
    ante,
    maxPlayers: Math.min(Math.max(maxPlayers, 2), 4),
    fillWithBots,
    readyForNext: new Set(),
  });

  return code;
}

function joinRoom(code, socketId, nickname) {
  const room = rooms.get(code);
  if (!room) return { error: 'Room not found' };
  if (room.players.filter(p => !p.isBot).length >= room.maxPlayers) return { error: 'Room is full' };
  if (room.players.some(p => p.id === socketId)) return { error: 'Already in room' };

  room.players.push({ id: socketId, nickname, isBot: false });

  const humanCount = room.players.filter(p => !p.isBot).length;
  const shouldStart = humanCount >= room.maxPlayers ||
    (room.fillWithBots && humanCount >= 2) ||
    (!room.fillWithBots && humanCount >= room.maxPlayers);

  if (!shouldStart) {
    return { room, waiting: true };
  }

  if (room.fillWithBots) {
    fillRoomWithBots(room);
  }

  return startGame(room);
}

function startManually(code, socketId) {
  const room = rooms.get(code);
  if (!room) return { error: 'Room not found' };
  if (room.host !== socketId) return { error: 'Only the host can start the game' };
  if (room.players.filter(p => !p.isBot).length < 1) return { error: 'Need at least 1 player' };

  if (room.fillWithBots) {
    fillRoomWithBots(room);
  }

  if (room.players.length < 2) return { error: 'Need at least 2 players' };

  return startGame(room);
}

function fillRoomWithBots(room) {
  const usedNames = room.players.map(p => p.nickname);
  while (room.players.length < room.maxPlayers) {
    const botId = createBotId();
    const botName = pickBotName(usedNames);
    usedNames.push(botName);
    room.players.push({ id: botId, nickname: botName, isBot: true });
  }
}

function startGame(room) {
  const playerIds = room.players.map(p => p.id);
  room.game = createGame(playerIds, room.ante);

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

function getBotFlags(room) {
  const map = {};
  for (const p of room.players) {
    map[p.id] = p.isBot;
  }
  return map;
}

function getBots(room) {
  return room.players.filter(p => p.isBot);
}

function removePlayer(socketId) {
  const room = getRoomBySocket(socketId);
  if (!room) return null;

  const remainingHumans = room.players.filter(p => p.id !== socketId && !p.isBot);
  if (remainingHumans.length === 0) {
    rooms.delete(room.code);
    return room;
  }

  room.players = room.players.filter(p => p.id !== socketId);
  if (room.host === socketId) {
    room.host = remainingHumans[0].id;
  }

  return room;
}

function requestNewHand(room, socketId) {
  room.readyForNext.add(socketId);

  for (const bot of getBots(room)) {
    room.readyForNext.add(bot.id);
  }

  const totalPlayers = room.players.length;
  if (room.readyForNext.size >= totalPlayers) {
    room.readyForNext.clear();
    const result = dealHand(room.game);
    return result;
  }
  return null;
}

export {
  rooms, createRoom, joinRoom, startManually,
  getRoomBySocket, getNicknames, getBotFlags, getBots,
  removePlayer, requestNewHand,
};
