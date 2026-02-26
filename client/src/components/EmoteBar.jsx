const EMOTES = ['😤', '😂', '👋', '💀', '🔥', '💔'];

export default function EmoteBar({ onSend }) {
  return (
    <div className="emote-bar">
      {EMOTES.map((emote) => (
        <button key={emote} className="emote-btn" onClick={() => onSend(emote)}>
          {emote}
        </button>
      ))}
    </div>
  );
}
