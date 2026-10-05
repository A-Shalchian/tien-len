export default function OpponentHand({ count }) {
  const shown = Math.min(count, 13);
  return (
    <div className="opponent-cards">
      {Array.from({ length: shown }, (_, i) => (
        <div key={i} className="card-back" />
      ))}
      <span className="card-count">{count}</span>
    </div>
  );
}
