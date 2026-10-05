import { useState, useEffect, useCallback } from 'react';
import { api, getMe, signIn } from '../utils/api.js';
import { formatDelta } from '../utils/scoring.js';
import ConsentGate from './ConsentGate.jsx';
import './scores.css';

const REASONS = {
  signup: 'Welcome chips',
  daily: 'Daily top-up',
  admin: 'Adjustment',
  online: 'Online match',
};

function initials(name) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function Avatar({ name, image, size = 56 }) {
  if (image) {
    return <img className="pf-avatar" src={image} alt="" width={size} height={size} referrerPolicy="no-referrer" />;
  }
  return <span className="pf-avatar pf-initials" style={{ width: size, height: size }}>{initials(name)}</span>;
}

function formatDate(value, withTime = false) {
  const d = new Date(value);
  return withTime
    ? d.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Profile({ userId }) {
  const [me, setMe] = useState(undefined);

  const loadMe = useCallback(() => {
    getMe().then(setMe).catch(() => setMe({ user: null, offline: true }));
  }, []);
  useEffect(loadMe, [loadMe]);

  let body;
  if (me === undefined) body = <p className="st-muted">Loading...</p>;
  else if (!userId && !me.user) {
    body = (
      <section className="st-card st-form">
        <h1 className="st-title st-title-inline">Your profile</h1>
        <p>Sign in with Google to see your games, chips and settings.</p>
        <button className="st-btn st-btn-primary" onClick={() => signIn('/profile')}>Sign in with Google</button>
      </section>
    );
  } else if (me.user && me.needsConsent) body = <ConsentGate onAccepted={loadMe} />;
  else body = <ProfileView id={userId || me.user.id} me={me} onChanged={loadMe} />;

  return (
    <div className="st">
      <div className="st-inner">
        <div className="st-account">
          <a className="st-link" href="/">Home</a>
          <a className="st-link" href="/scores">Score tracker</a>
        </div>
        {body}
      </div>
    </div>
  );
}

function ProfileView({ id, me, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('sessions');

  const load = useCallback(() => {
    api(`/users/${id}`).then(setData).catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  if (error) return <p className="st-error">{error}</p>;
  if (!data) return <p className="st-muted">Loading profile...</p>;

  const tabs = ['sessions', 'chips', 'settings'];
  const tabLabels = { sessions: 'Sessions', chips: 'Chip history', settings: 'Settings' };

  return (
    <>
      <header className="pf-header">
        <Avatar name={data.name} image={data.image} />
        <div className="pf-head-text">
          <h1 className="st-title st-title-inline">{data.name}</h1>
          <p className="st-small st-muted">
            Joined {formatDate(data.joinedAt)}
            {data.isMe && me.profile.privateProfile && ' · Your profile is private'}
            {data.isMe && !me.profile.privateProfile && (
              <> · <a className="st-link" href={`/u/${data.id}`}>Public view</a></>
            )}
          </p>
        </div>
      </header>

      {data.balance !== null && (
        <dl className="pf-stats">
          <Stat label="Chips" value={data.balance.toLocaleString()} />
        </dl>
      )}

      {data.isMe && (
        <>
          <div className="pf-tabs" role="tablist">
            {tabs.map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                className={`st-chip ${tab === t ? 'st-chip-on' : ''}`}
                onClick={() => setTab(t)}
              >
                {tabLabels[t]}
              </button>
            ))}
          </div>

          {tab === 'sessions' && <SessionList sessions={data.sessions} />}
          {tab === 'chips' && <ChipHistory rows={data.chipHistory} />}
          {tab === 'settings' && <Settings me={me} onSaved={() => { onChanged(); load(); }} />}
        </>
      )}
    </>
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
  if (!sessions.length) {
    return <p className="st-muted">No sessions yet. They show up here once you're linked to a player in one.</p>;
  }
  return (
    <>
      <p className="st-small st-muted">Only you can see these. Session games and chips stay inside each session.</p>
      <ul className="st-list">
        {sessions.map((s) => <SessionGroup key={s.id} session={s} />)}
      </ul>
    </>
  );
}

function SessionGroup({ session }) {
  const [open, setOpen] = useState(false);
  const [showUndone, setShowUndone] = useState(false);
  const live = session.games.filter((g) => !g.undoneAt);
  const undoneCount = session.games.length - live.length;
  const numbers = Object.fromEntries(live.map((g, i) => [g.id, live.length - i]));
  const shown = showUndone ? session.games : live;
  const { stats } = session;

  return (
    <li className="st-card pf-session">
      <button className="pf-session-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="pf-session-title">
          <span className="st-strong">{session.name}</span>
          <span className="st-small st-muted">
            {session.lastPlayedAt ? `Last played ${formatDate(session.lastPlayedAt)}` : 'No games yet'}
            {' · '}
            {session.players.join(', ')}
          </span>
        </span>
        <span className={`pf-caret ${open ? 'pf-caret-open' : ''}`} aria-hidden="true">›</span>
      </button>

      <dl className="pf-session-stats">
        <Stat label="Games" value={stats.games} />
        <Stat label="Wins" value={stats.wins} />
        <Stat label="Points" value={formatDelta(stats.points)} />
        {session.chipRate > 0 && <Stat label="Chips" value={formatDelta(stats.chips)} />}
      </dl>

      {open && (
        <div className="pf-session-body">
          {session.canOpen && <a className="st-link" href={`/scores/${session.id}`}>Open session</a>}
          {shown.length === 0 && <p className="st-small st-muted">No games recorded yet.</p>}
          {shown.map((g) => <GameCard key={g.id} game={g} number={numbers[g.id]} />)}
          {undoneCount > 0 && (
            <button className="st-btn st-btn-ghost st-btn-sm pf-undone-toggle" onClick={() => setShowUndone(!showUndone)}>
              {showUndone ? 'Hide undone games' : `Show undone games (${undoneCount})`}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function GameCard({ game, number }) {
  const hasChips = game.players.some((p) => p.chips !== null);
  return (
    <div className={`pf-game ${game.undoneAt ? 'pf-undone' : ''}`}>
      <div className="st-game-head">
        <span className="st-strong">{number ? `Game ${number}` : 'Undone game'}</span>
        <span className="st-small st-muted">{formatDate(game.at, true)}</span>
      </div>
      {game.undoneAt && (
        <div className="st-small pf-undone-note">
          Undone by {game.undoneBy} on {formatDate(game.undoneAt, true)}. It no longer counts.
        </div>
      )}
      <table className="st-table pf-game-table">
        <thead>
          <tr>
            <th className="st-left">Place</th>
            <th className="st-left">Player</th>
            <th>Points</th>
            {hasChips && <th>Chips</th>}
          </tr>
        </thead>
        <tbody>
          {[...game.players].sort((a, b) => (a.place || 99) - (b.place || 99)).map((p) => (
            <tr key={p.name} className={p.isMe ? 'pf-target' : ''}>
              <td className="st-left st-muted">{p.placeLabel || '-'}</td>
              <td className="st-left">
                {p.userId && !p.isMe ? <a className="st-link" href={`/u/${p.userId}`}>{p.name}</a> : p.name}
              </td>
              <td className={tone(p.points)}>{formatDelta(p.points)}</td>
              {hasChips && <td className={tone(p.chips)}>{p.chips === null ? '-' : formatDelta(p.chips)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {game.events.length > 0 && (
        <ul className="pf-events">
          {game.events.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
      <div className="st-small st-muted">Recorded by {game.recordedBy}</div>
    </div>
  );
}

function ChipHistory({ rows }) {
  if (!rows?.length) return <p className="st-muted">No chip movements yet.</p>;
  return (
    <section className="st-card">
      <table className="st-table">
        <thead>
          <tr>
            <th className="st-left">When</th>
            <th className="st-left">What</th>
            <th>Chips</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="st-left st-small st-muted">{formatDate(r.created_at, true)}</td>
              <td className="st-left">{REASONS[r.reason] || r.reason}</td>
              <td className={r.amount > 0 ? 'st-pos' : 'st-neg'}>{formatDelta(r.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Settings({ me, onSaved }) {
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
        <h2 className="st-h2 st-h2-flush">Profile</h2>
        <label className="st-label">
          Display name
          <input
            className="st-input"
            value={displayName}
            maxLength={30}
            placeholder={p.googleName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <span className="st-small st-muted">
            Shown on the leaderboard, your profile and sessions. Leave empty to use your Google name. Player names
            inside sessions stay the same, because past games are recorded under them.
          </span>
        </label>
        <label className="st-check st-check-left">
          <input type="checkbox" checked={hideAvatar} onChange={(e) => setHideAvatar(e.target.checked)} />
          Hide my Google photo and show my initials instead
        </label>

        <h2 className="st-h2">Privacy</h2>
        <label className="st-check st-check-left">
          <input type="checkbox" checked={privateProfile} onChange={(e) => setPrivateProfile(e.target.checked)} />
          Make my profile private, so only I can see it
        </label>
        <label className="st-check st-check-left">
          <input
            type="checkbox"
            checked={hideFromLeaderboard}
            onChange={(e) => setHideFromLeaderboard(e.target.checked)}
          />
          Leave the public chip leaderboard and hide my chip balance on my profile
        </label>

        {error && <p className="st-error">{error}</p>}
        {status && <p className="st-small st-pos">{status}</p>}
        <div className="st-actions">
          <button className="st-btn st-btn-primary" onClick={save}>Save settings</button>
        </div>
      </section>

      <section className="st-card st-form">
        <h2 className="st-h2 st-h2-flush">Your data</h2>
        <p className="st-small st-muted">
          Download everything we store about you as a JSON file: your account, settings, sessions, every game you
          played, your chip history and your recent sign-ins.
        </p>
        <a className="st-btn pf-btn-link" href="/api/me/export" download>Download my data</a>
      </section>

      <section className="st-card st-form pf-danger">
        <h2 className="st-h2 st-h2-flush">Delete account</h2>
        <p className="st-small st-muted">
          This erases your account, sign-ins, settings and chips right away. Sessions you lead pass to another linked
          player, or are deleted if nobody else is linked. Games you played stay in other people's sessions under your
          player name, with no link to you. This can't be undone.
        </p>
        <label className="st-label">
          Type DELETE to confirm
          <input className="st-input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <div className="st-actions">
          <button
            className="st-btn st-btn-danger"
            disabled={confirm !== 'DELETE' || deleting}
            onClick={deleteAccount}
          >
            Delete my account
          </button>
        </div>
      </section>
    </>
  );
}
