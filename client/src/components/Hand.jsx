import Card from './Card.jsx';

export default function Hand({ cards, selectedIds, onToggle, dealing }) {
  return (
    <div className="hand-cards">
      {cards.map((card, index) => (
        <Card
          key={card.id}
          card={card}
          selected={selectedIds.has(card.id)}
          onClick={() => onToggle(card.id)}
          animClass={dealing ? 'dealing' : ''}
          animDelay={dealing ? index * 0.05 : 0}
        />
      ))}
    </div>
  );
}
