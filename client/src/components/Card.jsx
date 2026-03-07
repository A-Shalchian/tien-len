import { suitSymbol } from '../utils/cards.js';

export default function Card({ card, selected, onClick, animClass = '', animDelay = 0 }) {
  const isRed = card.suit === 'D' || card.suit === 'H';
  const style = animDelay ? { animationDelay: `${animDelay}s` } : undefined;
  return (
    <div
      className={`card ${isRed ? 'red' : 'black'} ${selected ? 'selected' : ''} ${animClass}`}
      onClick={onClick}
      style={style}
    >
      <span className="card-rank">{card.rank}</span>
      <span className="card-suit">{suitSymbol(card.suit)}</span>
    </div>
  );
}
