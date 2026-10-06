import express from 'express';
import { pool, transaction } from './db.js';
import { getUser, isAdmin } from './auth.js';
import { getBalance } from './chips.js';

const MAX_ADJUSTMENT = 100000;

function fromOurSite(req) {
  const origin = req.get('origin');
  const base = process.env.BETTER_AUTH_URL?.trim();
  return Boolean(req.is('application/json')) && (!origin || !base || origin === new URL(base).origin);
}

const handle = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server. Try again.' });
});

function perDay(rows) {
  return rows.map((r) => ({ day: r.day, count: r.count }));
}

async function overview() {
  const [users, active, signups, chips, reasons, top, online, hands, tracker] = await Promise.all([
    pool.query(
      `select count(*)::int as total,
              count(*) filter (where "createdAt" > now() - interval '1 day')::int as today,
              count(*) filter (where "createdAt" > now() - interval '7 days')::int as week
       from "user"`,
    ),
    pool.query(
      `select count(distinct "userId") filter (where "updatedAt" > now() - interval '1 day')::int as today,
              count(distinct "userId") filter (where "updatedAt" > now() - interval '7 days')::int as week
       from "session"`,
    ),
    pool.query(
      `select to_char(d, 'YYYY-MM-DD') as day, count(u.id)::int as count
       from generate_series(current_date - 29, current_date, interval '1 day') d
       left join "user" u on u."createdAt"::date = d::date
       group by d order by d`,
    ),
    pool.query(
      `select coalesce(sum(amount), 0)::bigint as circulation,
              count(*) filter (where reason = 'daily' and day = (now() at time zone 'utc')::date)::int as top_ups_today
       from chip_ledger`,
    ),
    pool.query(
      `select reason, coalesce(sum(amount), 0)::bigint as total, count(*)::int as entries,
              coalesce(sum(amount) filter (where created_at > now() - interval '7 days'), 0)::bigint as week
       from chip_ledger group by reason order by reason`,
    ),
    pool.query(
      `select u.id, coalesce(pr.display_name, u.name) as name, sum(l.amount)::int as balance
       from chip_ledger l
       join "user" u on u.id = l.user_id
       left join profiles pr on pr.user_id = u.id
       group by u.id, pr.display_name, u.name
       order by balance desc limit 10`,
    ),
    pool.query(
      `select count(*)::int as total,
              count(*) filter (where created_at > now() - interval '1 day')::int as today,
              count(*) filter (where created_at > now() - interval '7 days')::int as week
       from online_hands`,
    ),
    pool.query(
      `select to_char(d, 'YYYY-MM-DD') as day, count(h.id)::int as count
       from generate_series(current_date - 29, current_date, interval '1 day') d
       left join online_hands h on h.created_at::date = d::date
       group by d order by d`,
    ),
    pool.query(
      `select (select count(*) from tracker_sessions)::int as sessions,
              (select count(*) from games where undone_by is null)::int as games,
              (select count(*) from games where undone_by is null and created_at > now() - interval '7 days')::int as games_week,
              (select count(distinct session_id) from games where undone_by is null and created_at > now() - interval '7 days')::int as active_week`,
    ),
  ]);
  return {
    users: { ...users.rows[0], activeToday: active.rows[0].today, activeWeek: active.rows[0].week, signups: perDay(signups.rows) },
    chips: {
      circulation: Number(chips.rows[0].circulation),
      topUpsToday: chips.rows[0].top_ups_today,
      reasons: reasons.rows.map((r) => ({ reason: r.reason, total: Number(r.total), entries: r.entries, week: Number(r.week) })),
      top: top.rows,
    },
    online: { ...online.rows[0], hands: perDay(hands.rows) },
    tracker: {
      sessions: tracker.rows[0].sessions,
      games: tracker.rows[0].games,
      gamesWeek: tracker.rows[0].games_week,
      activeWeek: tracker.rows[0].active_week,
    },
  };
}

async function searchUsers(query) {
  const q = String(query || '').trim().slice(0, 60);
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const { rows } = await pool.query(
    `select u.id, coalesce(pr.display_name, u.name) as name, u.email, u."createdAt" as joined_at,
            (select max(s."updatedAt") from "session" s where s."userId" = u.id) as last_seen,
            (select coalesce(sum(l.amount), 0) from chip_ledger l where l.user_id = u.id)::int as balance,
            (select count(*) from online_hand_players h where h.user_id = u.id)::int as hands
     from "user" u
     left join profiles pr on pr.user_id = u.id
     where $1::text = '' or u.name ilike $2 or u.email ilike $2 or pr.display_name ilike $2
     order by u."createdAt" desc
     limit 50`,
    [q, like],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    joinedAt: r.joined_at,
    lastSeen: r.last_seen,
    balance: r.balance,
    hands: r.hands,
  }));
}

export function createAdminRouter({ live, closeRoom }) {
  const router = express.Router();

  router.use((req, res, next) => {
    getUser(req).then((user) => {
      if (!isAdmin(user)) return res.status(404).json({ error: 'Not found' });
      req.admin = user;
      next();
    }).catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Something went wrong on the server. Try again.' });
    });
  });
  router.use((req, res, next) => {
    if (req.method !== 'GET' && !fromOurSite(req)) return res.status(403).json({ error: 'Not allowed' });
    next();
  });
  router.use(express.json({ limit: '10kb' }));

  router.get('/overview', handle(async (req, res) => {
    res.json({ live: live(), ...(await overview()), at: new Date().toISOString() });
  }));

  router.get('/users', handle(async (req, res) => {
    res.json(await searchUsers(req.query.q));
  }));

  router.post('/chips', handle(async (req, res) => {
    const userId = typeof req.body?.userId === 'string' ? req.body.userId : '';
    const amount = req.body?.amount;
    if (!userId || !Number.isInteger(amount) || amount === 0 || Math.abs(amount) > MAX_ADJUSTMENT) {
      return res.status(400).json({ error: `Enter a whole number of chips between -${MAX_ADJUSTMENT} and ${MAX_ADJUSTMENT}.` });
    }
    const result = await transaction(async (db) => {
      const found = await db.query('select id from "user" where id = $1 for update', [userId]);
      if (!found.rowCount) return { status: 404, error: 'That user does not exist.' };
      const balance = await getBalance(userId, db);
      if (balance + amount < 0) return { status: 400, error: 'That would put the balance below zero.' };
      await db.query(`insert into chip_ledger (user_id, amount, reason) values ($1, $2, 'admin')`, [userId, amount]);
      return { balance: balance + amount };
    });
    if (result.error) return res.status(result.status).json({ error: result.error });
    console.log(`Admin ${req.admin.email} adjusted chips for ${userId} by ${amount}`);
    res.json(result);
  }));

  router.post('/rooms/:code/close', handle(async (req, res) => {
    const code = String(req.params.code).toUpperCase();
    if (!closeRoom(code)) return res.status(404).json({ error: 'That room is already closed.' });
    console.log(`Admin ${req.admin.email} closed room ${code}`);
    res.json({ ok: true });
  }));

  router.use((req, res) => res.status(404).json({ error: 'Not found' }));

  return router;
}
