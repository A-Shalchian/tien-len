import { useState, useEffect, useCallback } from 'react';
import { api, getMe, signIn } from '../utils/api.js';
import { formatDelta } from '../utils/scoring.js';
import { useLang } from '../i18n/index.jsx';
import { formatDateTime, gameEvents, placeName } from '../i18n/describe.js';
import ConsentGate from './ConsentGate.jsx';
import './scores.css';

const REASONS = {
  signup: 'Welcome chips',
  daily: 'Daily top-up',
  admin: 'Adjustment',
  online: 'Online match',
};

const DELETED_ACCOUNT = 'a deleted account';

function initials(name) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function Avatar({ name, image, size = 56 }) {
  if (image) {
    return <img className="pf-avatar" src={image} alt="" width={size} height={size} referrerPolicy="no-referrer" />;
  }
  return <span className="pf-avatar pf-initials" style={{ width: size, height: size }}>{initials(name)}</span>;
}

export default function Profile({ userId }) {
  const { t } = useLang();
  const [me, setMe] = useState(undefined);

  const loadMe = useCallback(() => {
    getMe().then(setMe).catch(() => setMe({ user: null, offline: true }));
  }, []);
  useEffect(loadMe, [loadMe]);

  let body;
  if (me === undefined) body = <p className="st-muted">{t('Loading...')}</p>;
  else if (!userId && !me.user) {
    body = (
      <section className="st-card st-form">
        <h1 className="st-title st-title-inline">{t('Your profile')}</h1>
        <p>{t('Sign in with Google to see your games, chips and settings.')}</p>
        <button className="st-btn st-btn-primary" onClick={() => signIn('/profile')}>{t('Sign in with Google')}</button>
      </section>
    );
  } else if (me.user && me.needsConsent) body = <ConsentGate onAccepted={loadMe} />;
  else body = <ProfileView id={userId || me.user.id} me={me} onChanged={loadMe} />;

  return (
    <div className="st">
      <div className="st-inner">
        {body}
      </div>
    </div>
  );
}

function ProfileView({ id, me, onChanged }) {
  const { t, locale } = useLang();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState(() => {
    const wanted = new URLSearchParams(window.location.search).get('tab');
    return ['online', 'chips', 'settings'].includes(wanted) ? wanted : 'sessions';
  });

  const load = useCallback(() => {
    api(`/users/${id}`).then(setData).catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  if (error) return <p className="st-error">{t(error)}</p>;
  if (!data) return <p className="st-muted">{t('Loading profile...')}</p>;

  const tabs = ['sessions', 'online', 'chips', 'settings'];
  const tabLabels = { sessions: 'Sessions', online: 'Online', chips: 'Chip history', settings: 'Settings' };

  const selectTab = (key) => {
    setTab(key);
    const url = key === 'sessions' ? window.location.pathname : `${window.location.pathname}?tab=${key}`;
    history.replaceState(history.state, '', url);
  };

  return (
    <div className={`st-wide pf-layout ${data.isMe ? '' : 'pf-layout-solo'}`}>
      <aside className="pf-side">
        <PlayerCard data={data} me={me} />
        {data.isMe && (
          <nav className="pf-nav" role="tablist" aria-label={t('Profile sections')}>
            {tabs.map((key) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                className={`pf-nav-item ${tab === key ? 'pf-nav-on' : ''}`}
                onClick={() => selectTab(key)}
              >
                {t(tabLabels[key])}
              </button>
            ))}
          </nav>
        )}
      </aside>

      {data.isMe && (
        <section className="pf-main">
          <h2 className="pf-section-title">{t(tabLabels[tab])}</h2>
          {tab === 'sessions' && <SessionList sessions={data.sessions} />}
          {tab === 'online' && <OnlineHands hands={data.onlineHands} />}
          {tab === 'chips' && <ChipHistory rows={data.chipHistory} />}
          {tab === 'settings' && <Settings me={me} onSaved={() => { onChanged(); load(); }} />}
        </section>
      )}
    </div>
  );
}

function PlayerCard({ data, me }) {
  const { t, locale } = useLang();
  const mark = initials(data.name);
  return (
    <div className="pf-card">
      <span className="pf-corner pf-corner-top" aria-hidden="true">{mark}<i>♠</i></span>
      <span className="pf-corner pf-corner-bottom" aria-hidden="true">{mark}<i>♠</i></span>
      <Avatar name={data.name} image={data.image} size={88} />
      <h1 className="pf-name">{data.name}</h1>
      <p className="pf-joined">
        {t('Joined {date}', { date: formatDateTime(locale, data.joinedAt) })}
        {data.isMe && me.profile.privateProfile && <><br />{t('Your profile is private')}</>}
        {data.isMe && !me.profile.privateProfile && (
          <><br /><a className="st-link" href={`/u/${data.id}`}>{t('Public view')}</a></>
        )}
      </p>
      {data.balance !== null && (
        <div className="pf-balance">
          <span className="pf-balance-num">{data.balance.toLocaleString(locale)}</span>
          <span className="pf-balance-label">{t('chips')}</span>
        </div>
      )}
      <dl className="pf-card-stats">
        <Stat label={t('Online hands')} value={data.online.hands} />
        <Stat label={t('Online wins')} value={data.online.wins} />
        {data.online.chips !== null && <Stat label={t('Online chips')} value={formatDelta(data.online.chips)} />}
      </dl>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="pf-stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function tone(n) {
  return n > 0 ? 'st-pos' : n < 0 ? 'st-neg' : 'st-muted';
}

function SessionList({ sessions }) {
  const { t } = useLang();
  if (!sessions.length) {
    return <p className="st-lead">{t("No sessions yet. They show up here once you're linked to a player in one.")}</p>;
  }
  return (
    <>
      <p className="st-lead">{t('Only you can see these. Session games and chips stay inside each session.')}</p>
      <ul className="pf-session-grid">
        {sessions.map((s) => <SessionGroup key={s.id} session={s} />)}
      </ul>
    </>
  );
}

function SessionGroup({ session }) {
  const { t, locale } = useLang();
  const [open, setOpen] = useState(false);
  const [showUndone, setShowUndone] = useState(false);
  const live = session.games.filter((g) => !g.undoneAt);
  const undoneCount = session.games.length - live.length;
  const numbers = Object.fromEntries(live.map((g, i) => [g.id, live.length - i]));
  const shown = showUndone ? session.games : live;
  const { stats } = session;

  return (
    <li className={`st-card pf-session ${open ? 'pf-session-open' : ''}`}>
      <button className="pf-session-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="pf-session-title">
          <span className="st-strong">{session.name}</span>
          <span className="st-small st-muted">{session.players.join(', ')}</span>
          <span className="st-small st-muted">
            {session.lastPlayedAt
              ? t('Last played {date}', { date: formatDateTime(locale, session.lastPlayedAt) })
              : t('No games yet')}
          </span>
        </span>
        <svg className={`pf-caret ${open ? 'pf-caret-open' : ''}`} width="18" height="18" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <dl className="pf-session-stats">
        <Stat label={t('Games')} value={stats.games} />
        <Stat label={t('Wins')} value={stats.wins} />
        <Stat label={t('Points')} value={formatDelta(stats.points)} />
        {session.chipRate > 0 && <Stat label={t('Chips')} value={formatDelta(stats.chips)} />}
      </dl>

      {open && (
        <div className="pf-session-body">
          {session.canOpen && <a className="st-link" href={`/scores/${session.id}`}>{t('Open session')}</a>}
          {shown.length === 0 && <p className="st-small st-muted">{t('No games recorded yet.')}</p>}
          <div className="pf-game-grid">
            {shown.map((g) => <GameCard key={g.id} game={g} number={numbers[g.id]} />)}
          </div>
          {undoneCount > 0 && (
            <button className="st-btn st-btn-ghost st-btn-sm pf-undone-toggle" onClick={() => setShowUndone(!showUndone)}>
              {showUndone ? t('Hide undone games') : t('Show undone games ({n})', { n: undoneCount })}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function GameCard({ game, number }) {
  const { t, locale } = useLang();
  const hasChips = game.players.some((p) => p.chips !== null);
  const person = (name) => (name === DELETED_ACCOUNT ? t(DELETED_ACCOUNT) : name);
  const events = gameEvents(t, game.data);
  return (
    <div className={`pf-game ${game.undoneAt ? 'pf-undone' : ''}`}>
      <div className="st-game-head">
        <span className="st-strong">{number ? t('Game {n}', { n: number }) : t('Undone game')}</span>
        <span className="st-small st-muted">{formatDateTime(locale, game.at, true)}</span>
      </div>
      {game.undoneAt && (
        <div className="st-small pf-undone-note">
          {t('Undone by {name} on {date}. It no longer counts.', {
            name: person(game.undoneBy),
            date: formatDateTime(locale, game.undoneAt, true),
          })}
        </div>
      )}
      <table className="st-table pf-game-table">
        <thead>
          <tr>
            <th className="st-left">{t('Place')}</th>
            <th className="st-left">{t('Player')}</th>
            <th>{t('Points')}</th>
            {hasChips && <th>{t('Chips')}</th>}
          </tr>
        </thead>
        <tbody>
          {[...game.players].sort((a, b) => (a.place || 99) - (b.place || 99)).map((p) => (
            <tr key={p.name} className={p.isMe ? 'pf-target' : ''}>
              <td className="st-left st-muted">{p.place ? placeName(t, p.place) : '-'}</td>
              <td className="st-left">
                {p.userId && !p.isMe ? <a className="st-link" href={`/u/${p.userId}`}>{p.name}</a> : p.name}
              </td>
              <td className={tone(p.points)}>{formatDelta(p.points)}</td>
              {hasChips && <td className={tone(p.chips)}>{p.chips === null ? '-' : formatDelta(p.chips)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {events.length > 0 && (
        <ul className="pf-events">
          {events.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
      <div className="st-small st-muted">{t('Recorded by {name}', { name: person(game.recordedBy) })}</div>
    </div>
  );
}

function OnlineHands({ hands }) {
  const { t, locale } = useLang();
  if (!hands.length) return <p className="st-lead">{t('No Quick Match hands yet.')}</p>;
  return (
    <ul className="pf-session-grid">
      {hands.map((h) => {
        const events = gameEvents(t, h.data);
        return (
          <li key={h.id} className="st-card st-game">
            <div className="st-game-head">
              <span className="st-strong">{t('Quick Match')}</span>
              <span className="st-badge">{t('{n} per point', { n: h.stake })}</span>
              <span className="st-small st-muted">{formatDateTime(locale, h.at, true)}</span>
            </div>
            <table className="st-table pf-game-table">
              <thead>
                <tr>
                  <th className="st-left">{t('Place')}</th>
                  <th className="st-left">{t('Player')}</th>
                  <th>{t('Points')}</th>
                  <th>{t('Chips')}</th>
                </tr>
              </thead>
              <tbody>
                {h.players.map((p, i) => (
                  <tr key={i} className={p.isMe ? 'pf-target' : ''}>
                    <td className="st-left st-muted">{p.place ? placeName(t, p.place) : '-'}</td>
                    <td className="st-left">{p.name}</td>
                    <td className={tone(p.points)}>{formatDelta(p.points)}</td>
                    <td className={tone(p.chips)}>{formatDelta(p.chips)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {events.length > 0 && (
              <ul className="pf-events">
                {events.map((ev) => <li key={ev}>{ev}</li>)}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ChipHistory({ rows }) {
  const { t, locale } = useLang();
  if (!rows?.length) return <p className="st-lead">{t('No chip movements yet.')}</p>;
  return (
    <section className="st-card">
      <table className="st-table">
        <thead>
          <tr>
            <th className="st-left">{t('When')}</th>
            <th className="st-left">{t('What')}</th>
            <th>{t('Chips')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="st-left st-small st-muted">{formatDateTime(locale, r.created_at, true)}</td>
              <td className="st-left">{t(REASONS[r.reason] || r.reason)}</td>
              <td className={r.amount > 0 ? 'st-pos' : 'st-neg'}>{formatDelta(r.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Settings({ me, onSaved }) {
  const { t } = useLang();
  const p = me.profile;
  const [displayName, setDisplayName] = useState(p.displayName || '');
  const [hideAvatar, setHideAvatar] = useState(p.hideAvatar);
  const [hideFromLeaderboard, setHideFromLeaderboard] = useState(p.hideFromLeaderboard);
  const [privateProfile, setPrivateProfile] = useState(p.privateProfile);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    setError(null);
    setStatus(null);
    try {
      await api('/me/settings', {
        method: 'PATCH',
        body: { displayName, hideAvatar, hideFromLeaderboard, privateProfile },
      });
      setStatus('Settings saved.');
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setError(null);
    try {
      await api('/me', { method: 'DELETE', body: { confirm } });
      window.location.href = '/';
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  };

  return (
    <>
      <section className="st-card st-form">
        <h2 className="st-h2 st-h2-flush">{t('Profile')}</h2>
        <label className="st-label">
          {t('Display name')}
          <input
            className="st-input"
            value={displayName}
            maxLength={30}
            placeholder={p.googleName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <span className="st-small st-muted">
            {t('Shown on the leaderboard, your profile and sessions. Leave empty to use your Google name. Player names inside sessions stay the same, because past games are recorded under them.')}
          </span>
        </label>
        <label className="st-check st-check-left">
          <input type="checkbox" checked={hideAvatar} onChange={(e) => setHideAvatar(e.target.checked)} />
          {t('Hide my Google photo and show my initials instead')}
        </label>

        <h2 className="st-h2">{t('Privacy')}</h2>
        <label className="st-check st-check-left">
          <input type="checkbox" checked={privateProfile} onChange={(e) => setPrivateProfile(e.target.checked)} />
          {t('Make my profile private, so only I can see it')}
        </label>
        <label className="st-check st-check-left">
          <input
            type="checkbox"
            checked={hideFromLeaderboard}
            onChange={(e) => setHideFromLeaderboard(e.target.checked)}
          />
          {t('Leave the public chip leaderboard and hide my chip balance on my profile')}
        </label>

        {error && <p className="st-error">{t(error)}</p>}
        {status && <p className="st-small st-pos">{t(status)}</p>}
        <div className="st-actions">
          <button className="st-btn st-btn-primary" onClick={save}>{t('Save settings')}</button>
        </div>
      </section>

      <section className="st-card st-form">
        <h2 className="st-h2 st-h2-flush">{t('Your data')}</h2>
        <p className="st-small st-muted">
          {t('Download everything we store about you as a JSON file: your account, settings, sessions, every game you played, your chip history and your recent sign-ins.')}
        </p>
        <a className="st-btn pf-btn-link" href="/api/me/export" download>{t('Download my data')}</a>
      </section>

      <section className="st-card st-form pf-danger">
        <h2 className="st-h2 st-h2-flush">{t('Delete account')}</h2>
        <p className="st-small st-muted">
          {t("This erases your account, sign-ins, settings and chips right away. Sessions you lead pass to another linked player, or are deleted if nobody else is linked. Games you played stay in other people's sessions under your player name, with no link to you. This can't be undone.")}
        </p>
        <label className="st-label">
          {t('Type DELETE to confirm')}
          <input className="st-input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <div className="st-actions">
          <button
            className="st-btn st-btn-danger"
            disabled={confirm !== 'DELETE' || deleting}
            onClick={deleteAccount}
          >
            {t('Delete my account')}
          </button>
        </div>
      </section>
    </>
  );
}
