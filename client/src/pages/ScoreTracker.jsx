import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DEFAULT_PLACE_POINTS, DEFAULT_PENALTIES, gameDeltas, sessionStats, formatDelta, isLegacyRules,
} from '../utils/scoring.js';
import { api, getMe, signIn } from '../utils/api.js';
import { cached, remember, queuedGames, setQueuedGames, newClientId } from '../utils/offline.js';
import { useLang } from '../i18n/index.jsx';
import { placeName, chopText, stuckLastText, rulesText, formatDateTime } from '../i18n/describe.js';
import ConsentGate from './ConsentGate.jsx';
import { PointsChart, HeadToHead } from './TrackerCharts.jsx';
import './scores.css';

function parseRoute() {
  const path = window.location.pathname;
  const join = path.match(/^\/scores\/join\/([a-f0-9]+)$/);
  if (join) return { view: 'join', code: join[1] };
  const session = path.match(/^\/scores\/([a-f0-9]+)$/);
  if (session) return { view: 'session', id: session[1] };
  return { view: 'list' };
}

export default function ScoreTracker() {
  const { t, href } = useLang();
  const [route, setRoute] = useState(parseRoute);
  const [me, setMe] = useState(undefined);

  const loadMe = useCallback(() => {
    getMe()
      .then((m) => setMe(m.user ? remember('me', m) : m))
      .catch(() => {
        const saved = cached('me');
        setMe(saved ? { ...saved, offline: true } : { user: null, offline: true });
      });
  }, []);

  useEffect(loadMe, [loadMe]);

  useEffect(() => {
    const onPop = () => setRoute(parseRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const open = useCallback((id) => {
    history.pushState({}, '', id ? `/scores/${id}` : href('/scores'));
    setRoute(parseRoute());
  }, [href]);

  let body;
  if (me === undefined) body = <p className="st-muted">{t('Loading...')}</p>;
  else if (!me.user) body = <SignInCard offline={me.offline} joining={route.view === 'join'} />;
  else if (me.needsConsent) body = <ConsentGate onAccepted={loadMe} />;
  else if (route.view === 'join') body = <JoinView code={route.code} onJoined={open} />;
  else if (route.view === 'session') body = <SessionView id={route.id} onBack={() => open(null)} />;
  else body = <SessionList onOpen={open} />;

  return (
    <div className="st">
      <div className="st-inner">
        {body}
      </div>
    </div>
  );
}

function SignInCard({ offline, joining }) {
  const { t } = useLang();
  const [error, setError] = useState(null);
  const start = () => signIn().catch((e) => setError(e.message));
  if (offline) {
    return <p className="st-error">{t("The server isn't reachable right now. Check your connection and reload the page.")}</p>;
  }
  return (
    <section className="st-card st-form">
      <h1 className="st-title st-title-inline">{t('Score tracker')}</h1>
      <p>
        {joining
          ? t('Sign in with Google to join this session.')
          : t('Sign in with Google to start a session, invite your table and track chips.')}
      </p>
      {error && <p className="st-error">{t(error)}</p>}
      <button className="st-btn st-btn-primary" onClick={start}>{t('Sign in with Google')}</button>
    </section>
  );
}

function JoinView({ code, onJoined }) {
  const { t } = useLang();
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/join/${code}`).then(setInvite).catch((e) => setError(e.message));
  }, [code]);

  const join = async (claim) => {
    setBusy(true);
    setError(null);
    try {
      const { id } = await api(`/join/${code}`, { method: 'POST', body: { claim } });
      onJoined(id);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  if (error && !invite) return <p className="st-error">{t(error)}</p>;
  if (!invite) return <p className="st-muted">{t('Loading invite...')}</p>;

  if (invite.joined && invite.claimed) {
    const [before, after] = t("You're already in {name}.").split('{name}');
    return (
      <section className="st-card st-form">
        <p>{before}<strong>{invite.name}</strong>{after}</p>
        <button className="st-btn st-btn-primary" onClick={() => onJoined(invite.id)}>{t('Open session')}</button>
      </section>
    );
  }

  return (
    <section className="st-card st-form">
      <h1 className="st-title st-title-inline">{invite.name}</h1>
      <p className="st-muted">{t('{name} invited you. Which player are you?', { name: invite.leaderName })}</p>
      {invite.openPlayers.length > 0 ? (
        <div className="st-order">
          {invite.openPlayers.map((p) => (
            <button key={p} className="st-chip" disabled={busy} onClick={() => join(p)}>{p}</button>
          ))}
        </div>
      ) : (
        <p className="st-muted">{t('Every seat is taken.')}</p>
      )}
      <p className="st-small st-muted">
        {t("Picking a player links your account to it, so this session's games show up on your profile.")}
      </p>
      {error && <p className="st-error">{t(error)}</p>}
      <button className="st-btn st-btn-ghost" disabled={busy} onClick={() => join(null)}>{t('Just watch')}</button>
    </section>
  );
}

function SessionList({ onOpen }) {
  const { t, locale } = useLang();
  const [sessions, setSessions] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/sessions')
      .then((list) => setSessions(remember('sessions', list)))
      .catch((e) => {
        const saved = cached('sessions');
        if (e.offline && saved) setSessions(saved);
        else setError(e.message);
      });
  }, []);

  return (
    <div className="st-wide st-stack">
      <header className="st-header">
        <h1 className="st-title">{t('Score tracker')}</h1>
        {!creating && (
          <button className="st-btn st-btn-primary" onClick={() => setCreating(true)}>{t('New session')}</button>
        )}
      </header>

      {creating && (
        <div className="st-narrow">
          <NewSessionForm onCancel={() => setCreating(false)} onCreated={(s) => onOpen(s.id)} />
        </div>
      )}

      {error && <p className="st-error">{t(error)}</p>}

      <h2 className="st-h2">{t('Your sessions')}</h2>
      {sessions === null && !error && <p className="st-muted">{t('Loading...')}</p>}
      {sessions?.length === 0 && (
        <p className="st-lead">{t('No sessions yet. Start one, or open an invite link from a session leader.')}</p>
      )}
      <ul className="st-session-grid">
        {sessions?.map((s) => (
          <li key={s.id}>
            <button className="st-card st-session-row" onClick={() => onOpen(s.id)}>
              <span className="st-session-name">
                {s.name}
                {s.role === 'leader' && <span className="st-badge">{t('Leader')}</span>}
              </span>
              <span className="st-muted">{s.players.join(', ')}</span>
              <span className="st-muted st-small">{formatDateTime(locale, s.createdAt)}</span>
              <span className="st-session-count">
                {s.gameCount}
                <span>{t(s.gameCount === 1 ? 'game' : 'games')}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewSessionForm({ onCancel, onCreated }) {
  const { t } = useLang();
  const [name, setName] = useState('');
  const [count, setCount] = useState(3);
  const [me, setMe] = useState(0);
  const [chipRate, setChipRate] = useState(10);
  const [players, setPlayers] = useState(['', '', '', '']);
  const [showRules, setShowRules] = useState(false);
  const [place, setPlace] = useState(null);
  const [penalties, setPenalties] = useState(DEFAULT_PENALTIES);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const filled = players.slice(0, count).map((p) => p.trim()).filter(Boolean);
  const placePoints = place && place.length === count ? place : DEFAULT_PLACE_POINTS[count];

  const setPlayer = (i, value) => setPlayers((prev) => prev.map((p, j) => (j === i ? value : p)));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await api('/sessions', {
        method: 'POST',
        body: { name, players: filled, me, chipRate, rules: { place: placePoints, ...penalties } },
      });
      onCreated(session);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="st-card st-form" onSubmit={submit}>
      <label className="st-label">
        {t('Session name')}
        <input
          className="st-input"
          value={name}
          maxLength={40}
          placeholder={t('Friday night')}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <div className="st-label">{t('Number of players')}</div>
      <div className="st-order">
        {[2, 3, 4].map((n) => (
          <button
            key={n}
            type="button"
            className={`st-chip ${count === n ? 'st-chip-on' : ''}`}
            onClick={() => setCount(n)}
          >
            {t('{n} players', { n })}
          </button>
        ))}
      </div>

      {players.slice(0, count).map((p, i) => (
        <input
          key={i}
          className="st-input"
          value={p}
          maxLength={20}
          placeholder={t('Player {n}', { n: i + 1 })}
          onChange={(e) => setPlayer(i, e.target.value)}
        />
      ))}

      <label className="st-label">
        {t('Which one is you?')}
        <select className="st-input" value={me} onChange={(e) => setMe(Number(e.target.value))}>
          {players.slice(0, count).map((p, i) => (
            <option key={i} value={i}>{p.trim() || t('Player {n}', { n: i + 1 })}</option>
          ))}
          <option value={-1}>{t("I'm not playing")}</option>
        </select>
      </label>

      <label className="st-label">
        {t('Chips per point')}
        <input
          className="st-input st-num"
          type="number"
          min={0}
          value={chipRate}
          onChange={(e) => setChipRate(Math.max(0, Number(e.target.value)))}
        />
        <span className="st-small st-muted">
          {t('Chips move against the table average, so every game adds up to zero. They stay inside this session and never touch your chip balance. Use 0 to only track points.')}
        </span>
      </label>

      <button type="button" className="st-btn st-btn-ghost" onClick={() => setShowRules((v) => !v)}>
        {showRules ? t('Hide point values') : t('Edit point values')}
      </button>

      {showRules && (
        <div className="st-rules">
          <div className="st-rule-group">
            <div className="st-small st-muted">{t('Finish place')}</div>
            <div className="st-rule-row">
              {placePoints.map((v, i) => (
                <label key={i} className="st-num-label">
                  {placeName(t, i + 1)}
                  <input
                    className="st-input st-num"
                    type="number"
                    value={v}
                    onChange={(e) => {
                      const next = [...placePoints];
                      next[i] = Number(e.target.value);
                      setPlace(next);
                    }}
                  />
                </label>
              ))}
            </div>
          </div>
          <div className="st-rule-row">
            <PenaltyInput label={t('Chop black 2')} field="chopBlack" values={penalties} onChange={setPenalties} />
            <PenaltyInput label={t('Chop red 2')} field="chopRed" values={penalties} onChange={setPenalties} />
            <PenaltyInput label={t('Black 2 left')} field="stuckBlack" values={penalties} onChange={setPenalties} />
            <PenaltyInput label={t('Red 2 left')} field="stuckRed" values={penalties} onChange={setPenalties} />
            <PenaltyInput label={t('Cóng (minus)')} field="cong" values={penalties} onChange={setPenalties} />
            <PenaltyInput label={t('3♠ win bonus')} field="threeSpadeWin" values={penalties} onChange={setPenalties} />
            <PenaltyInput label={t('Instant win')} field="instantWin" values={penalties} onChange={setPenalties} />
          </div>
        </div>
      )}

      {error && <p className="st-error">{t(error)}</p>}

      <div className="st-actions">
        <button type="button" className="st-btn" onClick={onCancel}>{t('Cancel')}</button>
        <button type="submit" className="st-btn st-btn-primary" disabled={busy || filled.length < count}>
          {t('Start session')}
        </button>
      </div>
    </form>
  );
}

function PenaltyInput({ label, field, values, onChange }) {
  return (
    <label className="st-num-label">
      {label}
      <input
        className="st-input st-num"
        type="number"
        min={0}
        value={values[field]}
        onChange={(e) => onChange({ ...values, [field]: Math.max(0, Number(e.target.value)) })}
      />
    </label>
  );
}

function SessionView({ id, onBack }) {
  const { t } = useLang();
  const [serverSession, setServerSession] = useState(() => cached(`session:${id}`));
  const [pending, setPending] = useState(() => queuedGames(id));
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const setSession = useCallback((s) => setServerSession(remember(`session:${id}`, s)), [id]);

  const sync = useCallback(async () => {
    for (const game of queuedGames(id)) {
      try {
        setSession(await api(`/sessions/${id}/games`, { method: 'POST', body: game }));
      } catch (err) {
        if (err.offline) {
          setOffline(true);
          break;
        }
        setError({ sync: err.message });
      }
      setQueuedGames(id, queuedGames(id).filter((g) => g.clientId !== game.clientId));
    }
    setPending(queuedGames(id));
  }, [id, setSession]);

  useEffect(() => {
    setServerSession(cached(`session:${id}`));
    setPending(queuedGames(id));
    api(`/sessions/${id}`)
      .then((s) => {
        setSession(s);
        setOffline(false);
        sync();
      })
      .catch((e) => {
        if (e.offline && cached(`session:${id}`)) setOffline(true);
        else setError(e.message);
      });
  }, [id, setSession, sync]);

  useEffect(() => {
    const onOnline = () => {
      setOffline(false);
      sync();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [sync]);

  const session = useMemo(() => serverSession && {
    ...serverSession,
    games: [
      ...serverSession.games,
      ...pending.map((g) => ({ ...g, id: g.clientId, at: g.playedAt, rules: serverSession.rules, pending: true })),
    ],
  }, [serverSession, pending]);

  const standings = useMemo(() => (session ? sessionStats(session) : []), [session]);
  const links = useMemo(() => Object.fromEntries((session?.links || []).map((l) => [l.name, l])), [session]);

  const recordGame = async (draft) => {
    const game = { ...draft, clientId: newClientId(), playedAt: new Date().toISOString() };
    try {
      setSession(await api(`/sessions/${id}/games`, { method: 'POST', body: game }));
    } catch (err) {
      if (!err.offline) throw err;
      setQueuedGames(id, [...queuedGames(id), game]);
      setPending(queuedGames(id));
      setOffline(true);
    }
  };

  const deleteSession = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await api(`/sessions/${id}`, { method: 'DELETE' });
    onBack();
  };

  const removeGame = async (game) => {
    if (game.pending) {
      setQueuedGames(id, queuedGames(id).filter((g) => g.clientId !== game.clientId));
      setPending(queuedGames(id));
      return;
    }
    try {
      setSession(await api(`/sessions/${id}/games/${game.id}`, { method: 'DELETE' }));
    } catch (err) {
      setError(err.message);
    }
  };

  const errorText = error && (typeof error === 'string'
    ? t(error)
    : t("A game saved offline couldn't sync: {error}", { error: t(error.sync) }));

  if (error && !session) {
    return (
      <>
        <button className="st-btn st-btn-ghost" onClick={onBack}>{t('Back')}</button>
        <p className="st-error">{errorText}</p>
      </>
    );
  }
  if (!session) return <p className="st-muted">{t('Loading...')}</p>;

  const { rules } = session;
  const isLeader = session.role === 'leader';
  const showChips = session.chipRate > 0;

  return (
    <div className="st-wide st-stack">
      <button className="st-btn st-btn-ghost" onClick={onBack}>{t('All sessions')}</button>
      <header className="st-header">
        <h1 className="st-title st-title-sm">{session.name}</h1>
      </header>
      <p className="st-small st-muted">
        {isLeader
          ? t('You lead this session.')
          : t('Led by {name}. Only they can record games and change settings.', { name: session.leaderName })}
      </p>
      {offline && (
        <p className="st-card st-small st-offline">
          {t("You're offline. Games you record stay on this phone and sync when you're back online.")}
        </p>
      )}
      {pending.length > 0 && !offline && (
        <p className="st-small st-muted">
          {t(pending.length === 1 ? 'Syncing {n} saved game...' : 'Syncing {n} saved games...', { n: pending.length })}
        </p>
      )}
      {error && <p className="st-error">{errorText}</p>}

      <div className={`st-split ${isLeader ? 'st-split-two' : ''}`}>
        <div className="st-stack">
          <section className="st-card st-o-standings">
            <table className="st-table">
              <thead>
                <tr>
                  <th />
                  <th className="st-left">{t('Player')}</th>
                  <th>{t('Pts')}</th>
                  <th>{t('Wins')}</th>
                  <th>{t('Last')}</th>
                  <th>{t('Avg')}</th>
                  {showChips && <th>{t('Chips')}</th>}
                </tr>
              </thead>
              <tbody>
                {standings.map((p, i) => (
                  <tr key={p.name}>
                    <td className="st-muted">{i + 1}</td>
                    <td className="st-left">
                      <span className="st-strong">{p.name}</span>
                      <span className="st-small st-muted st-link-note">
                        {links[p.name]?.isMe
                          ? t('you')
                          : links[p.name]?.userId
                            ? <a className="st-link" href={`/u/${links[p.name].userId}`}>{links[p.name].userName}</a>
                            : t('guest')}
                      </span>
                    </td>
                    <td className={`st-strong ${p.total > 0 ? 'st-pos' : p.total < 0 ? 'st-neg' : ''}`}>
                      {formatDelta(p.total)}
                    </td>
                    <td>{p.wins}</td>
                    <td>{p.last}</td>
                    <td>{p.avgPlace === null ? '-' : p.avgPlace.toFixed(1)}</td>
                    {showChips && (
                      <td className={links[p.name]?.chips > 0 ? 'st-pos' : links[p.name]?.chips < 0 ? 'st-neg' : 'st-muted'}>
                        {links[p.name]?.chips === null || links[p.name]?.chips === undefined ? '-' : formatDelta(links[p.name].chips)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="st-small st-muted st-rules-line">
              {rulesText(t, rules)}
              {showChips ? ` · ${t('{n} chips per point', { n: session.chipRate })}` : ''}
            </p>
          </section>

          {session.games.length >= 2 && (
            <div className="st-stack st-o-charts">
              <PointsChart session={session} />
              <HeadToHead session={session} />
            </div>
          )}

          <div className="st-stack st-o-history">
            <h2 className="st-h2">{t('History ({n})', { n: session.games.length })}</h2>
            {session.games.length === 0 && <p className="st-lead">{t('No games recorded yet.')}</p>}
            <ul className="st-list">
              {session.games.map((g, i) => ({ g, n: i + 1 })).reverse().map(({ g, n }) => (
                <GameRow key={g.id} game={g} number={n} session={session} onRemove={isLeader ? () => removeGame(g) : null} />
              ))}
            </ul>
          </div>
        </div>

        {isLeader && (
          <aside className="st-stack st-side">
            <div className="st-o-record"><RecordGame session={session} onRecord={recordGame} /></div>
            <div className="st-o-invite">
              <InvitePanel session={serverSession} offline={offline} onChanged={setSession} />
            </div>
            {!offline && (
              <div className="st-stack st-o-settings">
                <SettingsPanel session={serverSession} onSaved={setSession} />
                <button className="st-btn st-btn-danger st-btn-block" onClick={deleteSession}>
                  {confirmDelete ? t('Tap again to delete this session') : t('Delete session')}
                </button>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

function RecordGame({ session, onRecord }) {
  const { t } = useLang();
  const { players, rules } = session;
  const legacy = isLegacyRules(rules);
  const [order, setOrder] = useState([]);
  const [instantWin, setInstantWin] = useState('');
  const [stuckTwos, setStuckTwos] = useState({});
  const [stuckLast, setStuckLast] = useState({ black: 0, red: 0 });
  const [threeSpadeWin, setThreeSpadeWin] = useState(false);
  const [cong, setCong] = useState([]);
  const [chops, setChops] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const fullOrder = order.length === players.length - 1
    ? [...order, players.find((p) => !order.includes(p))]
    : order;
  const winner = instantWin || fullOrder[0];
  const complete = Boolean(instantWin) || fullOrder.length === players.length;

  const draft = {
    order: instantWin ? [] : fullOrder,
    instantWin: instantWin || null,
    stuckTwos: instantWin ? {} : Object.fromEntries(Object.entries(stuckTwos).filter(([p, n]) => n > 0 && p !== winner)),
    threeSpadeWin: !instantWin && !legacy && threeSpadeWin,
    stuckLast: instantWin || legacy || stuckLast.black + stuckLast.red === 0 ? null : stuckLast,
    cong: instantWin ? [] : cong.filter((p) => p !== winner),
    chops: instantWin ? [] : chops.filter((c) => c.by && c.victim && c.by !== c.victim && (legacy || c.black + c.red > 0)),
  };
  const preview = complete ? gameDeltas(draft, players, rules) : null;

  const reset = () => {
    setOrder([]);
    setInstantWin('');
    setStuckTwos({});
    setStuckLast({ black: 0, red: 0 });
    setThreeSpadeWin(false);
    setCong([]);
    setChops([]);
    setError(null);
  };

  const tapPlayer = (p) => {
    const idx = fullOrder.indexOf(p);
    if (idx === -1) setOrder([...order, p]);
    else setOrder(fullOrder.slice(0, idx));
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onRecord(draft);
      reset();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const losers = players.filter((p) => p !== winner);
  const lastPlace = fullOrder[players.length - 1];

  return (
    <section className="st-card st-form">
      <h2 className="st-h2 st-h2-flush">{t('Record game {n}', { n: session.games.length + 1 })}</h2>

      <label className="st-label">
        {t('Instant win (tới trắng)')}
        <select className="st-input" value={instantWin} onChange={(e) => setInstantWin(e.target.value)}>
          <option value="">{t('None')}</option>
          {players.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>

      {!instantWin && (
        <>
          <div className="st-label">{t('Tap players in finish order')}</div>
          <div className="st-order">
            {players.map((p) => {
              const idx = fullOrder.indexOf(p);
              return (
                <button
                  key={p}
                  type="button"
                  className={`st-chip ${idx !== -1 ? 'st-chip-on' : ''}`}
                  onClick={() => tapPlayer(p)}
                >
                  {idx !== -1 && <span className="st-chip-place">{placeName(t, idx + 1)}</span>}
                  {p}
                </button>
              );
            })}
          </div>

          {complete && (
            <>
              {!legacy && (
                <label className="st-check st-check-left">
                  <input type="checkbox" checked={threeSpadeWin} onChange={(e) => setThreeSpadeWin(e.target.checked)} />
                  {t('{name} won with 3♠ as the last card', { name: winner })}
                </label>
              )}
              <div className="st-label">{t('Penalties')}</div>
              <div className="st-penalties">
                {losers.map((p) => (
                  <div key={p} className="st-penalty-row">
                    <span className="st-strong">{p}</span>
                    {legacy && (
                      <Stepper
                        label={t('2s left')}
                        value={stuckTwos[p] || 0}
                        max={4}
                        onChange={(v) => setStuckTwos({ ...stuckTwos, [p]: v })}
                      />
                    )}
                    {!legacy && p === lastPlace && (
                      <>
                        <Stepper label={t('Black 2s left')} value={stuckLast.black} max={2} onChange={(v) => setStuckLast({ ...stuckLast, black: v })} />
                        <Stepper label={t('Red 2s left')} value={stuckLast.red} max={2} onChange={(v) => setStuckLast({ ...stuckLast, red: v })} />
                      </>
                    )}
                    <label className="st-check">
                      <input
                        type="checkbox"
                        checked={cong.includes(p)}
                        onChange={(e) => setCong(e.target.checked ? [...cong, p] : cong.filter((c) => c !== p))}
                      />
                      {t('Cóng')}
                    </label>
                  </div>
                ))}
              </div>

              {chops.map((c, i) => {
                const update = (patch) => setChops(chops.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <div key={i} className="st-chop">
                    <div className="st-chop-row">
                      <select className="st-input" value={c.by} onChange={(e) => update({ by: e.target.value })}>
                        <option value="">{t('Chopper')}</option>
                        {players.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <span className="st-muted">{t('chopped')}</span>
                      <select className="st-input" value={c.victim} onChange={(e) => update({ victim: e.target.value })}>
                        <option value="">{t('Victim')}</option>
                        {players.filter((p) => p !== c.by).map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <button type="button" className="st-step" onClick={() => setChops(chops.filter((_, j) => j !== i))}>×</button>
                    </div>
                    {!legacy && (
                      <div className="st-chop-row">
                        <Stepper label={t('Black 2s')} value={c.black} max={2} onChange={(v) => update({ black: v })} />
                        <Stepper label={t('Red 2s')} value={c.red} max={2} onChange={(v) => update({ red: v })} />
                      </div>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                className="st-btn st-btn-ghost"
                onClick={() => setChops([...chops, legacy ? { by: '', victim: '', count: 1 } : { by: '', victim: '', black: 1, red: 0 }])}
              >
                {t('Add chop')}
              </button>
            </>
          )}
        </>
      )}

      {preview && (
        <div className="st-preview">
          {players.map((p) => (
            <span key={p} className={preview[p] > 0 ? 'st-pos' : preview[p] < 0 ? 'st-neg' : 'st-muted'}>
              {p} {formatDelta(preview[p])}
            </span>
          ))}
        </div>
      )}

      {error && <p className="st-error">{t(error)}</p>}

      <div className="st-actions">
        <button type="button" className="st-btn" onClick={reset}>{t('Clear')}</button>
        <button type="button" className="st-btn st-btn-primary" disabled={!complete || busy} onClick={save}>
          {t('Save game')}
        </button>
      </div>
    </section>
  );
}

function GameRow({ game, number, session, onRemove }) {
  const { t, locale } = useLang();
  const [confirm, setConfirm] = useState(false);
  const deltas = gameDeltas(game, session.players, game.rules || session.rules);

  const tags = [];
  if (game.instantWin) tags.push(t('Instant win: {name}', { name: game.instantWin }));
  for (const [name, n] of Object.entries(game.stuckTwos || {})) tags.push(t('{name} stuck with {n} × 2', { name, n }));
  if (game.threeSpadeWin) tags.push(t('{name} won with 3♠', { name: game.order[0] }));
  if (game.stuckLast) tags.push(stuckLastText(t, game));
  for (const name of game.cong || []) tags.push(t('{name} cóng', { name }));
  for (const c of game.chops || []) tags.push(chopText(t, c));

  return (
    <li className="st-card st-game">
      <div className="st-game-head">
        <span className="st-strong">{t('Game {n}', { n: number })}</span>
        <span className="st-small st-muted">
          {new Date(game.at).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}
        </span>
        {game.pending && <span className="st-badge st-badge-pending">{t('Not synced')}</span>}
        {onRemove && (
          <button
            className="st-btn st-btn-ghost st-btn-sm"
            onClick={() => (confirm ? onRemove() : setConfirm(true))}
            onBlur={() => setConfirm(false)}
          >
            {confirm ? t('Confirm undo') : t('Undo')}
          </button>
        )}
      </div>
      {!game.instantWin && (
        <div className="st-small">{game.order.map((p, i) => `${placeName(t, i + 1)} ${p}`).join(' · ')}</div>
      )}
      {tags.length > 0 && <div className="st-small st-muted">{tags.join(' · ')}</div>}
      <div className="st-preview">
        {session.players.map((p) => (
          <span key={p} className={deltas[p] > 0 ? 'st-pos' : deltas[p] < 0 ? 'st-neg' : 'st-muted'}>
            {p} {formatDelta(deltas[p])}
          </span>
        ))}
      </div>
    </li>
  );
}

function InvitePanel({ session, offline, onChanged }) {
  const { t, locale } = useLang();
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const link = `${window.location.origin}/scores/join/${session.inviteCode}`;
  const members = session.members || [];

  const act = async (key, request) => {
    if (confirm !== key) {
      setConfirm(key);
      return;
    }
    setConfirm(null);
    setBusy(true);
    setError(null);
    try {
      onChanged(await request());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = (member) => act(member.userId, () => api(`/sessions/${session.id}/members/${member.userId}`, { method: 'DELETE' }));
  const renew = () => act('renew', () => api(`/sessions/${session.id}/invite`, { method: 'POST', body: {} }));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <section className="st-card st-form">
      <div className="st-label">{t('Invite link')}</div>
      <div className="st-invite">
        <input className="st-input" readOnly value={link} onFocus={(e) => e.target.select()} />
        <button className="st-btn" onClick={copy}>{copied ? t('Copied') : t('Copy')}</button>
      </div>
      <p className="st-small st-muted">
        {t('People who open it sign in with Google, pick their player, and can then view this session.')}
      </p>
      {!offline && (
        <button className="st-btn st-btn-ghost" onClick={renew} onBlur={() => setConfirm(null)} disabled={busy}>
          {confirm === 'renew' ? t('Tap again. The old link stops working.') : t('Make a new link')}
        </button>
      )}

      <div className="st-label">{t('People with access')}</div>
      {members.length === 0 && <p className="st-small st-muted">{t('Nobody has joined with this link yet.')}</p>}
      <ul className="st-members">
        {members.map((m) => (
          <li key={m.userId}>
            <span className="st-member-text">
              <span className="st-strong">{m.name}</span>
              <span className="st-small st-muted">
                {m.player ? t('Plays as {name}', { name: m.player }) : t('Viewer')}
                {', '}
                {t('joined {date}', { date: formatDateTime(locale, m.joinedAt) })}
              </span>
            </span>
            {!offline && (
              <button className="st-btn st-btn-danger st-btn-sm" onClick={() => remove(m)} onBlur={() => setConfirm(null)} disabled={busy}>
                {confirm === m.userId ? t('Tap again to remove') : t('Remove')}
              </button>
            )}
          </li>
        ))}
      </ul>
      {members.length > 0 && (
        <p className="st-small st-muted">{t('Removed people lose access and their player link. Their past games stay.')}</p>
      )}
      {error && <p className="st-error">{t(error)}</p>}
    </section>
  );
}

function SettingsPanel({ session, onSaved }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(session.name);
  const [chipRate, setChipRate] = useState(session.chipRate);
  const [place, setPlace] = useState(session.rules.place);
  const [penalties, setPenalties] = useState(session.rules);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const legacy = isLegacyRules(session.rules);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await api(`/sessions/${session.id}`, {
        method: 'PATCH',
        body: { name, chipRate, rules: { ...penalties, place } },
      }));
      setOpen(false);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  if (!open) {
    return <button className="st-btn st-btn-ghost" onClick={() => setOpen(true)}>{t('Session settings')}</button>;
  }

  return (
    <section className="st-card st-form">
      <h2 className="st-h2 st-h2-flush">{t('Session settings')}</h2>
      <label className="st-label">
        {t('Session name')}
        <input className="st-input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="st-label">
        {t('Chips per point')}
        <input
          className="st-input st-num"
          type="number"
          min={0}
          value={chipRate}
          onChange={(e) => setChipRate(Math.max(0, Number(e.target.value)))}
        />
      </label>
      <div className="st-rule-group">
        <div className="st-small st-muted">{t('Finish place')}</div>
        <div className="st-rule-row">
          {place.map((v, i) => (
            <label key={i} className="st-num-label">
              {placeName(t, i + 1)}
              <input
                className="st-input st-num"
                type="number"
                value={v}
                onChange={(e) => setPlace(place.map((x, j) => (j === i ? Number(e.target.value) : x)))}
              />
            </label>
          ))}
        </div>
      </div>
      {!legacy && (
        <div className="st-rule-row">
          <PenaltyInput label={t('Chop black 2')} field="chopBlack" values={penalties} onChange={setPenalties} />
          <PenaltyInput label={t('Chop red 2')} field="chopRed" values={penalties} onChange={setPenalties} />
          <PenaltyInput label={t('Black 2 left')} field="stuckBlack" values={penalties} onChange={setPenalties} />
          <PenaltyInput label={t('Red 2 left')} field="stuckRed" values={penalties} onChange={setPenalties} />
          <PenaltyInput label={t('Cóng (minus)')} field="cong" values={penalties} onChange={setPenalties} />
          <PenaltyInput label={t('3♠ win bonus')} field="threeSpadeWin" values={penalties} onChange={setPenalties} />
          <PenaltyInput label={t('Instant win')} field="instantWin" values={penalties} onChange={setPenalties} />
        </div>
      )}
      <p className="st-small st-muted">{t('New values apply to games you record from now on. Past games keep the rules they were played with.')}</p>
      {error && <p className="st-error">{t(error)}</p>}
      <div className="st-actions">
        <button className="st-btn" onClick={() => setOpen(false)}>{t('Cancel')}</button>
        <button className="st-btn st-btn-primary" disabled={busy} onClick={save}>{t('Save settings')}</button>
      </div>
    </section>
  );
}

function Stepper({ label, value, max, onChange }) {
  return (
    <div className="st-stepper">
      <span className="st-small st-muted">{label}</span>
      <button type="button" className="st-step" onClick={() => onChange(Math.max(0, value - 1))}>-</button>
      <span className="st-step-val">{value}</span>
      <button type="button" className="st-step" onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}
