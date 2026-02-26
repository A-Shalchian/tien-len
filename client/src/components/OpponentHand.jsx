export default function OpponentHand({ count }) {
  // Show up to 13 card backs, clamp for visual sanity
  const shown = Math.min(count, 13);
  return (
    <div className="opponent-cards">
      {Array.from({ length: shown }, (_, i) => (
        <div key={i} className="card-back" />
      ))}
    </div>
  );
}
