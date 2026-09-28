import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DEFAULT_PLACE_POINTS, DEFAULT_PENALTIES, gameDeltas, sessionStats, formatDelta, ordinal,
  isLegacyRules, describeChop, describeStuckLast, rulesSummary,
} from '../utils/scoring.js';
import './scores.css';

const API = `${import.meta.env.VITE_SERVER_URL || ''}/api`;

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function getSessionIdFromURL() {
  const match = window.location.pathname.match(/^\/scores\/([a-f0-9]+)$/);
  return match ? match[1] : null;
}

export default function ScoreTracker() {
  const [sessionId, setSessionId] = useState(getSessionIdFromURL);

  useEffect(() => {
    const onPop = () => setSessionId(getSessionIdFromURL());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const open = useCallback((id) => {
    history.pushState({}, '', id ? `/scores/${id}` : '/scores');
    setSessionId(id);
  }, []);

  return (
    <div className="st">
      <div className="st-inner">
        {sessionId
          ? <SessionView id={sessionId} onBack={() => open(null)} />
          : <SessionList onOpen={open} />}
      </div>
    </div>
  );
}

function SessionList({ onOpen }) {
  const [sessions, setSessions] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/sessions').then(setSessions).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <header className="st-header">
        <h1 className="st-title">Score tracker</h1>
        <a className="st-link" href="/">Home</a>
      </header>

      {creating
        ? <NewSessionForm onCancel={() => setCreating(false)} onCreated={(s) => onOpen(s.id)} />
        : <button className="st-btn st-btn-primary st-btn-block" onClick={() => setCreating(true)}>New session</button>}

      {error && <p className="st-error">{error}</p>}

      <h2 className="st-h2">Sessions</h2>
      {sessions === null && !error && <p className="st-muted">Loading...</p>}
      {sessions?.length === 0 && <p className="st-muted">No sessions yet.</p>}
      <ul className="st-list">
        {sessions?.map((s) => (
          <li key={s.id}>
            <button className="st-card st-session-row" onClick={() => onOpen(s.id)}>
              <span className="st-session-name">{s.name}</span>
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
        body: { name, players: filled, rules: { place: placePoints, ...penalties } },
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
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setSession(null);
    api(`/sessions/${id}`).then(setSession).catch((e) => setError(e.message));
  }, [id]);

  const standings = useMemo(() => (session ? sessionStats(session) : []), [session]);

  const deleteSession = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await api(`/sessions/${id}`, { method: 'DELETE' });
    onBack();
  };

  const removeGame = async (gameId) => {
    setSession(await api(`/sessions/${id}/games/${gameId}`, { method: 'DELETE' }));
  };

  if (error) {
    return (
      <>
        <button className="st-btn st-btn-ghost" onClick={onBack}>Back</button>
        <p className="st-error">{error}</p>
      </>
    );
  }
  if (!session) return <p className="st-muted">Loading...</p>;

  const { rules } = session;

  return (
    <>
      <header className="st-header">
        <button className="st-btn st-btn-ghost" onClick={onBack}>Back</button>
        <h1 className="st-title st-title-sm">{session.name}</h1>
      </header>

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
            </tr>
          </thead>
          <tbody>
            {standings.map((p, i) => (
              <tr key={p.name}>
                <td className="st-muted">{i + 1}</td>
                <td className="st-left st-strong">{p.name}</td>
                <td className={`st-strong ${p.total > 0 ? 'st-pos' : p.total < 0 ? 'st-neg' : ''}`}>
                  {formatDelta(p.total)}
                </td>
                <td>{p.wins}</td>
                <td>{p.last}</td>
                <td>{p.avgPlace === null ? '-' : p.avgPlace.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="st-small st-muted st-rules-line">
          {rulesSummary(rules)}
        </p>
      </section>

      <RecordGame session={session} onSaved={setSession} />

      <h2 className="st-h2">History ({session.games.length})</h2>
      {session.games.length === 0 && <p className="st-muted">No games recorded yet.</p>}
      <ul className="st-list">
        {session.games.map((g, i) => ({ g, n: i + 1 })).reverse().map(({ g, n }) => (
          <GameRow key={g.id} game={g} number={n} session={session} onRemove={() => removeGame(g.id)} />
        ))}
      </ul>

      <button className="st-btn st-btn-danger st-btn-block" onClick={deleteSession}>
        {confirmDelete ? 'Tap again to delete this session' : 'Delete session'}
      </button>
    </>
  );
}

function RecordGame({ session, onSaved }) {
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
      onSaved(await api(`/sessions/${session.id}/games`, { method: 'POST', body: draft }));
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
  const deltas = gameDeltas(game, session.players, session.rules);

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
        <button
          className="st-btn st-btn-ghost st-btn-sm"
          onClick={() => (confirm ? onRemove() : setConfirm(true))}
          onBlur={() => setConfirm(false)}
        >
          {confirm ? 'Confirm undo' : 'Undo'}
        </button>
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
