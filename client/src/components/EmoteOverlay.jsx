export default function EmoteOverlay({ emoteId, from }) {
  return (
    <div className={`emote-overlay bounce from-${from}`}>
      {emoteId}
    </div>
  );
}
