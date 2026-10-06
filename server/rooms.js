import crypto from 'crypto';
import { createGame, dealHand } from './game/engine.js';
import { createBotId, pickBotName } from './game/bot.js';
import { minBalance } from './game/payout.js';

export const REJOIN_GRACE_MS = 60000;

const rooms = new Map();
const socketToRoom = new Map();

function sanitizeNickname(name) {
  return String(name ?? '').replace(/[<>&"'/]/g, '').trim().slice(0, 20) || 'Player';
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[crypto.randomInt(chars.length)];
  }
  return code;
}

function newCode() {
  let code = generateCode();
  while (rooms.has(code)) code = generateCode();
  return code;
}

function humanSeat(conn) {
  return {
    id: `p_${crypto.randomBytes(6).toString('hex')}`,
    socketId: conn.socketId,
    key: conn.key || null,
    userId: conn.userId || null,
    nickname: sanitizeNickname(conn.nickname),
    isBot: false,
    away: false,
    left: false,
    awaySince: null,
  };
}

function seatOf(room, socketId) {
  return room?.players.find((p) => p.socketId === socketId && !p.away) || null;
}

function createRoom(conn, stake = 10, maxPlayers = 4, fillWithBots = false, isPublic = false) {
  const code = newCode();
  const host = humanSeat(conn);
  rooms.set(code, {
    code,
    host: host.id,
    players: [host],
    game: null,
    stake,
    maxPlayers: Math.min(Math.max(maxPlayers, 2), 4),
    fillWithBots,
    isPublic,
    ranked: false,
    readyForNext: new Set(),
    lastResult: null,
    createdAt: Date.now(),
  });
  socketToRoom.set(conn.socketId, code);
  return code;
}

function joinRoom(code, conn) {
  const room = rooms.get(code);
  if (!room || room.ranked) return { error: 'Room not found' };
  if (room.game) return { error: 'Game already in progress' };
  if (seatOf(room, conn.socketId)) return { error: 'Already in room' };

  const humans = room.players.filter((p) => !p.isBot).length;
  if (room.players.length >= room.maxPlayers || humans >= room.maxPlayers) return { error: 'Room is full' };

  room.players.push(humanSeat(conn));
  socketToRoom.set(conn.socketId, code);

  const humanCount = humans + 1;
  const shouldStart = humanCount >= room.maxPlayers || (room.fillWithBots && humanCount >= 2);
  if (!shouldStart) return { room, waiting: true };

  if (room.fillWithBots) fillRoomWithBots(room);
  return startGame(room);
}

function startManually(socketId) {
  const room = getRoomBySocket(socketId);
  if (!room) return { error: 'Room not found' };
  if (room.host !== seatOf(room, socketId)?.id) return { error: 'Only the host can start the game' };
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
    room.players.push({ id: createBotId(), socketId: null, nickname: botName, isBot: true, away: false });
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

function canReturn(seat, now = Date.now()) {
  return seat.away && !seat.left && now - seat.awaySince < REJOIN_GRACE_MS;
}

function deleteRoom(room) {
  for (const p of room.players) if (p.socketId) socketToRoom.delete(p.socketId);
  rooms.delete(room.code);
}

function dropPlayer(room, playerId) {
  const seat = room.players.find((p) => p.id === playerId);
  if (seat?.socketId && socketToRoom.get(seat.socketId) === room.code) socketToRoom.delete(seat.socketId);
  room.players = room.players.filter((p) => p.id !== playerId);
  if (room.game) {
    room.game.players = room.game.players.filter((p) => p !== playerId);
    delete room.game.hands[playerId];
    delete room.game.balances[playerId];
    if (room.game.previousWinner === playerId) room.game.previousWinner = null;
  }
  room.readyForNext.delete(playerId);
}

function leaveSeat(socketId, { left }) {
  const room = getRoomBySocket(socketId);
  const seat = seatOf(room, socketId);
  socketToRoom.delete(socketId);
  if (!seat) return null;

  const handLive = room.game && !room.game.handOver;
  const keep = room.game && (handLive || !left);
  if (keep) {
    seat.away = true;
    seat.left = left;
    seat.awaySince = Date.now();
  } else {
    dropPlayer(room, seat.id);
  }

  const someoneCanReturn = room.players.some((p) => canReturn(p));
  if (activeHumans(room).length === 0 && !someoneCanReturn && !handLive) {
    deleteRoom(room);
    return { room, seat, away: keep, closed: true };
  }
  if (room.host === seat.id && activeHumans(room).length > 0) room.host = activeHumans(room)[0].id;
  return { room, seat, away: keep, closed: false };
}

function rejoinSeat(socketId, { userId, key }) {
  for (const room of rooms.values()) {
    const seat = room.players.find((p) => !p.isBot && canReturn(p)
      && ((userId && p.userId === userId) || (key && p.key === key)));
    if (!seat) continue;
    seat.socketId = socketId;
    seat.away = false;
    seat.awaySince = null;
    socketToRoom.set(socketId, room.code);
    return { room, seat };
  }
  return null;
}

function dropAwayPlayers(room) {
  if (room.game && !room.game.handOver) return [];
  const gone = room.players.filter((p) => p.away && !canReturn(p)).map((p) => p.id);
  for (const id of gone) dropPlayer(room, id);
  return gone;
}

function closeIfAbandoned(room) {
  if (!rooms.has(room.code)) return true;
  dropAwayPlayers(room);
  if (activeHumans(room).length > 0 || room.players.some((p) => canReturn(p))) return false;
  if (room.game && !room.game.handOver) return false;
  deleteRoom(room);
  return true;
}

function checkAndRemoveBrokePlayers(room) {
  const needed = minBalance(room.stake);
  const kicked = room.players
    .filter((p) => room.game.balances[p.id] < needed)
    .map((p) => ({ id: p.id, socketId: p.socketId, nickname: p.nickname, isBot: p.isBot, balance: room.game.balances[p.id] }));
  for (const k of kicked) dropPlayer(room, k.id);
  return kicked;
}

function requestNewHand(socketId) {
  const room = getRoomBySocket(socketId);
  const seat = seatOf(room, socketId);
  if (!seat || !room.game || !room.game.handOver) return null;

  room.readyForNext.add(seat.id);
  const waitingOn = activeHumans(room).filter((p) => !room.readyForNext.has(p.id));
  if (waitingOn.length > 0) return { room, waiting: true };

  room.readyForNext.clear();
  dropAwayPlayers(room);
  const kicked = checkAndRemoveBrokePlayers(room);
  if (room.players.length < 2 || activeHumans(room).length === 0) {
    return { room, type: 'game-over', kicked };
  }
  room.lastResult = null;
  const result = dealHand(room.game);
  return { room, deal: result, kicked };
}

const matchQueues = new Map();

function joinMatchmaking(conn, stake, maxPlayers = 4, balance = 0) {
  const queueKey = `${stake}-${maxPlayers}`;
  if (!matchQueues.has(queueKey)) matchQueues.set(queueKey, []);
  const queue = matchQueues.get(queueKey);

  const position = queue.findIndex((p) => p.socketId === conn.socketId);
  if (position !== -1) return { queued: true, position: position + 1, needed: maxPlayers };

  queue.push({ ...conn, balance });
  if (queue.length < maxPlayers) return { queued: true, position: queue.length, needed: maxPlayers };

  const entries = queue.splice(0, maxPlayers);
  if (queue.length === 0) matchQueues.delete(queueKey);
  const code = newCode();
  const players = entries.map(humanSeat);
  const room = {
    code,
    host: players[0].id,
    players,
    game: null,
    stake,
    maxPlayers,
    fillWithBots: false,
    isPublic: false,
    ranked: true,
    startingBalances: Object.fromEntries(players.map((p, i) => [p.id, entries[i].balance])),
    readyForNext: new Set(),
    lastResult: null,
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  for (const p of players) socketToRoom.set(p.socketId, code);

  const result = startGame(room);
  return { matched: true, room, dealResult: result.dealResult };
}

function leaveMatchmaking(socketId) {
  for (const [queueKey, queue] of matchQueues) {
    const idx = queue.findIndex((p) => p.socketId === socketId);
    if (idx !== -1) {
      queue.splice(idx, 1);
      if (queue.length === 0) matchQueues.delete(queueKey);
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

function closeRoom(code) {
  const room = rooms.get(code);
  if (!room) return null;
  deleteRoom(room);
  return room;
}

function liveSnapshot() {
  const roomList = [...rooms.values()].map((room) => {
    const game = room.game;
    const live = game && !game.handOver;
    return {
      code: room.code,
      ranked: room.ranked,
      isPublic: room.isPublic,
      stake: room.stake,
      maxPlayers: room.maxPlayers,
      status: !game ? 'waiting' : live ? 'playing' : 'between',
      createdAt: room.createdAt,
      players: room.players.map((p) => ({
        nickname: p.nickname,
        userId: p.userId || null,
        isBot: p.isBot,
        away: p.away,
        cards: live ? game.hands[p.id]?.length ?? null : null,
        balance: game ? game.balances[p.id] ?? null : null,
      })),
    };
  });
  const queues = [...matchQueues].map(([key, queue]) => {
    const [stake, maxPlayers] = key.split('-').map(Number);
    return { stake, maxPlayers, players: queue.map((p) => ({ nickname: p.nickname, userId: p.userId || null })) };
  });
  return { rooms: roomList, queues };
}

function isUserBusy(userId) {
  for (const queue of matchQueues.values()) {
    if (queue.some((p) => p.userId === userId)) return true;
  }
  for (const room of rooms.values()) {
    if (room.ranked && room.game && room.players.some((p) => p.userId === userId && !p.left)) return true;
  }
  return false;
}

export {
  rooms, createRoom, joinRoom, startManually,
  getRoomBySocket, seatOf, getNicknames, getBotFlags, getAway, isAutoPlayed,
  leaveSeat, rejoinSeat, dropAwayPlayers, closeIfAbandoned, requestNewHand,
  joinMatchmaking, leaveMatchmaking,
  listOpenRooms, isUserBusy, closeRoom, liveSnapshot,
};
