import { useState, useCallback } from 'react';
import { EMOTES, emoteImage } from '../utils/emotes.js';
import { useLang } from '../i18n/index.jsx';

export default function EmoteBar({ onSend }) {
  const { t } = useLang();
  const [cooldown, setCooldown] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleSend = useCallback((id) => {
    if (cooldown) return;
    onSend(id);
    setCooldown(true);
    setTimeout(() => setCooldown(false), 2000);
  }, [cooldown, onSend]);

  return (
    <div className="emote-bar-container">
      <button
        className="emote-toggle-btn"
        aria-expanded={expanded}
        aria-label={expanded ? t('Close emotes') : t('Emotes')}
        onClick={() => setExpanded((p) => !p)}
      >
        {expanded ? '\u2715' : <img className="emote-img" src={emoteImage('gg', false)} alt="" width="28" height="28" />}
      </button>
      {expanded && (
        <div className="emote-grid">
          {EMOTES.map((emote) => (
            <button
              key={emote.id}
              className={`emote-btn ${cooldown ? 'emote-cooldown' : ''}`}
              onClick={() => handleSend(emote.id)}
              disabled={cooldown}
              aria-label={t(emote.label)}
              title={t(emote.label)}
            >
              <img className="emote-img" src={emoteImage(emote.id, false)} alt="" width="28" height="28" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
