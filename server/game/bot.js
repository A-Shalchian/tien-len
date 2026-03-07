import { identifyCombo, canBeat } from './validator.js';
import { sortCards } from './deck.js';

const BOT_NAMES = [
  'Minh', 'Lan', 'Hoa', 'Duc', 'Thao',
  'Phong', 'Linh', 'Tuan', 'Mai', 'Khoa',
];

let botCounter = 0;

function createBotId() {
  return `bot_${Date.now()}_${botCounter++}`;
}

function pickBotName(usedNames) {
  const available = BOT_NAMES.filter(n => !usedNames.includes(n));
  if (available.length === 0) return `Bot${Math.floor(Math.random() * 99)}`;
  return available[Math.floor(Math.random() * available.length)];
}

function findBotPlay(hand, tableCombo, mustPlay3S) {
  const sorted = sortCards(hand);

  const allCombos = generateAllCombos(sorted);

  const validPlays = allCombos.filter(combo => canBeat(combo, tableCombo));

  if (mustPlay3S) {
    const plays3S = validPlays.filter(c => c.cards.some(card => card.rank === '3' && card.suit === 'S'));
    if (plays3S.length > 0) {
      return selectPlay(plays3S);
    }
  }

  if (validPlays.length === 0) return null;

  return selectPlay(validPlays);
}

function selectPlay(validPlays) {
  validPlays.sort((a, b) => {
    if (a.cards.length !== b.cards.length) return b.cards.length - a.cards.length;
    return comboStrength(a) - comboStrength(b);
  });

  const nonTwoPlays = validPlays.filter(c => !c.cards.some(card => card.rank === '2'));
  if (nonTwoPlays.length > 0) return nonTwoPlays[0];

  return validPlays[0];
}

function comboStrength(combo) {
  let sum = 0;
  for (const card of combo.cards) {
    sum += card.rank === '2' ? 100 : 0;
  }
  return sum + (combo.high ? combo.high.rank === '2' ? 50 : 0 : 0);
}

function generateAllCombos(hand) {
  const combos = [];

  for (const card of hand) {
    combos.push(identifyCombo([card]));
  }

  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      const c = identifyCombo([hand[i], hand[j]]);
      if (c) combos.push(c);
    }
  }

  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      for (let k = j + 1; k < hand.length; k++) {
        const c = identifyCombo([hand[i], hand[j], hand[k]]);
        if (c) combos.push(c);
      }
    }
  }

  if (hand.length >= 4) {
    for (let i = 0; i < hand.length; i++) {
      for (let j = i + 1; j < hand.length; j++) {
        for (let k = j + 1; k < hand.length; k++) {
          for (let l = k + 1; l < hand.length; l++) {
            const c = identifyCombo([hand[i], hand[j], hand[k], hand[l]]);
            if (c) combos.push(c);
          }
        }
      }
    }
  }

  for (let len = 3; len <= hand.length; len++) {
    findSequences(hand, len, combos);
  }

  for (let pairs = 3; pairs * 2 <= hand.length; pairs++) {
    findDoubleSequences(hand, pairs, combos);
  }

  return combos.filter(Boolean);
}

function findSequences(hand, len, combos) {
  const byRank = groupByRank(hand);
  const ranks = Object.keys(byRank).map(Number).sort((a, b) => a - b);

  for (let i = 0; i <= ranks.length - len; i++) {
    let consecutive = true;
    for (let j = 1; j < len; j++) {
      if (ranks[i + j] !== ranks[i] + j) {
        consecutive = false;
        break;
      }
    }
    if (!consecutive) continue;

    const cards = [];
    for (let j = 0; j < len; j++) {
      cards.push(byRank[ranks[i + j]][0]);
    }
    const c = identifyCombo(cards);
    if (c) combos.push(c);
  }
}

function findDoubleSequences(hand, pairCount, combos) {
  const byRank = {};
  for (const card of hand) {
    const rv = rankValueLocal(card.rank);
    if (rv === 12) continue;
    if (!byRank[rv]) byRank[rv] = [];
    byRank[rv].push(card);
  }

  const ranksWithPairs = Object.keys(byRank)
    .map(Number)
    .filter(r => byRank[r].length >= 2)
    .sort((a, b) => a - b);

  for (let i = 0; i <= ranksWithPairs.length - pairCount; i++) {
    let consecutive = true;
    for (let j = 1; j < pairCount; j++) {
      if (ranksWithPairs[i + j] !== ranksWithPairs[i] + j) {
        consecutive = false;
        break;
      }
    }
    if (!consecutive) continue;

    const cards = [];
    for (let j = 0; j < pairCount; j++) {
      cards.push(byRank[ranksWithPairs[i + j]][0]);
      cards.push(byRank[ranksWithPairs[i + j]][1]);
    }
    const c = identifyCombo(cards);
    if (c) combos.push(c);
  }
}

function groupByRank(hand) {
  const groups = {};
  for (const card of hand) {
    const rv = rankValueLocal(card.rank);
    if (!groups[rv]) groups[rv] = [];
    groups[rv].push(card);
  }
  return groups;
}

const RANKS_ORDER = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
function rankValueLocal(rank) {
  return RANKS_ORDER.indexOf(rank);
}

export { createBotId, pickBotName, findBotPlay };
