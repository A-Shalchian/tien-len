export default function EmoteOverlay({ emoteId, from }) {
  return (
    <div className={`emote-overlay from-${from}`}>
      {emoteId}
    </div>
  );
}
