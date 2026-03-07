import { createDeck, shuffle, deal, sortCards, cardValue } from './deck.js';
import { identifyCombo, canBeat, checkInstantWin } from './validator.js';

function createGame(playerIds, ante = 10) {
  const balances = {};
  for (const id of playerIds) {
    balances[id] = 1000;
  }

  return {
    players: [...playerIds],
    hands: {},
    balances,
    ante,
    turn: null,
    table: null,
    lastPlayer: null,
    passedPlayers: new Set(),
    roundStarter: null,
    firstGame: true,
    previousWinner: null,
    started: false,
  };
}

function dealHand(game) {
  const deck = shuffle(createDeck());
  const hands = deal(deck, game.players.length);

  for (let i = 0; i < game.players.length; i++) {
    game.hands[game.players[i]] = sortCards(hands[i]);
  }

  game.table = null;
  game.lastPlayer = null;
  game.passedPlayers = new Set();
  game.started = true;

  for (const pid of game.players) {
    game.balances[pid] -= game.ante;
  }
  const pot = game.ante * game.players.length;

  if (game.firstGame) {
    game.turn = findPlayerWith3S(game);
    game.firstGame = false;
  } else {
    game.turn = game.previousWinner || game.players[0];
  }
  game.roundStarter = game.turn;

  for (const pid of game.players) {
    const instantWin = checkInstantWin(game.hands[pid]);
    if (instantWin) {
      const allHands = {};
      for (const p of game.players) {
        allHands[p] = game.hands[p];
      }
      return {
        type: 'instant-win',
        winner: pid,
        instantWin,
        hands: allHands,
        pot,
      };
    }
  }

  const allHands = {};
  for (const p of game.players) {
    allHands[p] = game.hands[p];
  }

  return {
    type: 'deal',
    hands: allHands,
    turn: game.turn,
    balances: { ...game.balances },
    pot,
    mustPlay3S: game.hands[game.turn].some(c => c.rank === '3' && c.suit === 'S'),
  };
}

function findPlayerWith3S(game) {
  for (const pid of game.players) {
    if (game.hands[pid].some(c => c.rank === '3' && c.suit === 'S')) {
      return pid;
    }
  }
  return game.players[0];
}

function getNextPlayer(game, currentId) {
  const idx = game.players.indexOf(currentId);
  let next = (idx + 1) % game.players.length;
  return game.players[next];
}

function getActivePlayers(game) {
  return game.players.filter(p => !game.passedPlayers.has(p));
}

function playCards(game, playerId, cardIds) {
  if (game.turn !== playerId) {
    return { error: 'Not your turn' };
  }

  const hand = game.hands[playerId];
  const cards = [];
  for (const id of cardIds) {
    const card = hand.find(c => c.id === id);
    if (!card) return { error: `Card ${id} not in your hand` };
    cards.push(card);
  }

  const combo = identifyCombo(cards);
  if (!combo) {
    return { error: 'Invalid combination' };
  }

  if (game.roundStarter === playerId && !game.table &&
      hand.some(c => c.rank === '3' && c.suit === 'S') &&
      !cards.some(c => c.rank === '3' && c.suit === 'S')) {
    return { error: 'Must play 3♠ on your first play' };
  }

  const tableCombo = game.table ? game.table.combo : null;
  if (!canBeat(combo, tableCombo)) {
    return { error: 'Play does not beat the current cards on the table' };
  }

  game.hands[playerId] = hand.filter(c => !cardIds.includes(c.id));
  game.table = { combo, playedBy: playerId };
  game.lastPlayer = playerId;

  if (game.hands[playerId].length === 0) {
    return resolveWin(game, playerId);
  }

  const nextPlayer = advanceTurn(game, playerId);

  if (nextPlayer === playerId) {
    game.table = null;
    game.passedPlayers.clear();
    game.roundStarter = playerId;
    return {
      type: 'new-round',
      playedBy: playerId,
      combo,
      turn: game.turn,
      balances: { ...game.balances },
    };
  }

  return {
    type: 'play',
    playedBy: playerId,
    combo,
    turn: game.turn,
    balances: { ...game.balances },
  };
}

function advanceTurn(game, currentId) {
  let next = getNextPlayer(game, currentId);

  while (game.passedPlayers.has(next)) {
    if (next === currentId) break;
    next = getNextPlayer(game, next);
  }

  if (next === currentId) {
    game.table = null;
    game.passedPlayers.clear();
    game.roundStarter = currentId;
  }

  game.turn = next;
  return next;
}

function pass(game, playerId) {
  if (game.turn !== playerId) {
    return { error: 'Not your turn' };
  }

  if (!game.table) {
    return { error: "Can't pass when you start the round" };
  }

  game.passedPlayers.add(playerId);

  const activePlayers = getActivePlayers(game);

  if (activePlayers.length === 1) {
    const roundWinner = activePlayers[0];
    game.table = null;
    game.passedPlayers.clear();
    game.turn = roundWinner;
    game.roundStarter = roundWinner;

    return {
      type: 'pass',
      passedBy: playerId,
      turn: roundWinner,
      balances: { ...game.balances },
    };
  }

  advanceTurn(game, playerId);

  return {
    type: 'pass',
    passedBy: playerId,
    turn: game.turn,
    balances: { ...game.balances },
  };
}

function resolveWin(game, winnerId) {
  const losers = game.players.filter(p => p !== winnerId);
  const loserData = {};
  let totalPenalty = 0;

  for (const loserId of losers) {
    const loserHand = game.hands[loserId];
    let penalty = 0;
    for (const card of loserHand) {
      penalty += card.rank === '2' ? 5 : 1;
    }
    loserData[loserId] = { cards: loserHand, penalty };
    totalPenalty += penalty;
    game.balances[loserId] -= penalty;
  }

  const pot = game.ante * game.players.length;
  game.balances[winnerId] += pot + totalPenalty;
  game.previousWinner = winnerId;

  return {
    type: 'hand-over',
    winner: winnerId,
    losers: loserData,
    pot,
    balances: { ...game.balances },
  };
}

function resolveInstantWin(game, winnerId, pot) {
  const losers = game.players.filter(p => p !== winnerId);
  const loserData = {};
  for (const loserId of losers) {
    loserData[loserId] = { cards: game.hands[loserId], penalty: 0 };
  }

  game.balances[winnerId] += pot;
  game.previousWinner = winnerId;

  return {
    type: 'hand-over',
    winner: winnerId,
    losers: loserData,
    pot,
    balances: { ...game.balances },
    instantWin: true,
  };
}

function getGameState(game, forPlayerId) {
  const opponents = {};
  for (const pid of game.players) {
    if (pid !== forPlayerId) {
      opponents[pid] = game.hands[pid]?.length || 0;
    }
  }

  return {
    hand: game.hands[forPlayerId] || [],
    opponents,
    table: game.table ? game.table.combo.cards : [],
    tablePlayed: game.table ? game.table.playedBy : null,
    turn: game.turn,
    balances: { ...game.balances },
    players: game.players,
    passedPlayers: Array.from(game.passedPlayers),
  };
}

export { createGame, dealHand, playCards, pass, getGameState, resolveInstantWin };
