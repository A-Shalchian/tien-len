import { emoteImage } from '../utils/emotes.js';

export default function EmoteOverlay({ emoteId, from }) {
  const src = emoteImage(emoteId);
  if (!src) return null;
  return (
    <div className={`emote-overlay bounce from-${from}`}>
      <img className="emote-img" src={src} alt="" width="112" height="112" />
    </div>
  );
}
