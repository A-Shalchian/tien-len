import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import {
  createRoom, joinRoom, getRoomBySocket, getNicknames,
  removePlayer, requestNewHand
} from './rooms.js';
import { playCards, pass, getGameState, resolveInstantWin } from './game/engine.js';

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

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  socket.on('create-room', ({ nickname, ante }) => {
    const code = createRoom(socket.id, nickname, ante || 10);
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
    const { room, dealResult } = result;
    const nicknames = getNicknames(room);

    if (dealResult.type === 'instant-win') {
      // Handle instant win on deal
      const winResult = resolveInstantWin(
        room.game, dealResult.winner, dealResult.pot
      );

      for (const p of room.players) {
        io.to(p.id).emit('game-start', {
          hand: dealResult.hands[p.id],
          firstPlayer: dealResult.winner,
          balances: room.game.balances,
          nicknames,
          you: p.id,
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

    // Normal deal
    for (const p of room.players) {
      io.to(p.id).emit('game-start', {
        hand: dealResult.hands[p.id],
        firstPlayer: dealResult.turn,
        balances: dealResult.balances,
        nicknames,
        you: p.id,
        mustPlay3S: dealResult.turn === p.id && dealResult.mustPlay3S,
      });
    }
    console.log(`${nickname} joined room ${code}`);
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
        io.to(p.id).emit('hand-over', {
          winner: result.winner,
          winnerNickname: nicknames[result.winner],
          loserCards: result.loserCards,
          penalty: result.penalty,
          pot: result.pot,
          balances: result.balances,
        });
      }
      return;
    }

    // Send state to both players
    for (const p of room.players) {
      const state = getGameState(room.game, p.id);
      io.to(p.id).emit('game-state', {
        ...state,
        lastPlay: { cards: result.combo.cards, playedBy: result.playedBy },
        newRound: result.type === 'new-round',
        nicknames,
      });
    }
  });

  socket.on('pass', () => {
    const room = getRoomBySocket(socket.id);
    if (!room || !room.game) return;

    const result = pass(room.game, socket.id);

    if (result.error) {
      socket.emit('invalid-play', { reason: result.error });
      return;
    }

    const nicknames = getNicknames(room);
    for (const p of room.players) {
      const state = getGameState(room.game, p.id);
      io.to(p.id).emit('game-state', {
        ...state,
        passedBy: result.passedBy,
        newRound: true,
        nicknames,
      });
    }
  });

  socket.on('new-hand', () => {
    const room = getRoomBySocket(socket.id);
    if (!room || !room.game) return;

    const result = requestNewHand(room, socket.id);
    if (!result) {
      // Waiting for other player
      socket.emit('waiting-for-opponent');
      return;
    }

    const nicknames = getNicknames(room);

    if (result.type === 'instant-win') {
      const winResult = resolveInstantWin(room.game, result.winner, result.pot);
      for (const p of room.players) {
        io.to(p.id).emit('game-start', {
          hand: result.hands[p.id],
          firstPlayer: result.winner,
          balances: room.game.balances,
          nicknames,
          you: p.id,
        });
        io.to(p.id).emit('instant-win', {
          winner: result.winner,
          winnerNickname: nicknames[result.winner],
          instantWin: result.instantWin,
          balances: winResult.balances,
        });
      }
      return;
    }

    for (const p of room.players) {
      io.to(p.id).emit('game-start', {
        hand: result.hands[p.id],
        firstPlayer: result.turn,
        balances: result.balances,
        nicknames,
        you: p.id,
        mustPlay3S: result.turn === p.id && result.mustPlay3S,
      });
    }
  });

  socket.on('emote', ({ emoteId }) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;

    // Send to opponent
    const opponent = room.players.find(p => p.id !== socket.id);
    if (opponent) {
      io.to(opponent.id).emit('emote', { from: socket.id, emoteId });
    }
  });

  socket.on('disconnect', () => {
    const room = removePlayer(socket.id);
    if (room) {
      // Notify remaining player
      for (const p of room.players) {
        if (p.id !== socket.id) {
          io.to(p.id).emit('opponent-disconnected');
        }
      }
      console.log(`Room ${room.code} closed (player disconnected)`);
    }
    console.log(`Disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
