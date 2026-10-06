import { useState, useEffect, useCallback } from 'react';
import { api, signIn } from '../utils/api.js';
import { useLang } from '../i18n/index.jsx';
import { formatDateTime } from '../i18n/describe.js';
import './scores.css';
import './admin.css';

const REFRESH_MS = 10000;

const REASONS = {
  signup: 'Welcome chips',
  daily: 'Daily top-ups',
  online: 'Online matches',
  admin: 'Admin adjustments',
};

const STATUS = {
  waiting: 'Waiting for players',
  playing: 'Hand in play',
  between: 'Between hands',
};

export default function Admin() {
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    api('/admin/overview')
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => {
      if (!document.hidden) load();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  let body;
  if (!data && error) {
    body = <p className="st-lead">{error === 'Not found' ? t('This page is only for admins.') : t(error)}</p>;
  } else if (!data) {
    body = <p className="st-muted">{t('Loading...')}</p>;
  } else {
    body = <Dashboard data={data} error={error} onRefresh={load} />;
  }

  return (
    <div className="st">
      <div className="st-inner">{body}</div>
    </div>
  );
}

function Dashboard({ data, error, onRefresh }) {
  const { t, locale } = useLang();
  const { live, users, chips, online, tracker } = data;
  const n = (v) => Number(v).toLocaleString(locale);
  const queued = live.queues.reduce((sum, q) => sum + q.players.length, 0);

  return (
    <div className="st-wide st-stack ad">
      <header className="st-header">
        <h1 className="st-title">{t('Admin')}</h1>
        <div className="ad-refresh">
          <span className="st-small st-muted">{t('Updated {time}', { time: formatDateTime(locale, data.at, true) })}</span>
          <button className="st-btn st-btn-ghost" onClick={onRefresh}>{t('Refresh')}</button>
        </div>
      </header>
      {error && <p className="st-error">{t(error)}</p>}

      <dl className="ad-tiles">
        <Tile label={t('Connected now')} value={n(live.connections)} note={t('{n} in the Quick Match queue', { n: queued })} />
        <Tile label={t('Live rooms')} value={n(live.rooms.length)} note={t('{n} playing a hand', { n: live.rooms.filter((r) => r.status === 'playing').length })} />
        <Tile label={t('Users')} value={n(users.total)} note={t('{n} new today', { n: users.today })} />
        <Tile label={t('Active this week')} value={n(users.activeWeek)} note={t('{n} today', { n: users.activeToday })} />
        <Tile label={t('Chips in circulation')} value={n(chips.circulation)} note={t('{n} top-ups today', { n: chips.topUpsToday })} />
        <Tile label={t('Online hands today')} value={n(online.today)} note={t('{n} this week', { n: online.week })} />
      </dl>

      <section className="st-stack">
        <h2 className="st-h2">{t('Live rooms')}</h2>
        {live.rooms.length === 0 && <p className="st-lead">{t('No rooms open right now.')}</p>}
        <ul className="ad-rooms">
          {live.rooms.map((room) => <RoomCard key={room.code} room={room} onClosed={onRefresh} />)}
        </ul>
        {live.queues.length > 0 && (
          <div className="st-card ad-queue">
            <h3 className="st-strong">{t('Quick Match queue')}</h3>
            <ul>
              {live.queues.map((q) => (
                <li key={`${q.stake}-${q.maxPlayers}`}>
                  <span className="st-badge">{t('{n} per point', { n: q.stake })}</span>
                  <span className="st-badge">{t('{n} players', { n: q.maxPlayers })}</span>
                  <span>{q.players.map((p) => p.nickname).join(', ')}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="ad-charts">
        <BarChart title={t('Signups, last 30 days')} rows={users.signups} />
        <BarChart title={t('Online hands, last 30 days')} rows={online.hands} />
      </div>

      <div className="ad-split">
        <section className="st-card ad-chips">
          <h2 className="st-strong">{t('Chip flow')}</h2>
          <table className="st-table">
            <thead>
              <tr>
                <th>{t('Source')}</th>
                <th className="ad-num">{t('Last 7 days')}</th>
                <th className="ad-num">{t('All time')}</th>
              </tr>
            </thead>
            <tbody>
              {chips.reasons.map((r) => (
                <tr key={r.reason}>
                  <td>{t(REASONS[r.reason] || r.reason)}</td>
                  <td className="ad-num">{n(r.week)}</td>
                  <td className="ad-num">{n(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 className="st-strong">{t('Top balances')}</h3>
          <ol className="ad-top">
            {chips.top.map((u) => (
              <li key={u.id}>
                <a className="st-link" href={`/u/${u.id}`}>{u.name}</a>
                <span className="ad-num">{n(u.balance)}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="st-card ad-tracker">
          <h2 className="st-strong">{t('Score tracker')}</h2>
          <dl className="ad-facts">
            <Fact label={t('Sessions')} value={n(tracker.sessions)} />
            <Fact label={t('Games recorded')} value={n(tracker.games)} />
            <Fact label={t('Games this week')} value={n(tracker.gamesWeek)} />
            <Fact label={t('Sessions played this week')} value={n(tracker.activeWeek)} />
          </dl>
          <p className="st-small st-muted">{t('Counts only. Session names and players stay private.')}</p>
        </section>
      </div>

      <UserSearch />

      <section className="st-stack">
        <h2 className="st-h2">{t('Recent admin actions')}</h2>
        {data.actions.length === 0 && <p className="st-lead">{t('No admin actions yet.')}</p>}
        {data.actions.length > 0 && (
          <div className="st-card ad-users">
            <table className="st-table">
              <tbody>
                {data.actions.map((a, i) => (
                  <tr key={i}>
                    <td className="ad-when">{formatDateTime(locale, a.at, true)}</td>
                    <td>
                      {a.action === 'chips'
                        ? t('{amount} chips for {name}, balance now {balance}', {
                          amount: a.details.amount > 0 ? `+${n(a.details.amount)}` : n(a.details.amount),
                          name: a.targetName || t('a deleted account'),
                          balance: n(a.details.balance),
                        })
                        : t('Closed room {code}', { code: a.target })}
                    </td>
                    <td className="ad-email">{a.by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Tile({ label, value, note }) {
  return (
    <div className="st-card ad-tile">
      <dt>{label}</dt>
      <dd>{value}</dd>
      <p className="st-small st-muted">{note}</p>
    </div>
  );
}

function Fact({ label, value }) {
  return (
    <div className="ad-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function RoomCard({ room, onClosed }) {
  const { t, locale } = useLang();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState(null);
  const minutes = Math.max(0, Math.round((Date.now() - room.createdAt) / 60000));
  const kind = room.ranked ? 'Quick Match' : room.isPublic ? 'Public room' : 'Private room';

  const close = () => {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    api(`/admin/rooms/${room.code}/close`, { method: 'POST', body: {} })
      .then(onClosed)
      .catch((e) => {
        setError(e.message);
        setConfirm(false);
      });
  };

  return (
    <li className="st-card ad-room">
      <div className="ad-room-head">
        <span className="ad-code">{room.code}</span>
        <span className="st-badge">{t(kind)}</span>
        <span className="st-badge">{t('{n} per point', { n: room.stake })}</span>
      </div>
      <p className="st-small st-muted">
        {t(STATUS[room.status])}. {t('Open for {n} min', { n: minutes })}
      </p>
      <ul className="ad-seats">
        {room.players.map((p, i) => (
          <li key={i}>
            <span className="ad-seat-name">
              {p.userId ? <a className="st-link" href={`/u/${p.userId}`}>{p.nickname}</a> : p.nickname}
              {p.isBot && <span className="ad-tag">{t('Bot')}</span>}
              {p.away && <span className="ad-tag ad-tag-away">{t('Away')}</span>}
            </span>
            <span className="st-small st-muted">
              {p.cards !== null && t('{n} cards', { n: p.cards })}
              {p.cards !== null && p.balance !== null && ', '}
              {p.balance !== null && t('{n} chips', { n: p.balance.toLocaleString(locale) })}
            </span>
          </li>
        ))}
      </ul>
      {error && <p className="st-error">{t(error)}</p>}
      <button className="st-btn st-btn-danger" onClick={close} onBlur={() => setConfirm(false)}>
        {confirm ? t('Tap again to close it') : t('Close room')}
      </button>
    </li>
  );
}

function BarChart({ title, rows }) {
  const { t, locale } = useLang();
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const width = 600;
  const height = 140;
  const step = width / rows.length;
  const bar = Math.max(2, step - 3);
  const day = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  const shown = hover === null ? null : rows[hover];

  return (
    <figure className="st-card ad-chart">
      <figcaption className="ad-chart-head">
        <span className="st-strong">{title}</span>
        <span className="st-small st-muted">
          {shown ? t('{date}: {n}', { date: day(shown.day), n: shown.count }) : t('{n} total', { n: total })}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height + 20}`} role="img" aria-label={`${title}: ${t('{n} total', { n: total })}`} onMouseLeave={() => setHover(null)}>
        <line x1="0" x2={width} y1={height} y2={height} className="ad-axis" />
        {rows.map((r, i) => {
          const h = r.count === 0 ? 0 : Math.max(3, (r.count / max) * (height - 8));
          return (
            <g key={r.day} onMouseEnter={() => setHover(i)}>
              <rect x={i * step} y="0" width={step} height={height} fill="transparent" />
              <rect
                x={i * step + (step - bar) / 2}
                y={height - h}
                width={bar}
                height={h}
                rx="2"
                className={`ad-bar ${hover === i ? 'ad-bar-on' : ''}`}
              />
            </g>
          );
        })}
        <text x="0" y={height + 16} className="ad-tick">{day(rows[0].day)}</text>
        <text x={width} y={height + 16} className="ad-tick" textAnchor="end">{day(rows[rows.length - 1].day)}</text>
        <text x="0" y="10" className="ad-tick">{max}</text>
      </svg>
    </figure>
  );
}

function UserSearch() {
  const { t } = useLang();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);

  const search = useCallback((q) => {
    api(`/admin/users?q=${encodeURIComponent(q)}`)
      .then((rows) => {
        setUsers(rows);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const id = setTimeout(() => search(query), 300);
    return () => clearTimeout(id);
  }, [query, search]);

  const updateBalance = (id, balance) => setUsers((list) => list.map((u) => (u.id === id ? { ...u, balance } : u)));

  return (
    <section className="st-stack">
      <div className="ad-users-head">
        <h2 className="st-h2">{t('Users')}</h2>
        <input
          className="st-input ad-search"
          type="search"
          value={query}
          placeholder={t('Search by name or email')}
          aria-label={t('Search by name or email')}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {error && <p className="st-error">{t(error)}</p>}
      {users?.length === 0 && <p className="st-lead">{t('No users match.')}</p>}
      {users?.length > 0 && (
        <div className="st-card ad-users">
          <table className="st-table">
            <thead>
              <tr>
                <th>{t('Name')}</th>
                <th>{t('Joined')}</th>
                <th>{t('Last seen')}</th>
                <th className="ad-num">{t('Hands')}</th>
                <th className="ad-num">{t('Chips')}</th>
                <th>{t('Adjust chips')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => <UserRow key={u.id} user={u} onBalance={(b) => updateBalance(u.id, b)} />)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function UserRow({ user, onBalance }) {
  const { t, locale } = useLang();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const apply = (e) => {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isInteger(value) || value === 0) {
      setMessage({ error: true, text: t('Enter a whole number, like 500 or -200.') });
      return;
    }
    setBusy(true);
    api('/admin/chips', { method: 'POST', body: { userId: user.id, amount: value } })
      .then(({ balance }) => {
        onBalance(balance);
        setAmount('');
        setMessage({ text: t('Done') });
      })
      .catch((err) => setMessage({ error: true, text: t(err.message), reauth: Boolean(err.data?.reauth) }))
      .finally(() => setBusy(false));
  };

  return (
    <tr>
      <td>
        <a className="st-link" href={`/u/${user.id}`}>{user.name}</a>
        <span className="ad-email">{user.email}</span>
      </td>
      <td className="ad-when">{formatDateTime(locale, user.joinedAt)}</td>
      <td className="ad-when">{user.lastSeen ? formatDateTime(locale, user.lastSeen, true) : t('Never')}</td>
      <td className="ad-num">{user.hands.toLocaleString(locale)}</td>
      <td className="ad-num">{user.balance.toLocaleString(locale)}</td>
      <td>
        <form className="ad-adjust" onSubmit={apply}>
          <input
            className="st-input"
            inputMode="numeric"
            value={amount}
            placeholder="+500"
            aria-label={t('Chips to add or remove for {name}', { name: user.name })}
            onChange={(e) => setAmount(e.target.value.trim())}
          />
          <button className="st-btn st-btn-primary" disabled={busy || !amount}>{t('Apply')}</button>
        </form>
        {message && <span className={`st-small ${message.error ? 'ad-msg-error' : 'ad-msg-ok'}`}>{message.text}</span>}
        {message?.reauth && (
          <button type="button" className="st-btn st-btn-ghost ad-reauth" onClick={() => signIn('/admin')}>{t('Sign in again')}</button>
        )}
      </td>
    </tr>
  );
}
