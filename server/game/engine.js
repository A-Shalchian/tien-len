import { createDeck, shuffle, deal, sortCards, cardValue } from './deck.js';
import { identifyCombo, canBeat, checkInstantWin } from './validator.js';

function createGame(player1Id, player2Id, ante = 10) {
  return {
    players: [player1Id, player2Id],
    hands: {},          // playerId → card[]
    balances: { [player1Id]: 1000, [player2Id]: 1000 },
    ante,
    turn: null,         // playerId whose turn it is
    table: null,        // { combo, playedBy } or null (fresh round)
    lastPlayer: null,   // who played last (for pass logic)
    passed: null,       // playerId who passed (locked out until new round)
    roundStarter: null, // who started the current round
    firstGame: true,
    previousWinner: null,
    started: false,
  };
}

function dealHand(game) {
  const deck = shuffle(createDeck());
  const [hand1, hand2] = deal(deck);
  const [p1, p2] = game.players;

  game.hands[p1] = sortCards(hand1);
  game.hands[p2] = sortCards(hand2);
  game.table = null;
  game.lastPlayer = null;
  game.passed = null;
  game.started = true;

  // Deduct ante
  game.balances[p1] -= game.ante;
  game.balances[p2] -= game.ante;
  const pot = game.ante * 2;

  // Determine who goes first
  if (game.firstGame) {
    // Player with 3♠ goes first
    const p1Has3S = game.hands[p1].some(c => c.rank === '3' && c.suit === 'S');
    game.turn = p1Has3S ? p1 : p2;
    game.firstGame = false;
  } else {
    game.turn = game.previousWinner || p1;
  }
  game.roundStarter = game.turn;

  // Check instant wins
  for (const pid of game.players) {
    const instantWin = checkInstantWin(game.hands[pid]);
    if (instantWin) {
      return {
        type: 'instant-win',
        winner: pid,
        instantWin,
        hands: { [p1]: game.hands[p1], [p2]: game.hands[p2] },
        pot,
      };
    }
  }

  return {
    type: 'deal',
    hands: { [p1]: game.hands[p1], [p2]: game.hands[p2] },
    turn: game.turn,
    balances: { ...game.balances },
    pot,
    mustPlay3S: game.turn === game.roundStarter && game.hands[game.turn].some(c => c.rank === '3' && c.suit === 'S'),
  };
}

function getOpponent(game, playerId) {
  return game.players.find(p => p !== playerId);
}

function playCards(game, playerId, cardIds) {
  // Must be your turn
  if (game.turn !== playerId) {
    return { error: 'Not your turn' };
  }

  // Find the actual cards from hand
  const hand = game.hands[playerId];
  const cards = [];
  for (const id of cardIds) {
    const card = hand.find(c => c.id === id);
    if (!card) return { error: `Card ${id} not in your hand` };
    cards.push(card);
  }

  // Identify combo
  const combo = identifyCombo(cards);
  if (!combo) {
    return { error: 'Invalid combination' };
  }

  // First play of first game must include 3♠
  if (game.roundStarter === playerId && !game.table &&
      hand.some(c => c.rank === '3' && c.suit === 'S') &&
      !cards.some(c => c.rank === '3' && c.suit === 'S')) {
    return { error: 'Must play 3♠ on your first play' };
  }

  // Check if it beats the table
  const tableCombo = game.table ? game.table.combo : null;
  if (!canBeat(combo, tableCombo)) {
    return { error: 'Play does not beat the current cards on the table' };
  }

  // Remove cards from hand
  game.hands[playerId] = hand.filter(c => !cardIds.includes(c.id));
  game.table = { combo, playedBy: playerId };
  game.lastPlayer = playerId;

  // Check win
  if (game.hands[playerId].length === 0) {
    return resolveWin(game, playerId);
  }

  // Next turn
  game.turn = getOpponent(game, playerId);
  // If opponent had passed, they're locked out — new round
  if (game.passed === game.turn) {
    // The opponent passed earlier, so this round is over.
    // Current player starts a fresh round.
    game.table = null;
    game.passed = null;
    game.turn = playerId;
    game.roundStarter = playerId;
    return {
      type: 'new-round',
      playedBy: playerId,
      combo,
      hands: sanitizeHands(game),
      turn: game.turn,
      balances: { ...game.balances },
    };
  }

  return {
    type: 'play',
    playedBy: playerId,
    combo,
    hands: sanitizeHands(game),
    turn: game.turn,
    balances: { ...game.balances },
  };
}

function pass(game, playerId) {
  if (game.turn !== playerId) {
    return { error: 'Not your turn' };
  }

  // Can't pass on a fresh round (you're the starter)
  if (!game.table) {
    return { error: "Can't pass when you start the round" };
  }

  game.passed = playerId;
  const opponent = getOpponent(game, playerId);

  // Round ends — opponent starts fresh round
  game.table = null;
  game.turn = opponent;
  game.roundStarter = opponent;
  game.passed = null;

  return {
    type: 'pass',
    passedBy: playerId,
    turn: opponent,
    hands: sanitizeHands(game),
    balances: { ...game.balances },
  };
}

function resolveWin(game, winnerId) {
  const loserId = getOpponent(game, winnerId);
  const loserHand = game.hands[loserId];

  // Calculate chip penalty: 1 per card, 2s count as 5
  let penalty = 0;
  for (const card of loserHand) {
    penalty += card.rank === '2' ? 5 : 1;
  }

  const pot = game.ante * 2;
  game.balances[winnerId] += pot + penalty;
  game.balances[loserId] -= penalty;
  game.previousWinner = winnerId;

  return {
    type: 'hand-over',
    winner: winnerId,
    loser: loserId,
    loserCards: loserHand,
    penalty,
    pot,
    balances: { ...game.balances },
  };
}

function resolveInstantWin(game, winnerId, pot) {
  const loserId = getOpponent(game, winnerId);
  game.balances[winnerId] += pot;
  game.previousWinner = winnerId;

  return {
    type: 'hand-over',
    winner: winnerId,
    loser: loserId,
    loserCards: game.hands[loserId],
    penalty: 0,
    pot,
    balances: { ...game.balances },
    instantWin: true,
  };
}

// Return hand lengths to avoid leaking opponent's cards
function sanitizeHands(game) {
  const result = {};
  for (const pid of game.players) {
    result[pid] = game.hands[pid].length;
  }
  return result;
}

function getGameState(game, forPlayerId) {
  return {
    hand: game.hands[forPlayerId] || [],
    opponentCardCount: game.hands[getOpponent(game, forPlayerId)]?.length || 0,
    table: game.table ? game.table.combo.cards : [],
    tablePlayed: game.table ? game.table.playedBy : null,
    turn: game.turn,
    balances: { ...game.balances },
    players: game.players,
  };
}

export { createGame, dealHand, playCards, pass, getGameState, resolveInstantWin };
