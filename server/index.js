import express from 'express';
import crypto from 'crypto';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import {
  createRoom, joinRoom, startManually, getRoomBySocket, seatOf,
  getNicknames, getBotFlags, getAway, isAutoPlayed,
  leaveSeat, rejoinSeat, dropAwayPlayers, closeIfAbandoned, requestNewHand,
  joinMatchmaking, leaveMatchmaking,
  listOpenRooms, busyReason, closeRoom, liveSnapshot, STILL_FINISHING, roomsHostedBy, REJOIN_GRACE_MS,
} from './rooms.js';
import { playCards, pass, getGameState, mustPlay3S } from './game/engine.js';
import { findBotPlay } from './game/bot.js';
import { minBalance } from './game/payout.js';
import { toNodeHandler } from 'better-auth/node';
import scoresRouter from './scores.js';
import profileRouter, { loadProfile } from './profile.js';
import { createAdminRouter } from './admin.js';
import { auth, getUserFromHeaders } from './auth.js';
import { getBalance, recordOnlineHand } from './chips.js';
import { renamePlayers } from '../client/src/utils/scoring.js';
import { migrate } from './migrate.js';

import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, '..', 'client', 'dist');

const app = express();
app.use(cors());
app.use(express.static(clientDist));
app.all('/api/auth/*', toNodeHandler(auth));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

function closeRoomFor(code, reason, skipSocketId = null) {
  const room = closeRoom(code);
  if (!room) return false;
  clearTimeout(room.botTimer);
  for (const p of room.players) {
    if (!p.socketId) continue;
    io.sockets.sockets.get(p.socketId)?.leave(room.code);
    if (p.socketId !== skipSocketId) io.to(p.socketId).emit('room-closed', { reason });
  }
  broadcastRoomList();
  return true;
}

app.use('/api/admin', createAdminRouter({
  live: () => ({ ...liveSnapshot(), connections: io.engine.clientsCount }),
  closeRoom: (code) => closeRoomFor(code, 'An admin closed this room.'),
}));
app.use('/api', profileRouter);
app.use('/api', scoresRouter);

const savingHands = new Set();

function saveOnlineHand(room, result) {
  const seats = room.game.players;
  const seatNumber = (id) => String(seats.indexOf(id));
  const { data } = result;
  const players = seats.map((id, seat) => {
    const p = room.players.find((x) => x.id === id);
    const place = data.instantWin ? (id === data.instantWin ? 1 : null) : data.order.indexOf(id) + 1 || null;
    return {
      seat,
      userId: p?.userId || null,
      name: p?.nickname || 'Player',
      place,
      points: result.points[id],
      chips: result.chips[id],
    };
  });
  const hand = { id: crypto.randomBytes(6).toString('hex'), stake: room.stake, data: renamePlayers(data, seatNumber), players };
  const userIds = players.map((p) => p.userId).filter(Boolean);
  for (const id of userIds) savingHands.add(id);
  recordOnlineHand(hand)
    .catch((err) => console.error('Failed to save online hand', err))
    .finally(() => {
      for (const id of userIds) savingHands.delete(id);
    });
}

function broadcastRoomList() {
  io.to('room-browser').emit('room-list', listOpenRooms());
}

function humans(room) {
  return room.players.filter((p) => !p.isBot && !p.away);
}

function emitToHumans(room, event, payload) {
  for (const p of humans(room)) {
    io.to(p.socketId).emit(event, typeof payload === 'function' ? payload(p) : payload);
  }
}

function connOf(socket, nickname) {
  const player = socket.data.player;
  return {
    socketId: socket.id,
    key: socket.data.key,
    userId: player?.userId || null,
    nickname: player?.name || nickname,
  };
}

async function loadPlayer(userId) {
  const profile = await loadProfile(userId);
  if (!profile) return null;
  return { userId: profile.id, name: profile.name, termsAccepted: !!profile.termsAcceptedAt };
}

function broadcastHandOver(room, result) {
  if (room.ranked) saveOnlineHand(room, result);
  room.lastResult = {
    data: result.data,
    instantWinType: result.instantWinType,
    points: result.points,
    chips: result.chips,
    balances: result.balances,
    hands: result.hands,
    nicknames: getNicknames(room),
    stake: room.stake,
  };
  emitToHumans(room, 'hand-over', room.lastResult);
  const dropped = dropAwayPlayers(room);
  if (dropped.length > 0) {
    emitToHumans(room, 'player-left', { nicknames: getNicknames(room), playerCount: room.players.length });
  }
  if (closeIfAbandoned(room)) broadcastRoomList();
}

function startPayload(room, p) {
  const game = room.game;
  return {
    hand: game.hands[p.id] || [],
    firstPlayer: game.turn,
    balances: { ...game.balances },
    nicknames: getNicknames(room),
    bots: getBotFlags(room),
    you: p.id,
    players: game.players,
    stake: room.stake,
    mustPlay3S: mustPlay3S(game, p.id),
  };
}

function statePayload(room, p, result = {}) {
  return {
    ...getGameState(room.game, p.id),
    lastPlay: result.combo ? { cards: result.combo.cards, playedBy: result.playedBy } : undefined,
    passedBy: result.passedBy,
    newRound: result.type === 'new-round' || Boolean(result.newRound),
    nicknames: getNicknames(room),
    bots: getBotFlags(room),
    away: getAway(room),
  };
}

function broadcastGameStart(room, deal) {
  emitToHumans(room, 'game-start', (p) => ({ ...startPayload(room, p), hand: deal.hands[p.id], balances: deal.balances }));

  if (deal.result) {
    broadcastHandOver(room, deal.result);
    return;
  }
  scheduleBotIfNeeded(room);
}

function broadcastChop(room, chop) {
  const nicknames = getNicknames(room);
  emitToHumans(room, 'chop', { ...chop, byName: nicknames[chop.by], victimName: nicknames[chop.victim] });
}

function broadcastState(room, result) {
  emitToHumans(room, 'game-state', (p) => statePayload(room, p, result));
}

function handleResult(room, result) {
  if (result.chop) broadcastChop(room, result.chop);
  if (result.type === 'hand-over') {
    broadcastHandOver(room, result);
    return;
  }
  broadcastState(room, result);
  scheduleBotIfNeeded(room);
}

function scheduleBotIfNeeded(room) {
  if (!room.game || room.game.handOver) return;
  const turn = room.game.turn;
  if (!isAutoPlayed(room, turn)) return;
  clearTimeout(room.botTimer);
  const away = room.players.find((p) => p.id === turn)?.away;
  const delay = away ? 700 : 800 + Math.random() * 1200;
  room.botTimer = setTimeout(() => {
    try {
      executeBotTurn(room, turn);
    } catch (err) {
      console.error(`Bot turn failed in room ${room.code}`, err);
    }
  }, delay);
}

function botContext(game, playerId) {
  return {
    mustPlay3S: mustPlay3S(game, playerId),
    opponents: game.players
      .filter((id) => id !== playerId && !game.finished.includes(id))
      .map((id) => game.hands[id].length),
    ownerCards: game.table ? game.hands[game.table.playedBy]?.length ?? null : null,
    tableChopped: Boolean(game.table?.twos),
  };
}

function executeBotTurn(room, playerId) {
  const game = room.game;
  if (!game || game.handOver || game.turn !== playerId) return;

  const hand = game.hands[playerId];
  const table = game.table ? game.table.combo : null;
  const choice = findBotPlay(hand, table, botContext(game, playerId));

  let result = choice ? playCards(game, playerId, choice.cards.map((c) => c.id)) : null;
  if (!result || result.error) {
    result = table ? pass(game, playerId) : playCards(game, playerId, [hand[0].id]);
  }
  if (result.error) return;
  handleResult(room, result);
}

function handleLeave(socket, left) {
  leaveMatchmaking(socket.id);
  const current = getRoomBySocket(socket.id);
  if (left && current && !current.game && !current.ranked && current.host === seatOf(current, socket.id)?.id) {
    closeRoomFor(current.code, 'The host closed this room.', socket.id);
    return;
  }
  const out = leaveSeat(socket.id, { left });
  if (!out) return;

  const { room, seat } = out;
  socket.leave(room.code);
  broadcastRoomList();
  if (out.closed) return;

  if (out.away) {
    emitToHumans(room, 'player-away', { playerId: seat.id, nickname: seat.nickname, left });
    if (room.game && !room.game.handOver) broadcastState(room, {});
    scheduleBotIfNeeded(room);
    setTimeout(() => {
      if (closeIfAbandoned(room)) broadcastRoomList();
    }, REJOIN_GRACE_MS + 1000);
  } else {
    emitToHumans(room, 'player-left', { nicknames: getNicknames(room), playerCount: room.players.length });
  }
}

function releaseHostedRooms(conn) {
  for (const room of roomsHostedBy(conn)) {
    if (!room.game) {
      closeRoomFor(room.code, 'The host closed this room.');
      continue;
    }
    const host = room.players.find((p) => p.id === room.host);
    const hostSocket = io.sockets.sockets.get(host.socketId);
    if (!hostSocket) continue;
    handleLeave(hostSocket, true);
    hostSocket.emit('room-closed', { reason: 'You opened a new room, so you left this game.' });
  }
}

function seatFor(socket) {
  const room = getRoomBySocket(socket.id);
  const seat = seatOf(room, socket.id);
  return seat && room.game ? { room, seat } : null;
}

io.use(async (socket, next) => {
  const key = socket.handshake.auth?.key;
  socket.data.key = typeof key === 'string' && /^[\w-]{8,64}$/.test(key) ? key : null;
  try {
    const user = await getUserFromHeaders(socket.request.headers);
    socket.data.player = user ? await loadPlayer(user.id) : null;
  } catch (err) {
    console.error('Failed to load socket user', err);
    socket.data.player = null;
  }
  next();
});

io.on('connection', (socket) => {
  socket.on('watch-rooms', () => {
    socket.join('room-browser');
    socket.emit('room-list', listOpenRooms());
  });

  socket.on('unwatch-rooms', () => {
    socket.leave('room-browser');
  });

  socket.on('create-room', ({ nickname, stake, maxPlayers, fillWithBots, isPublic } = {}) => {
    if (getRoomBySocket(socket.id)) handleLeave(socket, true);
    const conn = connOf(socket, nickname);
    releaseHostedRooms(conn);
    const code = createRoom(
      conn,
      Math.max(1, Math.min(100, parseInt(stake) || 10)),
      parseInt(maxPlayers) || 4,
      fillWithBots === true,
      isPublic === true,
    );
    if (!code) {
      socket.emit('join-error', { error: 'Too many rooms are open right now. Try again in a minute.' });
      return;
    }
    socket.join(code);
    socket.emit('room-created', { roomCode: code });
    broadcastRoomList();
  });

  socket.on('join-room', ({ roomCode, nickname } = {}) => {
    const code = String(roomCode || '').toUpperCase();
    const current = getRoomBySocket(socket.id);
    if (current && current.code !== code) handleLeave(socket, true);
    const result = joinRoom(code, connOf(socket, nickname));

    if (result.error) {
      socket.emit('join-error', { error: result.error });
      return;
    }

    socket.join(code);
    broadcastRoomList();

    if (result.waiting) {
      emitToHumans(result.room, 'player-joined', {
        nicknames: getNicknames(result.room),
        bots: getBotFlags(result.room),
        playerCount: result.room.players.length,
        maxPlayers: result.room.maxPlayers,
        roomCode: code,
      });
      return;
    }

    broadcastGameStart(result.room, result.dealResult);
  });

  socket.on('start-game', () => {
    const result = startManually(socket.id);
    if (result.error) {
      socket.emit('join-error', { error: result.error });
      return;
    }

    broadcastRoomList();
    broadcastGameStart(result.room, result.dealResult);
  });

  socket.on('play-cards', ({ cardIds } = {}) => {
    const found = seatFor(socket);
    if (!found) return;
    const { room, seat } = found;

    const result = playCards(room.game, seat.id, cardIds);
    if (result.error) {
      socket.emit('invalid-play', { reason: result.error });
      return;
    }
    handleResult(room, result);
  });

  socket.on('pass', () => {
    const found = seatFor(socket);
    if (!found) return;
    const { room, seat } = found;

    const result = pass(room.game, seat.id);
    if (result.error) {
      socket.emit('invalid-play', { reason: result.error });
      return;
    }
    handleResult(room, result);
  });

  socket.on('new-hand', () => {
    const result = requestNewHand(socket.id);
    if (!result) return;
    if (result.waiting) {
      socket.emit('waiting-for-opponent');
      return;
    }

    const { room } = result;
    for (const k of result.kicked) {
      if (!k.isBot && k.socketId) io.to(k.socketId).emit('kicked-low-balance', { balance: k.balance, needed: minBalance(room.stake) });
      emitToHumans(room, 'player-kicked', { nickname: k.nickname, reason: 'low-balance' });
    }

    if (result.type === 'game-over') {
      emitToHumans(room, 'game-over-insufficient', { reason: 'Not enough players to continue' });
      return;
    }

    broadcastGameStart(room, result.deal);
  });

  socket.on('rejoin', () => {
    const found = rejoinSeat(socket.id, { userId: socket.data.player?.userId, key: socket.data.key });
    if (!found) {
      socket.emit('rejoin-none');
      return;
    }
    const { room, seat } = found;
    socket.join(room.code);
    socket.emit('rejoined', {
      roomCode: room.code,
      start: startPayload(room, seat),
      state: statePayload(room, seat),
      handOver: room.game.handOver ? room.lastResult : null,
    });
    for (const p of humans(room)) {
      if (p.id !== seat.id) io.to(p.socketId).emit('player-back', { playerId: seat.id, nickname: seat.nickname });
    }
    if (!room.game.handOver) broadcastState(room, {});
  });

  socket.on('find-match', async ({ bet, maxPlayers } = {}) => {
    if (!socket.data.player) {
      socket.emit('match-error', { error: 'Sign in with Google to play Quick Match.', needsLogin: true });
      return;
    }

    const stake = Math.max(1, Math.min(250, parseInt(bet) || 10));
    const players = Math.min(Math.max(parseInt(maxPlayers) || 4, 2), 4);

    let player;
    let balance;
    try {
      player = await loadPlayer(socket.data.player.userId);
      balance = player ? await getBalance(player.userId) : 0;
    } catch (err) {
      console.error('Failed to load chips for matchmaking', err);
      socket.emit('match-error', { error: 'Could not load your chips. Try again.' });
      return;
    }

    if (!socket.connected) return;
    if (!player) {
      socket.data.player = null;
      socket.emit('match-error', { error: 'Sign in with Google to play Quick Match.', needsLogin: true });
      return;
    }
    socket.data.player = player;
    if (!player.termsAccepted) {
      socket.emit('match-error', { error: 'Accept the terms to play Quick Match.', needsConsent: true });
      return;
    }
    if (balance < minBalance(stake)) {
      socket.emit('match-error', { error: `You need at least ${minBalance(stake)} chips for this stake. You have ${balance}.` });
      return;
    }
    const busy = busyReason(player.userId) || (savingHands.has(player.userId) ? STILL_FINISHING : null);
    if (busy) {
      socket.emit('match-error', { error: busy });
      return;
    }

    const result = joinMatchmaking(connOf(socket), stake, players, balance);
    if (result.matched) {
      for (const p of result.room.players) io.sockets.sockets.get(p.socketId)?.join(result.room.code);
      broadcastGameStart(result.room, result.dealResult);
    } else {
      socket.emit('match-queued', { position: result.position, needed: result.needed, bet: stake });
    }
  });

  socket.on('cancel-match', () => {
    leaveMatchmaking(socket.id);
    socket.emit('match-cancelled');
  });

  socket.on('leave-room', () => handleLeave(socket, true));

  socket.on('emote', ({ emoteId } = {}) => {
    const room = getRoomBySocket(socket.id);
    const seat = seatOf(room, socket.id);
    if (!seat) return;
    for (const p of humans(room)) {
      if (p.id !== seat.id) io.to(p.socketId).emit('emote', { from: seat.id, emoteId });
    }
  });

  socket.on('disconnect', () => handleLeave(socket, false));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

const PORT = process.env.PORT || 3001;
await migrate();
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
