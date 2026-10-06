import { createGame, dealHand } from './game/engine.js';
import { createBotId, pickBotName } from './game/bot.js';
import { minBalance } from './game/payout.js';

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

function newCode() {
  let code = generateCode();
  while (rooms.has(code)) code = generateCode();
  return code;
}

function createRoom(hostSocketId, nickname, stake = 10, maxPlayers = 4, fillWithBots = false, isPublic = false, userId = null) {
  const code = newCode();
  rooms.set(code, {
    code,
    host: hostSocketId,
    players: [{ id: hostSocketId, nickname: sanitizeNickname(nickname), isBot: false, userId, away: false }],
    game: null,
    stake,
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
  if (room.players.some((p) => p.id === socketId)) return { error: 'Already in room' };

  const humans = room.players.filter((p) => !p.isBot).length;
  if (room.players.length >= room.maxPlayers || humans >= room.maxPlayers) return { error: 'Room is full' };

  room.players.push({ id: socketId, nickname: sanitizeNickname(nickname), isBot: false, userId, away: false });
  socketToRoom.set(socketId, code);

  const humanCount = humans + 1;
  const shouldStart = humanCount >= room.maxPlayers || (room.fillWithBots && humanCount >= 2);
  if (!shouldStart) return { room, waiting: true };

  if (room.fillWithBots) fillRoomWithBots(room);
  return startGame(room);
}

function startManually(code, socketId) {
  const room = rooms.get(code);
  if (!room) return { error: 'Room not found' };
  if (room.host !== socketId) return { error: 'Only the host can start the game' };
  if (room.game) return { error: 'Game already in progress' };

  if (room.fillWithBots) fillRoomWithBots(room);
  if (room.players.length < 2) return { error: 'Need at least 2 players' };

  return startGame(room);
}

function fillRoomWithBots(room) {
  const usedNames = room.players.map((p) => p.nickname);
  while (room.players.length < room.maxPlayers) {
    const botName = pickBotName(usedNames);
    usedNames.push(botName);
    room.players.push({ id: createBotId(), nickname: botName, isBot: true, away: false });
  }
}

function startGame(room) {
  room.game = createGame(room.players.map((p) => p.id), room.stake, room.startingBalances);
  return { room, dealResult: dealHand(room.game) };
}

function getRoomBySocket(socketId) {
  const code = socketToRoom.get(socketId);
  return code ? rooms.get(code) || null : null;
}

function getNicknames(room) {
  return Object.fromEntries(room.players.map((p) => [p.id, p.nickname]));
}

function getBotFlags(room) {
  return Object.fromEntries(room.players.map((p) => [p.id, p.isBot]));
}

function getAway(room) {
  return room.players.filter((p) => p.away).map((p) => p.id);
}

function isAutoPlayed(room, playerId) {
  return room.players.some((p) => p.id === playerId && (p.isBot || p.away));
}

function activeHumans(room) {
  return room.players.filter((p) => !p.isBot && !p.away);
}

function deleteRoom(room) {
  for (const p of room.players) socketToRoom.delete(p.id);
  rooms.delete(room.code);
}

function dropPlayer(room, playerId) {
  room.players = room.players.filter((p) => p.id !== playerId);
  if (room.game) {
    room.game.players = room.game.players.filter((p) => p !== playerId);
    delete room.game.hands[playerId];
    delete room.game.balances[playerId];
    if (room.game.previousWinner === playerId) room.game.previousWinner = null;
  }
  room.readyForNext.delete(playerId);
  socketToRoom.delete(playerId);
}

function leaveSeat(socketId) {
  const room = getRoomBySocket(socketId);
  if (!room) return null;
  socketToRoom.delete(socketId);

  const seat = room.players.find((p) => p.id === socketId);
  const handLive = room.game && !room.game.handOver && room.game.players.includes(socketId);

  if (handLive) {
    seat.away = true;
  } else {
    dropPlayer(room, socketId);
  }

  if (activeHumans(room).length === 0) {
    deleteRoom(room);
    return { room, away: handLive, closed: true };
  }
  if (room.host === socketId) room.host = activeHumans(room)[0].id;
  return { room, away: handLive, closed: false };
}

function dropAwayPlayers(room) {
  const away = room.players.filter((p) => p.away).map((p) => p.id);
  for (const id of away) dropPlayer(room, id);
  return away;
}

function checkAndRemoveBrokePlayers(room) {
  const needed = minBalance(room.stake);
  const kicked = room.players
    .filter((p) => room.game.balances[p.id] < needed)
    .map((p) => ({ id: p.id, nickname: p.nickname, isBot: p.isBot, balance: room.game.balances[p.id] }));
  for (const k of kicked) dropPlayer(room, k.id);
  return kicked;
}

function requestNewHand(room, socketId) {
  if (!room.game || !room.game.handOver) return null;

  room.readyForNext.add(socketId);
  const waitingOn = activeHumans(room).filter((p) => !room.readyForNext.has(p.id));
  if (waitingOn.length > 0) return null;

  room.readyForNext.clear();
  const kicked = checkAndRemoveBrokePlayers(room);
  if (room.players.length < 2 || activeHumans(room).length === 0) {
    return { type: 'game-over', kicked, reason: 'not-enough-players' };
  }
  const result = dealHand(room.game);
  result.kicked = kicked;
  return result;
}

const matchQueues = new Map();

function joinMatchmaking(socketId, player, stake, maxPlayers = 4, balance = 0) {
  const key = `${stake}-${maxPlayers}`;
  if (!matchQueues.has(key)) matchQueues.set(key, []);
  const queue = matchQueues.get(key);

  if (queue.some((p) => p.id === socketId)) {
    return { queued: true, position: queue.findIndex((p) => p.id === socketId) + 1, needed: maxPlayers };
  }

  queue.push({ id: socketId, nickname: sanitizeNickname(player.name), userId: player.userId, balance });
  if (queue.length < maxPlayers) return { queued: true, position: queue.length, needed: maxPlayers };

  const players = queue.splice(0, maxPlayers);
  if (queue.length === 0) matchQueues.delete(key);
  const code = newCode();
  const balances = Object.fromEntries(players.map((p) => [p.id, p.balance]));
  const room = {
    code,
    host: players[0].id,
    players: players.map((p) => ({ id: p.id, nickname: p.nickname, isBot: false, userId: p.userId, away: false })),
    game: null,
    stake,
    maxPlayers,
    fillWithBots: false,
    isPublic: false,
    ranked: true,
    startingBalances: balances,
    settled: { ...balances },
    readyForNext: new Set(),
  };
  rooms.set(code, room);
  for (const p of players) socketToRoom.set(p.id, code);

  const result = startGame(room);
  return { matched: true, room, dealResult: result.dealResult, code };
}

function leaveMatchmaking(socketId) {
  for (const [key, queue] of matchQueues) {
    const idx = queue.findIndex((p) => p.id === socketId);
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
    const humans = room.players.filter((p) => !p.isBot);
    if (humans.length >= room.maxPlayers) continue;
    const host = room.players.find((p) => p.id === room.host);
    list.push({
      code: room.code,
      host: host ? host.nickname : humans[0]?.nickname,
      stake: room.stake,
      players: humans.length,
      maxPlayers: room.maxPlayers,
      fillWithBots: room.fillWithBots,
    });
  }
  return list;
}

function isUserBusy(userId) {
  for (const queue of matchQueues.values()) {
    if (queue.some((p) => p.userId === userId)) return true;
  }
  for (const room of rooms.values()) {
    if (room.ranked && room.game && room.players.some((p) => p.userId === userId)) return true;
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

export {
  rooms, createRoom, joinRoom, startManually,
  getRoomBySocket, getNicknames, getBotFlags, getAway, isAutoPlayed,
  leaveSeat, dropAwayPlayers, requestNewHand,
  joinMatchmaking, leaveMatchmaking,
  listOpenRooms, isUserBusy, rankedHandMovements,
};
