import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import {
  createRoom, joinRoom, startManually, getRoomBySocket,
  getNicknames, getBotFlags, getBots, removePlayer, requestNewHand,
} from './rooms.js';
import { playCards, pass, getGameState, resolveInstantWin } from './game/engine.js';
import { findBotPlay } from './game/bot.js';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.get('/', (req, res) => {
  res.json({ status: 'Tiên Lên server running' });
});

function broadcastGameStart(room, dealResult) {
  const nicknames = getNicknames(room);
  const bots = getBotFlags(room);

  if (dealResult.type === 'instant-win') {
    const winResult = resolveInstantWin(room.game, dealResult.winner, dealResult.pot);
    for (const p of room.players) {
      if (p.isBot) continue;
      io.to(p.id).emit('game-start', {
        hand: dealResult.hands[p.id],
        firstPlayer: dealResult.winner,
        balances: room.game.balances,
        nicknames,
        bots,
        you: p.id,
        players: room.game.players,
      });
      io.to(p.id).emit('instant-win', {
        winner: dealResult.winner,
        winnerNickname: nicknames[dealResult.winner],
        instantWin: dealResult.instantWin,
        balances: winResult.balances,
      });
    }
    return;
  }

  for (const p of room.players) {
    if (p.isBot) continue;
    io.to(p.id).emit('game-start', {
      hand: dealResult.hands[p.id],
      firstPlayer: dealResult.turn,
      balances: dealResult.balances,
      nicknames,
      bots,
      you: p.id,
      players: room.game.players,
      mustPlay3S: dealResult.turn === p.id && dealResult.mustPlay3S,
    });
  }

  scheduleBotIfNeeded(room);
}

function broadcastState(room, result) {
  const nicknames = getNicknames(room);
  const bots = getBotFlags(room);

  for (const p of room.players) {
    if (p.isBot) continue;
    const state = getGameState(room.game, p.id);
    io.to(p.id).emit('game-state', {
      ...state,
      lastPlay: result.combo ? { cards: result.combo.cards, playedBy: result.playedBy } : undefined,
      passedBy: result.passedBy,
      newRound: result.type === 'new-round' || result.type === 'pass',
      nicknames,
      bots,
    });
  }
}

function scheduleBotIfNeeded(room) {
  if (!room.game) return;
  const currentTurn = room.game.turn;
  const botPlayer = room.players.find(p => p.id === currentTurn && p.isBot);
  if (!botPlayer) return;

  const delay = 800 + Math.random() * 1200;
  setTimeout(() => executeBotTurn(room, botPlayer.id), delay);
}

function executeBotTurn(room, botId) {
  if (!room.game || room.game.turn !== botId) return;

  const hand = room.game.hands[botId];
  if (!hand || hand.length === 0) return;

  const tableCombo = room.game.table ? room.game.table.combo : null;
  const mustPlay3S = !room.game.table &&
    room.game.roundStarter === botId &&
    hand.some(c => c.rank === '3' && c.suit === 'S');

  const play = findBotPlay(hand, tableCombo, mustPlay3S);

  if (!play && tableCombo) {
    const result = pass(room.game, botId);
    if (result.error) return;

    broadcastState(room, result);
    scheduleBotIfNeeded(room);
    return;
  }

  if (!play) return;

  const cardIds = play.cards.map(c => c.id);
  const result = playCards(room.game, botId, cardIds);
  if (result.error) return;

  const nicknames = getNicknames(room);

  if (result.type === 'hand-over') {
    for (const p of room.players) {
      if (p.isBot) continue;
      io.to(p.id).emit('hand-over', {
        winner: result.winner,
        winnerNickname: nicknames[result.winner],
        losers: result.losers,
        pot: result.pot,
        balances: result.balances,
      });
    }
    return;
  }

  broadcastState(room, result);
  scheduleBotIfNeeded(room);
}

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  socket.on('create-room', ({ nickname, ante, maxPlayers, fillWithBots }) => {
    const code = createRoom(socket.id, nickname, ante || 10, maxPlayers || 4, fillWithBots || false);
    socket.join(code);
    socket.emit('room-created', { roomCode: code });
    console.log(`Room ${code} created by ${nickname}`);
  });

  socket.on('join-room', ({ roomCode, nickname }) => {
    const code = roomCode.toUpperCase();
    const result = joinRoom(code, socket.id, nickname);

    if (result.error) {
      socket.emit('join-error', { error: result.error });
      return;
    }

    socket.join(code);

    if (result.waiting) {
      const nicknames = getNicknames(result.room);
      const bots = getBotFlags(result.room);
      for (const p of result.room.players) {
        if (p.isBot) continue;
        io.to(p.id).emit('player-joined', {
          nicknames,
          bots,
          playerCount: result.room.players.length,
          maxPlayers: result.room.maxPlayers,
        });
      }
      return;
    }

    broadcastGameStart(result.room, result.dealResult);
    console.log(`${nickname} joined room ${code}`);
  });

  socket.on('start-game', () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;

    const result = startManually(room.code, socket.id);
    if (result.error) {
      socket.emit('join-error', { error: result.error });
      return;
    }

    broadcastGameStart(result.room, result.dealResult);
  });

  socket.on('play-cards', ({ cardIds }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || !room.game) return;

    const result = playCards(room.game, socket.id, cardIds);

    if (result.error) {
      socket.emit('invalid-play', { reason: result.error });
      return;
    }

    const nicknames = getNicknames(room);

    if (result.type === 'hand-over') {
      for (const p of room.players) {
        if (p.isBot) continue;
        io.to(p.id).emit('hand-over', {
          winner: result.winner,
          winnerNickname: nicknames[result.winner],
          losers: result.losers,
          pot: result.pot,
          balances: result.balances,
        });
      }
      return;
    }

    broadcastState(room, result);
    scheduleBotIfNeeded(room);
  });

  socket.on('pass', () => {
    const room = getRoomBySocket(socket.id);
    if (!room || !room.game) return;

    const result = pass(room.game, socket.id);

    if (result.error) {
      socket.emit('invalid-play', { reason: result.error });
      return;
    }

    broadcastState(room, result);
    scheduleBotIfNeeded(room);
  });

  socket.on('new-hand', () => {
    const room = getRoomBySocket(socket.id);
    if (!room || !room.game) return;

    const result = requestNewHand(room, socket.id);
    if (!result) {
      socket.emit('waiting-for-opponent');
      return;
    }

    broadcastGameStart(room, result);
  });

  socket.on('emote', ({ emoteId }) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;

    for (const p of room.players) {
      if (p.id !== socket.id && !p.isBot) {
        io.to(p.id).emit('emote', { from: socket.id, emoteId });
      }
    }
  });

  socket.on('disconnect', () => {
    const room = removePlayer(socket.id);
    if (room) {
      for (const p of room.players) {
        if (p.id !== socket.id && !p.isBot) {
          io.to(p.id).emit('player-disconnected', { playerId: socket.id });
        }
      }
      console.log(`Player disconnected from room ${room.code}`);
    }
    console.log(`Disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
