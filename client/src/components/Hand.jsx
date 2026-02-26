import Card from './Card.jsx';

export default function Hand({ cards, selectedIds, onToggle }) {
  return (
    <div className="hand-cards">
      {cards.map((card) => (
        <Card
          key={card.id}
          card={card}
          selected={selectedIds.has(card.id)}
          onClick={() => onToggle(card.id)}
        />
      ))}
    </div>
  );
}
