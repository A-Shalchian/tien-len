import Card from './Card.jsx';

export default function Table({ cards }) {
  if (!cards || cards.length === 0) {
    return (
      <div className="table-cards">
        <span className="table-info">New round</span>
      </div>
    );
  }

  return (
    <div className="table-cards">
      {cards.map((card) => (
        <Card key={card.id} card={card} />
      ))}
    </div>
  );
}
