const SUIT_SYMBOLS = { S: '♠', C: '♣', D: '♦', H: '♥' };

export function suitSymbol(suit) {
  return SUIT_SYMBOLS[suit] || suit;
}
