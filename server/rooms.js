import { createGame, dealHand, handPenalty } from './game/engine.js';
import { createBotId, pickBotName } from './game/bot.js';

const rooms = new Map();
const socketToRoom = new Map();

function sanitizeNickname(name) {
  return String(name ?? '').replace(/[<>&"'/]/g, '').trim().slice(0, 20) || 'Player';
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function createRoom(hostSocketId, nickname, ante = 10, maxPlayers = 4, fillWithBots = false, isPublic = false, userId = null) {
  let code = generateCode();
  while (rooms.has(code)) code = generateCode();

  const safeName = sanitizeNickname(nickname);

  rooms.set(code, {
    code,
    host: hostSocketId,
    players: [{ id: hostSocketId, nickname: safeName, isBot: false, userId }],
    game: null,
    ante,
    maxPlayers: Math.min(Math.max(maxPlayers, 2), 4),
    fillWithBots,
    isPublic,
    ranked: false,
    readyForNext: new Set(),
  });

  socketToRoom.set(hostSocketId, code);
  return code;
}

function joinRoom(code, socketId, nickname, userId = null) {
  const room = rooms.get(code);
  if (!room || room.ranked) return { error: 'Room not found' };
  if (room.game) return { error: 'Game already in progress' };
  if (room.players.some(p => p.id === socketId)) return { error: 'Already in room' };

  const currentHumans = room.players.filter(p => !p.isBot).length;
  const openSlots = room.maxPlayers - room.players.length;
  if (openSlots <= 0 || (!room.fillWithBots && currentHumans >= room.maxPlayers)) return { error: 'Room is full' };

  const safeName = sanitizeNickname(nickname);
  room.players.push({ id: socketId, nickname: safeName, isBot: false, userId });
  socketToRoom.set(socketId, code);

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
  room.game = createGame(playerIds, room.ante, room.startingBalances);

  const result = dealHand(room.game);
  return { room, dealResult: result };
}

function getRoomBySocket(socketId) {
  const code = socketToRoom.get(socketId);
  if (!code) return null;
  return rooms.get(code) || null;
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

  socketToRoom.delete(socketId);

  const remainingHumans = room.players.filter(p => p.id !== socketId && !p.isBot);
  if (remainingHumans.length === 0) {
    for (const p of room.players) socketToRoom.delete(p.id);
    rooms.delete(room.code);
    return room;
  }

  if (room.host === socketId) {
    room.host = remainingHumans[0].id;
  }

  if (room.game) {
    let nextTurnId = null;
    if (room.game.turn === socketId) {
      const idx = room.game.players.indexOf(socketId);
      const remaining = room.game.players.filter(p => p !== socketId);
      if (remaining.length > 0) {
        nextTurnId = remaining[idx % remaining.length];
      }
    }

    room.game.players = room.game.players.filter(p => p !== socketId);
    room.game.passedPlayers.delete(socketId);
    delete room.game.hands[socketId];
    delete room.game.balances[socketId];

    if (nextTurnId) {
      room.game.turn = nextTurnId;
    }
  }

  room.players = room.players.filter(p => p.id !== socketId);

  return room;
}

function checkAndRemoveBrokePlayers(room) {
  if (!room.game) return [];

  const ante = room.ante;
  const kicked = [];

  room.players = room.players.filter(p => {
    const balance = room.game.balances[p.id];
    if (balance < ante) {
      kicked.push({ id: p.id, nickname: p.nickname, isBot: p.isBot, balance });
      socketToRoom.delete(p.id);
      delete room.game.balances[p.id];
      delete room.game.hands[p.id];
      return false;
    }
    return true;
  });

  if (kicked.length > 0) {
    room.game.players = room.players.map(p => p.id);

    if (room.game.previousWinner && !room.players.some(p => p.id === room.game.previousWinner)) {
      room.game.previousWinner = null;
    }
  }

  return kicked;
}

function requestNewHand(room, socketId) {
  if (!room.game || !room.game.previousWinner) return null;

  room.readyForNext.add(socketId);

  for (const bot of getBots(room)) {
    room.readyForNext.add(bot.id);
  }

  const totalPlayers = room.players.length;
  if (room.readyForNext.size >= totalPlayers) {
    room.readyForNext.clear();

    const kicked = checkAndRemoveBrokePlayers(room);

    if (room.players.length < 2) {
      return { type: 'game-over', kicked, reason: 'not-enough-players' };
    }

    const result = dealHand(room.game);
    result.kicked = kicked;
    return result;
  }
  return null;
}

const matchQueues = new Map();

function joinMatchmaking(socketId, player, bet, maxPlayers = 4, balance = 0) {
  const key = `${bet}-${maxPlayers}`;

  if (!matchQueues.has(key)) {
    matchQueues.set(key, []);
  }

  const queue = matchQueues.get(key);

  if (queue.some(p => p.id === socketId)) {
    return { queued: true, position: queue.findIndex(p => p.id === socketId) + 1, needed: maxPlayers };
  }

  queue.push({ id: socketId, nickname: sanitizeNickname(player.name), userId: player.userId, balance });

  if (queue.length >= maxPlayers) {
    const players = queue.splice(0, maxPlayers);
    let code = generateCode();
    while (rooms.has(code)) code = generateCode();

    const balances = Object.fromEntries(players.map(p => [p.id, p.balance]));
    rooms.set(code, {
      code,
      host: players[0].id,
      players: players.map(p => ({ id: p.id, nickname: p.nickname, isBot: false, userId: p.userId })),
      game: null,
      ante: bet,
      maxPlayers,
      fillWithBots: false,
      isPublic: false,
      ranked: true,
      startingBalances: balances,
      settled: { ...balances },
      handActive: false,
      readyForNext: new Set(),
    });
    for (const p of players) socketToRoom.set(p.id, code);

    const room = rooms.get(code);
    const result = startGame(room);
    return { matched: true, room: result.room, dealResult: result.dealResult, code };
  }

  return { queued: true, position: queue.length, needed: maxPlayers };
}

function leaveMatchmaking(socketId) {
  for (const [key, queue] of matchQueues) {
    const idx = queue.findIndex(p => p.id === socketId);
    if (idx !== -1) {
      queue.splice(idx, 1);
      if (queue.length === 0) matchQueues.delete(key);
      return true;
    }
  }
  return false;
}

function listOpenRooms() {
  const list = [];
  for (const room of rooms.values()) {
    if (!room.isPublic || room.game) continue;
    const humans = room.players.filter(p => !p.isBot);
    if (humans.length >= room.maxPlayers) continue;
    const host = room.players.find(p => p.id === room.host);
    list.push({
      code: room.code,
      host: host ? host.nickname : humans[0]?.nickname,
      ante: room.ante,
      players: humans.length,
      maxPlayers: room.maxPlayers,
      fillWithBots: room.fillWithBots,
    });
  }
  return list;
}

function isUserBusy(userId) {
  for (const queue of matchQueues.values()) {
    if (queue.some(p => p.userId === userId)) return true;
  }
  for (const room of rooms.values()) {
    if (room.ranked && room.game && room.players.some(p => p.userId === userId)) return true;
  }
  return false;
}

function rankedHandMovements(room) {
  if (!room.ranked || !room.game) return [];
  const movements = [];
  for (const p of room.players) {
    if (!p.userId) continue;
    const balance = room.game.balances[p.id];
    if (balance === undefined) continue;
    const amount = balance - room.settled[p.id];
    room.settled[p.id] = balance;
    if (amount !== 0) movements.push({ userId: p.userId, amount });
  }
  return movements;
}

function rankedLeaveMovements(room, socketId) {
  if (!room?.ranked || !room.game) return [];
  const player = room.players.find(p => p.id === socketId);
  const balance = room.game.balances[socketId];
  if (!player?.userId || balance === undefined) return [];
  let amount = balance - room.settled[socketId];
  if (room.handActive) amount -= handPenalty(room.game.hands[socketId] || []);
  room.settled[socketId] = balance;
  return amount !== 0 ? [{ userId: player.userId, amount }] : [];
}

export {
  rooms, createRoom, joinRoom, startManually,
  getRoomBySocket, getNicknames, getBotFlags, getBots,
  removePlayer, requestNewHand,
  joinMatchmaking, leaveMatchmaking, matchQueues,
  listOpenRooms, isUserBusy, rankedHandMovements, rankedLeaveMovements,
};
