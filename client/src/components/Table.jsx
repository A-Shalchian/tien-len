import Card from './Card.jsx';

export default function Table({ cards, animatePlay }) {
  if (!cards || cards.length === 0) {
    return (
      <div className="table-cards">
        <span className="table-info">New round</span>
      </div>
    );
  }

  return (
    <div className="table-cards">
      {cards.map((card, index) => (
        <Card
          key={card.id}
          card={card}
          animClass={animatePlay ? 'playing' : ''}
          animDelay={animatePlay ? index * 0.04 : 0}
        />
      ))}
    </div>
  );
}
