import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DEFAULT_PLACE_POINTS, DEFAULT_PENALTIES, gameDeltas, sessionStats, formatDelta, ordinal,
  isLegacyRules, describeChop, describeStuckLast, rulesSummary,
} from '../utils/scoring.js';
import { api, getMe, signIn, signOut } from '../utils/api.js';
import { cached, remember, queuedGames, setQueuedGames, newClientId } from '../utils/offline.js';
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
    history.pushState({}, '', id ? `/scores/${id}` : '/scores');
    setRoute(parseRoute());
  }, []);

  let body;
  if (me === undefined) body = <p className="st-muted">Loading...</p>;
  else if (!me.user) body = <SignInCard offline={me.offline} joining={route.view === 'join'} />;
  else if (me.needsConsent) body = <ConsentGate onAccepted={loadMe} />;
  else if (route.view === 'join') body = <JoinView code={route.code} onJoined={open} />;
  else if (route.view === 'session') body = <SessionView id={route.id} onBack={() => open(null)} />;
  else body = <SessionList onOpen={open} />;

  return (
    <div className="st">
      <div className="st-inner">
        <AccountBar me={me} />
        {body}
      </div>
    </div>
  );
}

function AccountBar({ me }) {
  return (
    <div className="st-account">
      <a className="st-link" href="/">Home</a>
      {me?.user && (
        <span className="st-account-user">
          <a className="st-account-link" href="/profile">
            {me.user.image && <img className="st-avatar" src={me.user.image} alt="" referrerPolicy="no-referrer" />}
            <span>{me.user.name}</span>
          </a>
          <span className="st-chips">{me.balance.toLocaleString()} chips</span>
          <button className="st-btn st-btn-ghost st-btn-sm" onClick={signOut}>Sign out</button>
        </span>
      )}
    </div>
  );
}

function SignInCard({ offline, joining }) {
  const [error, setError] = useState(null);
  const start = () => signIn().catch((e) => setError(e.message));
  if (offline) {
    return <p className="st-error">The server isn't reachable right now. Check your connection and reload the page.</p>;
  }
  return (
    <section className="st-card st-form">
      <h1 className="st-title st-title-inline">Score tracker</h1>
      <p>
        {joining
          ? 'Sign in with Google to join this session.'
          : 'Sign in with Google to start a session, invite your table and track chips.'}
      </p>
      {error && <p className="st-error">{error}</p>}
      <button className="st-btn st-btn-primary" onClick={start}>Sign in with Google</button>
    </section>
  );
}

function JoinView({ code, onJoined }) {
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

  if (error && !invite) return <p className="st-error">{error}</p>;
  if (!invite) return <p className="st-muted">Loading invite...</p>;

  if (invite.joined && invite.claimed) {
    return (
      <section className="st-card st-form">
        <p>You're already in <strong>{invite.name}</strong>.</p>
        <button className="st-btn st-btn-primary" onClick={() => onJoined(invite.id)}>Open session</button>
      </section>
    );
  }

  return (
    <section className="st-card st-form">
      <h1 className="st-title st-title-inline">{invite.name}</h1>
      <p className="st-muted">{invite.leaderName} invited you. Which player are you?</p>
      {invite.openPlayers.length > 0 ? (
        <div className="st-order">
          {invite.openPlayers.map((p) => (
            <button key={p} className="st-chip" disabled={busy} onClick={() => join(p)}>{p}</button>
          ))}
        </div>
      ) : (
        <p className="st-muted">Every seat is taken.</p>
      )}
      <p className="st-small st-muted">
        Picking a player links your account to it, so this session's games show up on your profile.
      </p>
      {error && <p className="st-error">{error}</p>}
      <button className="st-btn st-btn-ghost" disabled={busy} onClick={() => join(null)}>Just watch</button>
    </section>
  );
}

function SessionList({ onOpen }) {
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
    <>
      <header className="st-header">
        <h1 className="st-title">Score tracker</h1>
      </header>

      {creating
        ? <NewSessionForm onCancel={() => setCreating(false)} onCreated={(s) => onOpen(s.id)} />
        : <button className="st-btn st-btn-primary st-btn-block" onClick={() => setCreating(true)}>New session</button>}

      {error && <p className="st-error">{error}</p>}

      <h2 className="st-h2">Your sessions</h2>
      {sessions === null && !error && <p className="st-muted">Loading...</p>}
      {sessions?.length === 0 && (
        <p className="st-muted">No sessions yet. Start one, or open an invite link from a session leader.</p>
      )}
      <ul className="st-list">
        {sessions?.map((s) => (
          <li key={s.id}>
            <button className="st-card st-session-row" onClick={() => onOpen(s.id)}>
              <span className="st-session-name">
                {s.name}
                {s.role === 'leader' && <span className="st-badge">Leader</span>}
              </span>
              <span className="st-muted">{s.players.join(', ')}</span>
              <span className="st-muted st-small">
                {new Date(s.createdAt).toLocaleDateString()} · {s.gameCount} {s.gameCount === 1 ? 'game' : 'games'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function NewSessionForm({ onCancel, onCreated }) {
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
        Session name
        <input
          className="st-input"
          value={name}
          maxLength={40}
          placeholder="Friday night"
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <div className="st-label">Number of players</div>
      <div className="st-order">
        {[2, 3, 4].map((n) => (
          <button
            key={n}
            type="button"
            className={`st-chip ${count === n ? 'st-chip-on' : ''}`}
            onClick={() => setCount(n)}
          >
            {n} players
          </button>
        ))}
      </div>

      {players.slice(0, count).map((p, i) => (
        <input
          key={i}
          className="st-input"
          value={p}
          maxLength={20}
          placeholder={`Player ${i + 1}`}
          onChange={(e) => setPlayer(i, e.target.value)}
        />
      ))}

      <label className="st-label">
        Which one is you?
        <select className="st-input" value={me} onChange={(e) => setMe(Number(e.target.value))}>
          {players.slice(0, count).map((p, i) => (
            <option key={i} value={i}>{p.trim() || `Player ${i + 1}`}</option>
          ))}
          <option value={-1}>I'm not playing</option>
        </select>
      </label>

      <label className="st-label">
        Chips per point
        <input
          className="st-input st-num"
          type="number"
          min={0}
          value={chipRate}
          onChange={(e) => setChipRate(Math.max(0, Number(e.target.value)))}
        />
        <span className="st-small st-muted">
          Chips move against the table average, so every game adds up to zero. They stay inside this session and never touch your chip balance. Use 0 to only track points.
        </span>
      </label>

      <button type="button" className="st-btn st-btn-ghost" onClick={() => setShowRules((v) => !v)}>
        {showRules ? 'Hide point values' : 'Edit point values'}
      </button>

      {showRules && (
        <div className="st-rules">
          <div className="st-rule-group">
            <div className="st-small st-muted">Finish place</div>
            <div className="st-rule-row">
              {placePoints.map((v, i) => (
                <label key={i} className="st-num-label">
                  {ordinal(i + 1)}
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
            <PenaltyInput label="Chop black 2" field="chopBlack" values={penalties} onChange={setPenalties} />
            <PenaltyInput label="Chop red 2" field="chopRed" values={penalties} onChange={setPenalties} />
            <PenaltyInput label="Black 2 left" field="stuckBlack" values={penalties} onChange={setPenalties} />
            <PenaltyInput label="Red 2 left" field="stuckRed" values={penalties} onChange={setPenalties} />
            <PenaltyInput label="Cóng (minus)" field="cong" values={penalties} onChange={setPenalties} />
            <PenaltyInput label="3♠ win bonus" field="threeSpadeWin" values={penalties} onChange={setPenalties} />
            <PenaltyInput label="Instant win" field="instantWin" values={penalties} onChange={setPenalties} />
          </div>
        </div>
      )}

      {error && <p className="st-error">{error}</p>}

      <div className="st-actions">
        <button type="button" className="st-btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="st-btn st-btn-primary" disabled={busy || filled.length < count}>
          Start session
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
        setError(`A game saved offline couldn't sync: ${err.message}`);
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

  if (error && !session) {
    return (
      <>
        <button className="st-btn st-btn-ghost" onClick={onBack}>Back</button>
        <p className="st-error">{error}</p>
      </>
    );
  }
  if (!session) return <p className="st-muted">Loading...</p>;

  const { rules } = session;
  const isLeader = session.role === 'leader';
  const showChips = session.chipRate > 0;

  return (
    <>
      <header className="st-header">
        <button className="st-btn st-btn-ghost" onClick={onBack}>Back</button>
        <h1 className="st-title st-title-sm">{session.name}</h1>
      </header>
      <p className="st-small st-muted">
        {isLeader ? 'You lead this session.' : `Led by ${session.leaderName}. Only they can record games and change settings.`}
      </p>
      {offline && (
        <p className="st-card st-small st-offline">
          You're offline. Games you record stay on this phone and sync when you're back online.
        </p>
      )}
      {pending.length > 0 && !offline && <p className="st-small st-muted">Syncing {pending.length} saved games...</p>}
      {error && <p className="st-error">{error}</p>}

      <section className="st-card">
        <table className="st-table">
          <thead>
            <tr>
              <th />
              <th className="st-left">Player</th>
              <th>Pts</th>
              <th>Wins</th>
              <th>Last</th>
              <th>Avg</th>
              {showChips && <th>Chips</th>}
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
                      ? 'you'
                      : links[p.name]?.userId
                        ? <a className="st-link" href={`/u/${links[p.name].userId}`}>{links[p.name].userName}</a>
                        : 'guest'}
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
          {rulesSummary(rules)}
          {showChips ? ` · ${session.chipRate} chips per point` : ''}
        </p>
      </section>

      {session.games.length >= 2 && <PointsChart session={session} />}
      {session.games.length >= 2 && <HeadToHead session={session} />}

      {isLeader && <InvitePanel code={session.inviteCode} />}
      {isLeader && <RecordGame session={session} onRecord={recordGame} />}
      {isLeader && !offline && <SettingsPanel session={serverSession} onSaved={setSession} />}

      <h2 className="st-h2">History ({session.games.length})</h2>
      {session.games.length === 0 && <p className="st-muted">No games recorded yet.</p>}
      <ul className="st-list">
        {session.games.map((g, i) => ({ g, n: i + 1 })).reverse().map(({ g, n }) => (
          <GameRow key={g.id} game={g} number={n} session={session} onRemove={isLeader ? () => removeGame(g) : null} />
        ))}
      </ul>

      {isLeader && !offline && (
        <button className="st-btn st-btn-danger st-btn-block" onClick={deleteSession}>
          {confirmDelete ? 'Tap again to delete this session' : 'Delete session'}
        </button>
      )}
    </>
  );
}

function RecordGame({ session, onRecord }) {
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
      <h2 className="st-h2 st-h2-flush">Record game {session.games.length + 1}</h2>

      <label className="st-label">
        Instant win (tới trắng)
        <select className="st-input" value={instantWin} onChange={(e) => setInstantWin(e.target.value)}>
          <option value="">None</option>
          {players.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>

      {!instantWin && (
        <>
          <div className="st-label">Tap players in finish order</div>
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
                  {idx !== -1 && <span className="st-chip-place">{ordinal(idx + 1)}</span>}
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
                  {winner} won with 3♠ as the last card
                </label>
              )}
              <div className="st-label">Penalties</div>
              <div className="st-penalties">
                {losers.map((p) => (
                  <div key={p} className="st-penalty-row">
                    <span className="st-strong">{p}</span>
                    {legacy && (
                      <Stepper
                        label="2s left"
                        value={stuckTwos[p] || 0}
                        max={4}
                        onChange={(v) => setStuckTwos({ ...stuckTwos, [p]: v })}
                      />
                    )}
                    {!legacy && p === lastPlace && (
                      <>
                        <Stepper label="Black 2s left" value={stuckLast.black} max={2} onChange={(v) => setStuckLast({ ...stuckLast, black: v })} />
                        <Stepper label="Red 2s left" value={stuckLast.red} max={2} onChange={(v) => setStuckLast({ ...stuckLast, red: v })} />
                      </>
                    )}
                    <label className="st-check">
                      <input
                        type="checkbox"
                        checked={cong.includes(p)}
                        onChange={(e) => setCong(e.target.checked ? [...cong, p] : cong.filter((c) => c !== p))}
                      />
                      Cóng
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
                        <option value="">Chopper</option>
                        {players.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <span className="st-muted">chopped</span>
                      <select className="st-input" value={c.victim} onChange={(e) => update({ victim: e.target.value })}>
                        <option value="">Victim</option>
                        {players.filter((p) => p !== c.by).map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <button type="button" className="st-step" onClick={() => setChops(chops.filter((_, j) => j !== i))}>×</button>
                    </div>
                    {!legacy && (
                      <div className="st-chop-row">
                        <Stepper label="Black 2s" value={c.black} max={2} onChange={(v) => update({ black: v })} />
                        <Stepper label="Red 2s" value={c.red} max={2} onChange={(v) => update({ red: v })} />
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
                Add chop
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

      {error && <p className="st-error">{error}</p>}

      <div className="st-actions">
        <button type="button" className="st-btn" onClick={reset}>Clear</button>
        <button type="button" className="st-btn st-btn-primary" disabled={!complete || busy} onClick={save}>
          Save game
        </button>
      </div>
    </section>
  );
}

function GameRow({ game, number, session, onRemove }) {
  const [confirm, setConfirm] = useState(false);
  const deltas = gameDeltas(game, session.players, game.rules || session.rules);

  const tags = [];
  if (game.instantWin) tags.push(`Instant win: ${game.instantWin}`);
  for (const [p, n] of Object.entries(game.stuckTwos || {})) tags.push(`${p} stuck with ${n} × 2`);
  if (game.threeSpadeWin) tags.push(`${game.order[0]} won with 3♠`);
  if (game.stuckLast) tags.push(describeStuckLast(game));
  for (const p of game.cong || []) tags.push(`${p} cóng`);
  for (const c of game.chops || []) tags.push(describeChop(c));

  return (
    <li className="st-card st-game">
      <div className="st-game-head">
        <span className="st-strong">Game {number}</span>
        <span className="st-small st-muted">
          {new Date(game.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </span>
        {game.pending && <span className="st-badge st-badge-pending">Not synced</span>}
        {onRemove && (
          <button
            className="st-btn st-btn-ghost st-btn-sm"
            onClick={() => (confirm ? onRemove() : setConfirm(true))}
            onBlur={() => setConfirm(false)}
          >
            {confirm ? 'Confirm undo' : 'Undo'}
          </button>
        )}
      </div>
      {!game.instantWin && (
        <div className="st-small">{game.order.map((p, i) => `${ordinal(i + 1)} ${p}`).join(' · ')}</div>
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

function InvitePanel({ code }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/scores/join/${code}`;
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
      <div className="st-label">Invite link</div>
      <div className="st-invite">
        <input className="st-input" readOnly value={link} onFocus={(e) => e.target.select()} />
        <button className="st-btn" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <p className="st-small st-muted">
        People who open it sign in with Google, pick their player, and can then view this session.
      </p>
    </section>
  );
}

function SettingsPanel({ session, onSaved }) {
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
    return <button className="st-btn st-btn-ghost" onClick={() => setOpen(true)}>Session settings</button>;
  }

  return (
    <section className="st-card st-form">
      <h2 className="st-h2 st-h2-flush">Session settings</h2>
      <label className="st-label">
        Session name
        <input className="st-input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="st-label">
        Chips per point
        <input
          className="st-input st-num"
          type="number"
          min={0}
          value={chipRate}
          onChange={(e) => setChipRate(Math.max(0, Number(e.target.value)))}
        />
      </label>
      <div className="st-rule-group">
        <div className="st-small st-muted">Finish place</div>
        <div className="st-rule-row">
          {place.map((v, i) => (
            <label key={i} className="st-num-label">
              {ordinal(i + 1)}
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
          <PenaltyInput label="Chop black 2" field="chopBlack" values={penalties} onChange={setPenalties} />
          <PenaltyInput label="Chop red 2" field="chopRed" values={penalties} onChange={setPenalties} />
          <PenaltyInput label="Black 2 left" field="stuckBlack" values={penalties} onChange={setPenalties} />
          <PenaltyInput label="Red 2 left" field="stuckRed" values={penalties} onChange={setPenalties} />
          <PenaltyInput label="Cóng (minus)" field="cong" values={penalties} onChange={setPenalties} />
          <PenaltyInput label="3♠ win bonus" field="threeSpadeWin" values={penalties} onChange={setPenalties} />
          <PenaltyInput label="Instant win" field="instantWin" values={penalties} onChange={setPenalties} />
        </div>
      )}
      <p className="st-small st-muted">New values apply to games you record from now on. Past games keep the rules they were played with.</p>
      {error && <p className="st-error">{error}</p>}
      <div className="st-actions">
        <button className="st-btn" onClick={() => setOpen(false)}>Cancel</button>
        <button className="st-btn st-btn-primary" disabled={busy} onClick={save}>Save settings</button>
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
