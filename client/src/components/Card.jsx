import { suitSymbol, suitColor } from '../utils/cards.js';

export default function Card({ card, selected, onClick }) {
  const isRed = card.suit === 'D' || card.suit === 'H';
  return (
    <div
      className={`card ${isRed ? 'red' : 'black'} ${selected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <span className="card-rank">{card.rank}</span>
      <span className="card-suit">{suitSymbol(card.suit)}</span>
    </div>
  );
}
