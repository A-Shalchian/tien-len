import { useState, useCallback, useEffect } from 'react';
import { CORE_EMOTE_IDS, findEmote, emoteImage } from '../utils/emotes.js';
import { api } from '../utils/api.js';
import { useLang } from '../i18n/index.jsx';

let enabledRequest = null;

function loadEnabled() {
  enabledRequest ||= api('/emotes')
    .then((data) => {
      const ids = Array.isArray(data?.enabled) ? data.enabled.filter((id) => findEmote(id)) : [];
      return ids.length ? ids : CORE_EMOTE_IDS;
    })
    .catch(() => {
      enabledRequest = null;
      return CORE_EMOTE_IDS;
    });
  return enabledRequest;
}

export default function EmoteBar({ onSend }) {
  const { t } = useLang();
  const [cooldown, setCooldown] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [ids, setIds] = useState(CORE_EMOTE_IDS);

  useEffect(() => {
    let live = true;
    loadEnabled().then((list) => {
      if (live) setIds(list);
    });
    return () => {
      live = false;
    };
  }, []);

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
        {expanded ? '✕' : <img className="emote-img" src={emoteImage('gg', false)} alt="" width="28" height="28" />}
      </button>
      {expanded && (
        <div className="emote-grid">
          {ids.map((id) => {
            const label = t(findEmote(id).label);
            return (
              <button
                key={id}
                className={`emote-btn ${cooldown ? 'emote-cooldown' : ''}`}
                onClick={() => handleSend(id)}
                disabled={cooldown}
                aria-label={label}
                title={label}
              >
                <img className="emote-img" src={emoteImage(id, false)} alt="" width="28" height="28" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
