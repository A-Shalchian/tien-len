import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import {
  createRoom, joinRoom, startManually, getRoomBySocket,
  getNicknames, getBotFlags, getAway, isAutoPlayed,
  leaveSeat, dropAwayPlayers, requestNewHand,
  joinMatchmaking, leaveMatchmaking,
  listOpenRooms, isUserBusy, rankedHandMovements,
} from './rooms.js';
import { playCards, pass, getGameState, mustPlay3S } from './game/engine.js';
import { findBotPlay } from './game/bot.js';
import { minBalance } from './game/payout.js';
import { toNodeHandler } from 'better-auth/node';
import scoresRouter from './scores.js';
import profileRouter, { loadProfile } from './profile.js';
import { auth, getUserFromHeaders } from './auth.js';
import { getBalance, recordOnlineChips } from './chips.js';
import { migrate } from './migrate.js';

import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, '..', 'client', 'dist');

const app = express();
app.use(cors());
app.use(express.static(clientDist));
app.all('/api/auth/*', toNodeHandler(auth));
app.use('/api', profileRouter);
app.use('/api', scoresRouter);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

function saveOnlineChips(movements) {
  recordOnlineChips(movements).catch((err) => console.error('Failed to save online chips', err));
}

function broadcastRoomList() {
  io.to('room-browser').emit('room-list', listOpenRooms());
}

function humans(room) {
  return room.players.filter((p) => !p.isBot && !p.away);
}

function emitToHumans(room, event, payload) {
  for (const p of humans(room)) {
    io.to(p.id).emit(event, typeof payload === 'function' ? payload(p) : payload);
  }
}

async function loadPlayer(userId) {
  const profile = await loadProfile(userId);
  if (!profile) return null;
  return { userId: profile.id, name: profile.name, termsAccepted: !!profile.termsAcceptedAt };
}

function broadcastHandOver(room, result) {
  saveOnlineChips(rankedHandMovements(room));
  emitToHumans(room, 'hand-over', {
    data: result.data,
    instantWinType: result.instantWinType,
    points: result.points,
    chips: result.chips,
    balances: result.balances,
    hands: result.hands,
    nicknames: getNicknames(room),
    stake: room.stake,
  });
  const dropped = dropAwayPlayers(room);
  if (dropped.length > 0) {
    emitToHumans(room, 'player-left', { nicknames: getNicknames(room), playerCount: room.players.length });
  }
}

function broadcastGameStart(room, deal) {
  const nicknames = getNicknames(room);
  const bots = getBotFlags(room);
  emitToHumans(room, 'game-start', (p) => ({
    hand: deal.hands[p.id],
    firstPlayer: deal.turn,
    balances: deal.balances,
    nicknames,
    bots,
    you: p.id,
    players: room.game.players,
    stake: room.stake,
    mustPlay3S: mustPlay3S(room.game, p.id),
  }));

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
  const nicknames = getNicknames(room);
  const bots = getBotFlags(room);
  const away = getAway(room);
  emitToHumans(room, 'game-state', (p) => ({
    ...getGameState(room.game, p.id),
    lastPlay: result.combo ? { cards: result.combo.cards, playedBy: result.playedBy } : undefined,
    passedBy: result.passedBy,
    newRound: result.type === 'new-round' || Boolean(result.newRound),
    nicknames,
    bots,
    away,
  }));
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
  room.botTimer = setTimeout(() => executeBotTurn(room, turn), delay);
}

function executeBotTurn(room, playerId) {
  const game = room.game;
  if (!game || game.handOver || game.turn !== playerId) return;

  const hand = game.hands[playerId];
  const table = game.table ? game.table.combo : null;
  const choice = findBotPlay(hand, table, mustPlay3S(game, playerId));

  let result = choice ? playCards(game, playerId, choice.cards.map((c) => c.id)) : null;
  if (!result || result.error) {
    result = table ? pass(game, playerId) : playCards(game, playerId, [hand[0].id]);
  }
  if (result.error) return;
  handleResult(room, result);
}

function handleLeave(socket) {
  leaveMatchmaking(socket.id);
  const left = leaveSeat(socket.id);
  if (!left) return;

  const { room } = left;
  socket.leave(room.code);
  broadcastRoomList();

  if (left.away) {
    emitToHumans(room, 'player-away', { playerId: socket.id, nickname: getNicknames(room)[socket.id] });
    scheduleBotIfNeeded(room);
  } else if (!left.closed) {
    emitToHumans(room, 'player-left', { nicknames: getNicknames(room), playerCount: room.players.length });
  }
}

io.use(async (socket, next) => {
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
    const player = socket.data.player;
    const code = createRoom(
      socket.id,
      player?.name || nickname,
      Math.max(1, Math.min(100, parseInt(stake) || 10)),
      parseInt(maxPlayers) || 4,
      fillWithBots === true,
      isPublic === true,
      player?.userId || null,
    );
    socket.join(code);
    socket.emit('room-created', { roomCode: code });
    broadcastRoomList();
  });

  socket.on('join-room', ({ roomCode, nickname } = {}) => {
    const code = String(roomCode || '').toUpperCase();
    const player = socket.data.player;
    const result = joinRoom(code, socket.id, player?.name || nickname, player?.userId || null);

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
    const room = getRoomBySocket(socket.id);
    if (!room) return;

    const result = startManually(room.code, socket.id);
    if (result.error) {
      socket.emit('join-error', { error: result.error });
      return;
    }

    broadcastRoomList();
    broadcastGameStart(result.room, result.dealResult);
  });

  socket.on('play-cards', ({ cardIds } = {}) => {
    const room = getRoomBySocket(socket.id);
    if (!room || !room.game) return;

    const result = playCards(room.game, socket.id, cardIds);
    if (result.error) {
      socket.emit('invalid-play', { reason: result.error });
      return;
    }
    handleResult(room, result);
  });

  socket.on('pass', () => {
    const room = getRoomBySocket(socket.id);
    if (!room || !room.game) return;

    const result = pass(room.game, socket.id);
    if (result.error) {
      socket.emit('invalid-play', { reason: result.error });
      return;
    }
    handleResult(room, result);
  });

  socket.on('new-hand', () => {
    const room = getRoomBySocket(socket.id);
    if (!room || !room.game) return;

    const result = requestNewHand(room, socket.id);
    if (!result) {
      socket.emit('waiting-for-opponent');
      return;
    }

    for (const k of result.kicked || []) {
      if (!k.isBot) io.to(k.id).emit('kicked-low-balance', { balance: k.balance, needed: minBalance(room.stake) });
      emitToHumans(room, 'player-kicked', { nickname: k.nickname, reason: 'low-balance' });
    }

    if (result.type === 'game-over') {
      emitToHumans(room, 'game-over-insufficient', { reason: 'Not enough players to continue' });
      return;
    }

    broadcastGameStart(room, result);
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
    if (isUserBusy(player.userId)) {
      socket.emit('match-error', { error: 'You are already in a Quick Match in another tab.' });
      return;
    }

    const result = joinMatchmaking(socket.id, player, stake, players, balance);
    if (result.matched) {
      for (const p of result.room.players) io.sockets.sockets.get(p.id)?.join(result.code);
      broadcastGameStart(result.room, result.dealResult);
    } else {
      socket.emit('match-queued', { position: result.position, needed: result.needed, bet: stake });
    }
  });

  socket.on('cancel-match', () => {
    leaveMatchmaking(socket.id);
    socket.emit('match-cancelled');
  });

  socket.on('leave-room', () => handleLeave(socket));

  socket.on('emote', ({ emoteId } = {}) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    for (const p of humans(room)) {
      if (p.id !== socket.id) io.to(p.id).emit('emote', { from: socket.id, emoteId });
    }
  });

  socket.on('disconnect', () => handleLeave(socket));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

const PORT = process.env.PORT || 3001;
await migrate();
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
