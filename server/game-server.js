import crypto from 'crypto';
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
import { renamePlayers } from '../client/src/utils/scoring.js';
import { clientIp, SLOW_DOWN } from './security.js';

export const MAX_MESSAGE_BYTES = 10000;
export const TURN_MS = 25000;
const IDLE_AFTER_TIMEOUTS = 2;
export const DEFAULT_LIMITS = {
  events: 40,
  eventWindowMs: 5000,
  rooms: 5,
  roomWindowMs: 10000,
  connections: 30,
  connectionWindowMs: 60000,
};
const ROOM_EVENTS = { 'create-room': 'join-error', 'join-room': 'join-error', 'find-match': 'match-error' };
const EMOTE_COOLDOWN_MS = 800;
const NOT_IN_HAND = 'Those cards are not in your hand';

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function text(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function whole(value) {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function allow(store, name, limit, windowMs) {
  const now = Date.now();
  const bucket = store[name];
  if (!bucket || now >= bucket.reset) {
    store[name] = { count: 1, reset: now + windowMs };
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

function cardList(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 13) return null;
  return value.every((id) => typeof id === 'string' && id.length <= 3) ? value : null;
}

export function createGameServer(io, deps) {
  const { getUser, loadPlayer, getBalance, recordOnlineHand } = deps;
  const onError = deps.onError || ((err, where) => console.error(`Socket handler ${where} failed`, err));
  const savingHands = new Set();
  const limits = { ...DEFAULT_LIMITS, ...deps.limits };
  const turnMs = deps.turnMs ?? TURN_MS;
  const connectionsByIp = new Map();

  function safely(where, fn) {
    try {
      const out = fn();
      if (out && typeof out.catch === 'function') out.catch((err) => onError(err, where));
    } catch (err) {
      onError(err, where);
    }
  }

  function on(socket, event, handler) {
    socket.on(event, (payload) => safely(event, () => {
      if (event !== 'disconnect') {
        if (!allow(socket.data, 'events', limits.events, limits.eventWindowMs)) return undefined;
        if (ROOM_EVENTS[event] && !allow(socket.data, 'rooms', limits.rooms, limits.roomWindowMs)) {
          socket.emit(ROOM_EVENTS[event], { error: SLOW_DOWN });
          return undefined;
        }
      }
      return handler(asObject(payload));
    }));
  }

  function allowConnection(ip) {
    if (connectionsByIp.size > 5000) {
      const now = Date.now();
      for (const [key, store] of connectionsByIp) if (now >= store.connections.reset) connectionsByIp.delete(key);
    }
    if (!connectionsByIp.has(ip)) connectionsByIp.set(ip, {});
    return allow(connectionsByIp.get(ip), 'connections', limits.connections, limits.connectionWindowMs);
  }

  function later(where, fn, ms) {
    const timer = setTimeout(() => safely(where, fn), ms);
    timer.unref?.();
    return timer;
  }

  function closeRoomFor(code, reason, skipSocketId = null) {
    const room = closeRoom(code);
    if (!room) return false;
    clearTimeout(room.botTimer);
    clearTimeout(room.turnTimer);
    for (const p of room.players) {
      if (!p.socketId) continue;
      io.sockets.sockets.get(p.socketId)?.leave(room.code);
      if (p.socketId !== skipSocketId) io.to(p.socketId).emit('room-closed', { reason });
    }
    broadcastRoomList();
    return true;
  }

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
    Promise.resolve()
      .then(() => recordOnlineHand(hand))
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

  function connOf(socket, nickname = '') {
    const player = socket.data.player;
    return {
      socketId: socket.id,
      key: socket.data.key,
      userId: player?.userId || null,
      nickname: player?.name || nickname,
    };
  }

  function broadcastHandOver(room, result) {
    clearTimeout(room.turnTimer);
    room.turnDeadline = null;
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
      ...turnInfo(room),
    };
  }

  function turnInfo(room) {
    return {
      turnMsLeft: room.turnDeadline ? Math.max(0, room.turnDeadline - Date.now()) : null,
      idle: room.players.filter((p) => p.idle).map((p) => p.id),
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
      ...turnInfo(room),
    };
  }

  function broadcastGameStart(room, deal) {
    room.moves = (room.moves || 0) + 1;
    if (!deal.result) scheduleNextTurn(room);
    emitToHumans(room, 'game-start', (p) => ({ ...startPayload(room, p), hand: deal.hands[p.id], balances: deal.balances }));
    if (deal.result) broadcastHandOver(room, deal.result);
  }

  function broadcastChop(room, chop) {
    const nicknames = getNicknames(room);
    emitToHumans(room, 'chop', { ...chop, byName: nicknames[chop.by], victimName: nicknames[chop.victim] });
  }

  function broadcastState(room, result) {
    emitToHumans(room, 'game-state', (p) => statePayload(room, p, result));
  }

  function handleResult(room, result) {
    room.moves = (room.moves || 0) + 1;
    if (result.chop) broadcastChop(room, result.chop);
    if (result.type === 'hand-over') {
      broadcastHandOver(room, result);
      return;
    }
    scheduleNextTurn(room);
    broadcastState(room, result);
  }

  function scheduleNextTurn(room) {
    const game = room.game;
    if (!game || game.handOver) {
      clearTimeout(room.turnTimer);
      room.turnDeadline = null;
      return;
    }
    const turn = game.turn;
    const seat = room.players.find((p) => p.id === turn);
    if (isAutoPlayed(room, turn)) {
      clearTimeout(room.turnTimer);
      room.turnDeadline = null;
      clearTimeout(room.botTimer);
      const delay = seat?.away || seat?.idle ? 700 : 800 + Math.random() * 1200;
      room.botTimer = later(`bot turn in room ${room.code}`, () => executeBotTurn(room, turn), delay);
      return;
    }
    clearTimeout(room.botTimer);
    const key = `${turn}:${room.moves}`;
    if (room.turnKey === key && room.turnDeadline) return;
    clearTimeout(room.turnTimer);
    room.turnKey = key;
    room.turnDeadline = Date.now() + turnMs;
    room.turnTimer = later(`turn timer in room ${room.code}`, () => timeOutTurn(room, turn), turnMs);
  }

  function timeOutTurn(room, playerId) {
    const game = room.game;
    if (!game || game.handOver || game.turn !== playerId) return;
    const seat = room.players.find((p) => p.id === playerId);
    if (!seat) return;
    room.turnDeadline = null;
    seat.timeouts = (seat.timeouts || 0) + 1;
    if (seat.timeouts >= IDLE_AFTER_TIMEOUTS) seat.idle = true;
    const action = game.table ? 'pass' : 'play';
    const result = game.table ? pass(game, playerId) : playCards(game, playerId, [game.hands[playerId][0].id]);
    emitToHumans(room, 'turn-timeout', { playerId, nickname: seat.nickname, action, idle: Boolean(seat.idle) });
    if (result.error) {
      executeBotTurn(room, playerId);
      return;
    }
    handleResult(room, result);
  }

  function markActive(seat) {
    seat.timeouts = 0;
    seat.idle = false;
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
      scheduleNextTurn(room);
      if (room.game && !room.game.handOver) broadcastState(room, {});
      later(`abandon check in room ${room.code}`, () => {
        if (closeIfAbandoned(room)) broadcastRoomList();
      }, REJOIN_GRACE_MS + 1000);
    } else {
      emitToHumans(room, 'player-left', { nicknames: getNicknames(room), playerCount: room.players.length });
    }
  }

  function releaseHostedRooms(conn) {
    for (const room of roomsHostedBy(conn)) {
      const host = room.players.find((p) => p.id === room.host);
      if (!room.game) {
        closeRoomFor(room.code, 'The host closed this room.', host.socketId);
        io.to(host.socketId).emit('room-closed', { reason: 'You opened a new room, so your old one closed.' });
        continue;
      }
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
    if (!allowConnection(clientIp(socket.handshake.headers, socket.handshake.address))) {
      next(new Error(SLOW_DOWN));
      return;
    }
    const key = socket.handshake.auth?.key;
    socket.data.key = typeof key === 'string' && /^[\w-]{8,64}$/.test(key) ? key : null;
    try {
      const user = await getUser(socket.request.headers);
      socket.data.player = user ? await loadPlayer(user.id) : null;
    } catch (err) {
      console.error('Failed to load socket user', err);
      socket.data.player = null;
    }
    next();
  });

  io.on('connection', (socket) => {
    on(socket, 'watch-rooms', () => {
      socket.join('room-browser');
      socket.emit('room-list', listOpenRooms());
    });

    on(socket, 'unwatch-rooms', () => {
      socket.leave('room-browser');
    });

    on(socket, 'create-room', ({ nickname, stake, maxPlayers, fillWithBots, isPublic }) => {
      if (getRoomBySocket(socket.id)) handleLeave(socket, true);
      const conn = connOf(socket, text(nickname, 40));
      releaseHostedRooms(conn);
      const code = createRoom(
        conn,
        clamp(whole(stake) || 10, 1, 100),
        clamp(whole(maxPlayers) || 4, 2, 4),
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

    on(socket, 'join-room', ({ roomCode, nickname }) => {
      const code = text(roomCode, 8).toUpperCase();
      const current = getRoomBySocket(socket.id);
      if (current && current.code !== code) handleLeave(socket, true);
      const result = joinRoom(code, connOf(socket, text(nickname, 40)));

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

    on(socket, 'start-game', () => {
      const result = startManually(socket.id);
      if (result.error) {
        socket.emit('join-error', { error: result.error });
        return;
      }

      broadcastRoomList();
      broadcastGameStart(result.room, result.dealResult);
    });

    on(socket, 'play-cards', ({ cardIds }) => {
      const found = seatFor(socket);
      if (!found) return;
      const { room, seat } = found;

      const cards = cardList(cardIds);
      const result = cards ? playCards(room.game, seat.id, cards) : { error: NOT_IN_HAND };
      if (result.error) {
        socket.emit('invalid-play', { reason: result.error });
        return;
      }
      markActive(seat);
      handleResult(room, result);
    });

    on(socket, 'pass', () => {
      const found = seatFor(socket);
      if (!found) return;
      const { room, seat } = found;

      const result = pass(room.game, seat.id);
      if (result.error) {
        socket.emit('invalid-play', { reason: result.error });
        return;
      }
      markActive(seat);
      handleResult(room, result);
    });

    on(socket, 'resume', () => {
      const found = seatFor(socket);
      if (!found || !found.seat.idle) return;
      markActive(found.seat);
      scheduleNextTurn(found.room);
      if (!found.room.game.handOver) broadcastState(found.room, {});
    });

    on(socket, 'new-hand', () => {
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

    on(socket, 'rejoin', () => {
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
      scheduleNextTurn(room);
      if (!room.game.handOver) broadcastState(room, {});
    });

    on(socket, 'find-match', async ({ bet, maxPlayers }) => {
      if (!socket.data.player) {
        socket.emit('match-error', { error: 'Sign in with Google to play Quick Match.', needsLogin: true });
        return;
      }

      const stake = clamp(whole(bet) || 10, 1, 250);
      const players = clamp(whole(maxPlayers) || 4, 2, 4);

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

    on(socket, 'cancel-match', () => {
      leaveMatchmaking(socket.id);
      socket.emit('match-cancelled');
    });

    on(socket, 'leave-room', () => handleLeave(socket, true));

    on(socket, 'emote', ({ emoteId }) => {
      const id = text(emoteId, 16);
      if (!id) return;
      const now = Date.now();
      if (now - (socket.data.lastEmote || 0) < EMOTE_COOLDOWN_MS) return;
      const room = getRoomBySocket(socket.id);
      const seat = seatOf(room, socket.id);
      if (!seat) return;
      socket.data.lastEmote = now;
      for (const p of humans(room)) {
        if (p.id !== seat.id) io.to(p.socketId).emit('emote', { from: seat.id, emoteId: id });
      }
    });

    on(socket, 'disconnect', () => handleLeave(socket, false));
  });

  return {
    closeRoomFor,
    live: () => ({ ...liveSnapshot(), connections: io.engine.clientsCount }),
  };
}
