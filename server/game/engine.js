import { createDeck, shuffle, deal, sortCards } from './deck.js';
import { identifyCombo, canBeat, checkInstantWin, isBomb } from './validator.js';
import { onlineRules, settleChips } from './payout.js';
import { gameDeltas } from '../../client/src/utils/scoring.js';

const isThreeSpades = (c) => c.rank === '3' && c.suit === 'S';

function twosIn(cards) {
  let black = 0;
  let red = 0;
  for (const c of cards) {
    if (c.rank !== '2') continue;
    if (c.suit === 'S' || c.suit === 'C') black += 1;
    else red += 1;
  }
  return black + red ? { black, red } : null;
}

function createGame(playerIds, stake = 10, startingBalances = {}) {
  return {
    players: [...playerIds],
    balances: Object.fromEntries(playerIds.map((id) => [id, startingBalances[id] ?? 1000])),
    stake,
    hands: {},
    firstHand: true,
    previousWinner: null,
    handOver: true,
  };
}

function setupHand(game, hands, leader) {
  game.hands = Object.fromEntries(game.players.map((id) => [id, sortCards(hands[id])]));
  game.table = null;
  game.passed = new Set();
  game.finished = [];
  game.played = Object.fromEntries(game.players.map((id) => [id, 0]));
  game.cong = [];
  game.chops = [];
  game.threeSpadeWin = false;
  game.handOver = false;
  game.require3S = game.firstHand;
  game.firstHand = false;
  game.turn = leader;
  game.roundStarter = leader;
}

function holderOf3S(game) {
  return game.players.find((id) => game.hands[id].some(isThreeSpades)) || game.players[0];
}

function dealHand(game) {
  const dealt = deal(shuffle(createDeck()), game.players.length);
  const hands = Object.fromEntries(game.players.map((id, i) => [id, dealt[i]]));
  const winnerSeated = game.previousWinner && game.players.includes(game.previousWinner);
  setupHand(game, hands, null);
  const leader = !game.require3S && winnerSeated ? game.previousWinner : holderOf3S(game);
  game.turn = leader;
  game.roundStarter = leader;

  const out = {
    type: 'deal',
    hands: { ...game.hands },
    turn: game.turn,
    balances: { ...game.balances },
  };

  for (const id of [leader, ...game.players.filter((p) => p !== leader)]) {
    const instantWin = checkInstantWin(game.hands[id]);
    if (instantWin) {
      out.result = endHand(game, { instantWin: id, instantWinType: instantWin.type });
      break;
    }
  }
  return out;
}

function inHand(game, id) {
  return game.players.includes(id) && !game.finished.includes(id);
}

function seatsAfter(game, from) {
  const start = game.players.indexOf(from);
  return game.players.map((_, i) => game.players[(start + 1 + i) % game.players.length]);
}

function nextActive(game, from) {
  return seatsAfter(game, from).find((id) => inHand(game, id) && !game.passed.has(id)) || null;
}

function nextInHand(game, from) {
  return seatsAfter(game, from).find((id) => inHand(game, id)) || null;
}

function startRound(game, leader) {
  game.table = null;
  game.passed.clear();
  game.turn = leader;
  game.roundStarter = leader;
}

function mustPlay3S(game, playerId) {
  return Boolean(game.require3S && !game.table && game.turn === playerId && game.hands[playerId]?.some(isThreeSpades));
}

function playCards(game, playerId, cardIds) {
  if (game.handOver) return { error: 'The hand is over' };
  if (game.turn !== playerId) return { error: 'Not your turn' };

  if (!Array.isArray(cardIds)) return { error: 'Those cards are not in your hand' };
  const hand = game.hands[playerId];
  const cards = [];
  for (const id of cardIds) {
    const card = hand.find((c) => c.id === id);
    if (!card || cards.includes(card)) return { error: 'Those cards are not in your hand' };
    cards.push(card);
  }

  const combo = identifyCombo(cards);
  if (!combo) return { error: 'Invalid combination' };
  if (mustPlay3S(game, playerId) && !cards.some(isThreeSpades)) {
    return { error: 'Must play 3♠ on your first play' };
  }

  const table = game.table;
  if (!canBeat(combo, table?.combo || null)) {
    return { error: 'Play does not beat the current cards on the table' };
  }

  let chop = null;
  if (table && isBomb(combo)) {
    const twos = table.combo.high.rank === '2' ? twosIn(table.combo.cards) : table.twos;
    if (twos) {
      chop = { by: playerId, victim: table.playedBy, ...twos };
      game.chops.push(chop);
    }
  }

  game.hands[playerId] = hand.filter((c) => !cards.includes(c));
  game.played[playerId] += cards.length;
  game.table = { combo, playedBy: playerId, twos: chop ? { black: chop.black, red: chop.red } : null };
  game.require3S = false;

  const base = { playedBy: playerId, combo, chop };

  if (game.hands[playerId].length === 0) {
    game.finished.push(playerId);
    if (game.finished.length === 1) {
      game.cong = game.players.filter((id) => id !== playerId && game.played[id] === 0);
      game.threeSpadeWin = cards.some(isThreeSpades);
    }
    const left = game.players.filter((id) => inHand(game, id));
    if (left.length <= 1) {
      return { ...base, ...endHand(game, { last: left[0] }), finishedPlace: game.finished.length };
    }
    const next = nextActive(game, playerId);
    if (next) game.turn = next;
    else startRound(game, nextInHand(game, playerId));
    return { ...base, type: next ? 'play' : 'new-round', turn: game.turn, finishedPlace: game.finished.length };
  }

  const next = nextActive(game, playerId);
  if (next === playerId) {
    startRound(game, playerId);
    return { ...base, type: 'new-round', turn: game.turn };
  }
  game.turn = next;
  return { ...base, type: 'play', turn: game.turn };
}

function pass(game, playerId) {
  if (game.handOver) return { error: 'The hand is over' };
  if (game.turn !== playerId) return { error: 'Not your turn' };
  if (!game.table) return { error: "Can't pass when you start the round" };

  game.passed.add(playerId);
  const owner = game.table.playedBy;
  const next = nextActive(game, playerId);

  if (next === owner) startRound(game, owner);
  else if (!next) startRound(game, nextInHand(game, owner));
  else game.turn = next;

  return { type: 'pass', passedBy: playerId, turn: game.turn, newRound: !game.table };
}

function endHand(game, { last, instantWin, instantWinType }) {
  const order = instantWin ? [] : [...game.finished, ...(last ? [last] : [])];
  const data = {
    order,
    instantWin: instantWin || null,
    stuckTwos: {},
    stuckLast: !instantWin && last ? twosIn(game.hands[last]) : null,
    threeSpadeWin: !instantWin && game.threeSpadeWin,
    cong: instantWin ? [] : game.cong,
    chops: instantWin ? [] : game.chops,
  };
  const points = gameDeltas(data, game.players, onlineRules(game.players.length));
  const chips = settleChips(points, game.stake, game.balances);
  for (const id of game.players) game.balances[id] += chips[id];

  game.handOver = true;
  game.turn = null;
  game.previousWinner = instantWin || order[0];

  return {
    type: 'hand-over',
    data,
    instantWinType: instantWinType || null,
    points,
    chips,
    balances: { ...game.balances },
    hands: Object.fromEntries(game.players.map((id) => [id, game.hands[id]])),
  };
}

function getGameState(game, forPlayerId) {
  const opponents = {};
  for (const id of game.players) {
    if (id !== forPlayerId) opponents[id] = game.hands[id]?.length || 0;
  }
  return {
    hand: game.hands[forPlayerId] || [],
    opponents,
    table: game.table ? game.table.combo.cards : [],
    tablePlayed: game.table ? game.table.playedBy : null,
    turn: game.turn,
    balances: { ...game.balances },
    players: game.players,
    passedPlayers: Array.from(game.passed || []),
    finished: [...(game.finished || [])],
    mustPlay3S: mustPlay3S(game, forPlayerId),
  };
}

export { createGame, setupHand, dealHand, playCards, pass, getGameState, mustPlay3S };
