import { suitSymbol } from '../utils/cards.js';

export default function Card({ card, selected, onClick, animClass = '', animDelay = 0 }) {
  const isRed = card.suit === 'D' || card.suit === 'H';
  const style = animDelay ? { animationDelay: `${animDelay}s` } : undefined;
  const suit = suitSymbol(card.suit);
  return (
    <div
      className={`card ${isRed ? 'red' : 'black'} ${selected ? 'selected' : ''} ${animClass}`}
      onClick={onClick}
      style={style}
    >
      <div className="card-pip-top">
        <span className="pip-rank">{card.rank}</span>
        <span className="pip-suit">{suit}</span>
      </div>
      <span className="card-rank">{card.rank}</span>
      <span className="card-suit">{suit}</span>
      <div className="card-pip-bottom">
        <span className="pip-rank">{card.rank}</span>
        <span className="pip-suit">{suit}</span>
      </div>
    </div>
  );
}
