import { rankValue, suitValue, cardValue, sortCards, RANKS } from './deck.js';

// Identify the combination type of a set of cards
function identifyCombo(cards) {
  if (!cards || cards.length === 0) return null;

  const sorted = sortCards(cards);
  const len = sorted.length;

  if (len === 1) {
    return { type: 'single', cards: sorted, high: sorted[0] };
  }

  if (len === 2 && sorted[0].rank === sorted[1].rank) {
    return { type: 'pair', cards: sorted, high: sorted[1] };
  }

  if (len === 3 && sorted[0].rank === sorted[1].rank && sorted[1].rank === sorted[2].rank) {
    return { type: 'triple', cards: sorted, high: sorted[2] };
  }

  if (len === 4 && allSameRank(sorted)) {
    return { type: 'four-of-a-kind', cards: sorted, high: sorted[3] };
  }

  // Check sequence (3+ consecutive ranks, no 2s)
  if (len >= 3 && isSequence(sorted)) {
    return { type: 'sequence', cards: sorted, high: sorted[len - 1], length: len };
  }

  // Check double sequence (3+ consecutive pairs)
  if (len >= 6 && len % 2 === 0 && isDoubleSequence(sorted)) {
    const pairCount = len / 2;
    return { type: 'double-sequence', cards: sorted, high: sorted[len - 1], pairCount };
  }

  return null;
}

function allSameRank(cards) {
  return cards.every(c => c.rank === cards[0].rank);
}

function isSequence(cards) {
  // No 2s allowed in sequences
  if (cards.some(c => c.rank === '2')) return false;
  // Each card must be exactly 1 rank higher than the previous
  for (let i = 1; i < cards.length; i++) {
    if (rankValue(cards[i].rank) !== rankValue(cards[i - 1].rank) + 1) return false;
  }
  return true;
}

function isDoubleSequence(cards) {
  // No 2s allowed
  if (cards.some(c => c.rank === '2')) return false;
  const sorted = sortCards(cards);
  // Must be consecutive pairs
  for (let i = 0; i < sorted.length; i += 2) {
    if (sorted[i].rank !== sorted[i + 1].rank) return false;
  }
  // Pairs must be consecutive ranks
  for (let i = 2; i < sorted.length; i += 2) {
    if (rankValue(sorted[i].rank) !== rankValue(sorted[i - 2].rank) + 1) return false;
  }
  return true;
}

// Compare two cards by rank then suit
function compareCards(a, b) {
  const rv = rankValue(a.rank) - rankValue(b.rank);
  if (rv !== 0) return rv;
  return suitValue(a.suit) - suitValue(b.suit);
}

// Check if play beats the current table cards
function canBeat(playCombo, tableCombo) {
  if (!tableCombo) return true; // Fresh round, anything goes

  // Bomb logic: four-of-a-kind beats single 2
  if (playCombo.type === 'four-of-a-kind' && tableCombo.type === 'single' && tableCombo.high.rank === '2') {
    return true;
  }

  // Bomb: double-sequence of 3+ pairs beats single 2
  if (playCombo.type === 'double-sequence' && playCombo.pairCount >= 3 &&
      tableCombo.type === 'single' && tableCombo.high.rank === '2') {
    return true;
  }

  // Bomb: double-sequence of 4+ pairs beats pair of 2s
  if (playCombo.type === 'double-sequence' && playCombo.pairCount >= 4 &&
      tableCombo.type === 'pair' && tableCombo.high.rank === '2') {
    return true;
  }

  // Bomb: double-sequence of 5+ pairs beats triple of 2s
  if (playCombo.type === 'double-sequence' && playCombo.pairCount >= 5 &&
      tableCombo.type === 'triple' && tableCombo.high.rank === '2') {
    return true;
  }

  // Normal play: must match type and count
  if (playCombo.type !== tableCombo.type) return false;
  if (playCombo.cards.length !== tableCombo.cards.length) return false;

  // For sequences and double sequences, length must also match
  if (playCombo.type === 'sequence' && playCombo.length !== tableCombo.length) return false;
  if (playCombo.type === 'double-sequence' && playCombo.pairCount !== tableCombo.pairCount) return false;

  // Higher by highest card
  return compareCards(playCombo.high, tableCombo.high) > 0;
}

// Check instant win conditions on deal
function checkInstantWin(hand) {
  const sorted = sortCards(hand);

  // Four 2s
  const twos = sorted.filter(c => c.rank === '2');
  if (twos.length === 4) {
    return { type: 'four-twos', cards: twos };
  }

  // Sequence from 3 through A (12 cards, all non-2 ranks)
  const nonTwos = sorted.filter(c => c.rank !== '2');
  if (nonTwos.length >= 12) {
    // Check if we have at least one card of each rank from 3 to A
    const ranksPresent = new Set(nonTwos.map(c => c.rank));
    const needed = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    if (needed.every(r => ranksPresent.has(r))) {
      return { type: 'dragon', cards: nonTwos.slice(0, 12) };
    }
  }

  return null;
}

export { identifyCombo, canBeat, checkInstantWin, compareCards };
