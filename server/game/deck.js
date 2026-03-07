const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const SUITS = ['S', 'C', 'D', 'H'];

function createDeck() {
  const deck = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push({ rank, suit, id: `${rank}${suit}` });
    }
  }
  return deck;
}

function shuffle(deck) {
  const a = [...deck];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function deal(deck, playerCount = 4) {
  const hands = [];
  for (let i = 0; i < playerCount; i++) {
    hands.push(deck.slice(i * 13, (i + 1) * 13));
  }
  return hands;
}

function rankValue(rank) {
  return RANKS.indexOf(rank);
}

function suitValue(suit) {
  return SUITS.indexOf(suit);
}

function cardValue(card) {
  return rankValue(card.rank) * 4 + suitValue(card.suit);
}

function sortCards(cards) {
  return [...cards].sort((a, b) => cardValue(a) - cardValue(b));
}

export { RANKS, SUITS, createDeck, shuffle, deal, rankValue, suitValue, cardValue, sortCards };
