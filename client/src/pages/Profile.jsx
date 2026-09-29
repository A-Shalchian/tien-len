import { useState, useEffect, useCallback } from 'react';
import { api, getMe, signIn } from '../utils/api.js';
import { formatDelta } from '../utils/scoring.js';
import ConsentGate from './ConsentGate.jsx';
import './scores.css';

const REASONS = {
  signup: 'Welcome chips',
  daily: 'Daily top-up',
  game: 'Game',
  undo: 'Game undone or session deleted',
  admin: 'Adjustment',
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
  const [tab, setTab] = useState('games');

  const load = useCallback(() => {
    api(`/users/${id}`).then(setData).catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  if (error) return <p className="st-error">{error}</p>;
  if (!data) return <p className="st-muted">Loading profile...</p>;

  const tabs = data.isMe ? ['games', 'chips', 'settings'] : ['games'];

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

      <dl className="pf-stats">
        {data.balance !== null && <Stat label="Chips" value={data.balance.toLocaleString()} />}
        <Stat label="Games" value={data.stats.games} />
        <Stat label="Wins" value={data.stats.wins} />
        <Stat label="Points" value={formatDelta(data.stats.points)} />
        <Stat label="Chips from games" value={formatDelta(data.stats.chips)} />
      </dl>

      {tabs.length > 1 && (
        <div className="pf-tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={`st-chip ${tab === t ? 'st-chip-on' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'games' ? 'Games' : t === 'chips' ? 'Chip history' : 'Settings'}
            </button>
          ))}
        </div>
      )}

      {tab === 'games' && <GameList games={data.games} isMe={data.isMe} />}
      {tab === 'chips' && <ChipHistory rows={data.chipHistory} />}
      {tab === 'settings' && <Settings me={me} onSaved={() => { onChanged(); load(); }} />}
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

function GameList({ games, isMe }) {
  if (!games.length) {
    return (
      <p className="st-muted">
        {isMe ? 'No games yet. Games appear here once you are linked to a player in a session.' : 'No games yet.'}
      </p>
    );
  }
  return (
    <ul className="st-list">
      {games.map((g) => <GameCard key={g.id} game={g} />)}
    </ul>
  );
}

function GameCard({ game }) {
  const hasChips = game.players.some((p) => p.chips !== null);
  return (
    <li className={`st-card st-game ${game.undoneAt ? 'pf-undone' : ''}`}>
      <div className="st-game-head">
        {game.canOpenSession
          ? <a className="st-strong st-link" href={`/scores/${game.sessionId}`}>{game.sessionName}</a>
          : <span className="st-strong">{game.sessionName}</span>}
        <span className="st-small st-muted">{formatDate(game.at, true)}</span>
      </div>
      <div className="st-small st-muted">
        Session {game.sessionId} · Game {game.id}
        {game.recordedBy && ` · Recorded by ${game.recordedBy}`}
      </div>
      {game.undoneAt && (
        <div className="st-small pf-undone-note">
          Undone{game.undoneBy ? ` by ${game.undoneBy}` : ''} on {formatDate(game.undoneAt, true)}. It no longer counts.
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
            <tr key={p.name} className={p.isTarget ? 'pf-target' : ''}>
              <td className="st-left st-muted">{p.placeLabel || '-'}</td>
              <td className="st-left">
                {p.userId && !p.isTarget ? <a className="st-link" href={`/u/${p.userId}`}>{p.name}</a> : p.name}
              </td>
              <td className={p.points > 0 ? 'st-pos' : p.points < 0 ? 'st-neg' : 'st-muted'}>{formatDelta(p.points)}</td>
              {hasChips && (
                <td className={p.chips > 0 ? 'st-pos' : p.chips < 0 ? 'st-neg' : 'st-muted'}>
                  {p.chips === null ? '-' : formatDelta(p.chips)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {game.events.length > 0 && (
        <ul className="pf-events">
          {game.events.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
    </li>
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
              <td className="st-left">
                {REASONS[r.reason] || r.reason}
                {r.session_name && (
                  <span className="st-small st-muted st-link-note">
                    <a className="st-link" href={`/scores/${r.session_id}`}>{r.session_name}</a>
                    {r.game_id && ` · Game ${r.game_id}`}
                  </span>
                )}
              </td>
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
          Make my profile private. Only I can see it, and my name is replaced with "Player 1", "Player 2" and so on
          on other people's public profiles.
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
