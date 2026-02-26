const SUIT_SYMBOLS = { S: '♠', C: '♣', D: '♦', H: '♥' };
const SUIT_COLORS = { S: '#fff', C: '#fff', D: '#e74c3c', H: '#e74c3c' };

export function suitSymbol(suit) {
  return SUIT_SYMBOLS[suit] || suit;
}

export function suitColor(suit) {
  return SUIT_COLORS[suit] || '#fff';
}

export function cardDisplay(card) {
  return `${card.rank}${suitSymbol(card.suit)}`;
}
