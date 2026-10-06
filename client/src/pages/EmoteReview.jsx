import { useState, useEffect, useMemo } from 'react';
import { api } from '../utils/api.js';
import { useLang } from '../i18n/index.jsx';
import { findEmote, emoteImage } from '../utils/emotes.js';
import './scores.css';
import './admin.css';

const FILTERS = ['pending', 'approved', 'rejected', 'all'];
const FILTER_LABELS = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', all: 'All' };
const SET_LABELS = { core: 'Game set', twitch: 'Twitch set', extra: 'New set' };

export default function EmoteReview() {
  const { t } = useLang();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('pending');
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    api('/admin/emotes')
      .then((list) => {
        setItems(list);
        if (!list.some((e) => e.status === 'pending')) setFilter('all');
      })
      .catch((e) => setError(e.message));
  }, []);

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0, all: items?.length || 0 };
    for (const e of items || []) c[e.status] += 1;
    return c;
  }, [items]);

  const decide = async (id, status) => {
    setBusy(id);
    setError(null);
    try {
      const saved = await api(`/admin/emotes/${id}`, { method: 'POST', body: { status } });
      setItems((list) => list.map((e) => (e.id === id ? saved : e)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  let body;
  if (!items && error) {
    body = <p className="st-lead">{error === 'Not found' ? t('This page is only for admins.') : t(error)}</p>;
  } else if (!items) {
    body = <p className="st-muted">{t('Loading...')}</p>;
  } else {
    const shown = items.filter((e) => filter === 'all' || e.status === filter);
    body = (
      <div className="st-wide st-stack ad">
        <a className="st-link" href="/admin">{t('Back to admin')}</a>
        <header className="st-header">
          <h1 className="st-title">{t('Emote review')}</h1>
        </header>
        <p className="st-lead">{t('Approved emotes show up in the emote bar the next time a player opens a game.')}</p>
        <div className="er-filters" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              className={`er-filter ${filter === f ? 'er-filter-on' : ''}`}
              onClick={() => setFilter(f)}
            >
              {t(FILTER_LABELS[f])} <span className="er-count">{counts[f]}</span>
            </button>
          ))}
        </div>
        {error && <p className="st-error">{t(error)}</p>}
        {shown.length === 0 && <p className="st-lead">{t('Nothing here.')}</p>}
        <ul className="er-grid">
          {shown.map((item) => {
            const emote = findEmote(item.id);
            return (
              <li key={item.id} className={`st-card er-card er-${item.status}`}>
                <div className="er-art">
                  <img src={emoteImage(item.id)} alt="" width="112" height="112" />
                </div>
                <div className="er-text">
                  <span className="st-strong">{t(emote.label)}</span>
                  <span className="st-small st-muted">{emote.meme}</span>
                  <span className="er-tags">
                    <span className="ad-tag">{t(SET_LABELS[item.set])}</span>
                    <span className={`er-status er-status-${item.status}`}>{t(FILTER_LABELS[item.status])}</span>
                  </span>
                </div>
                <div className="er-actions">
                  {item.status !== 'approved' && (
                    <button className="st-btn st-btn-primary" disabled={busy === item.id} onClick={() => decide(item.id, 'approved')}>
                      {t('Approve')}
                    </button>
                  )}
                  {item.status !== 'rejected' && (
                    <button className="st-btn st-btn-ghost" disabled={busy === item.id} onClick={() => decide(item.id, 'rejected')}>
                      {t('Reject')}
                    </button>
                  )}
                  {item.status !== 'pending' && item.set !== 'core' && (
                    <button className="st-btn st-btn-ghost" disabled={busy === item.id} onClick={() => decide(item.id, 'pending')}>
                      {t('Undo')}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="st">
      <div className="st-inner">{body}</div>
    </div>
  );
}
