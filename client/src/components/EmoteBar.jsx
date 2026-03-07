import { useState, useCallback } from 'react';

const EMOTES = ['😤', '😂', '👋', '💀', '🔥', '💔', '👑', '🤡', '😎', '🙏', '💪', '😭'];

export default function EmoteBar({ onSend }) {
  const [cooldown, setCooldown] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleSend = useCallback((emote) => {
    if (cooldown) return;
    onSend(emote);
    setCooldown(true);
    setTimeout(() => setCooldown(false), 2000);
  }, [cooldown, onSend]);

  return (
    <div className="emote-bar-container">
      <button
        className="emote-toggle-btn"
        onClick={() => setExpanded((p) => !p)}
      >
        {expanded ? '\u2715' : '\u{1F600}'}
      </button>
      {expanded && (
        <div className="emote-grid">
          {EMOTES.map((emote) => (
            <button
              key={emote}
              className={`emote-btn ${cooldown ? 'emote-cooldown' : ''}`}
              onClick={() => handleSend(emote)}
              disabled={cooldown}
            >
              {emote}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
