import express from 'express';
import { pool, transaction } from './db.js';
import { getUser } from './auth.js';
import { getBalance, applyDailyTopUp, gameChips } from './chips.js';
import {
  gameDeltas, describeChop, describeStuckLast, ordinal,
} from '../client/src/utils/scoring.js';

export async function hasAcceptedTerms(userId) {
  const { rows } = await pool.query('select terms_accepted_at from profiles where user_id = $1', [userId]);
  return Boolean(rows[0]?.terms_accepted_at);
}

export async function loadProfile(userId) {
  const { rows } = await pool.query(
    `select u.id, u.name as google_name, u.email, u.image as google_image, u."createdAt" as created_at,
            pr.display_name, coalesce(pr.hide_avatar, false) as hide_avatar,
            coalesce(pr.hide_from_leaderboard, false) as hide_from_leaderboard,
            coalesce(pr.private_profile, false) as private_profile, pr.terms_accepted_at
     from "user" u left join profiles pr on pr.user_id = u.id where u.id = $1`,
    [userId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    name: r.display_name || r.google_name,
    googleName: r.google_name,
    email: r.email,
    image: r.hide_avatar ? null : r.google_image,
    googleImage: r.google_image,
    createdAt: r.created_at,
    displayName: r.display_name,
    hideAvatar: r.hide_avatar,
    hideFromLeaderboard: r.hide_from_leaderboard,
    privateProfile: r.private_profile,
    termsAcceptedAt: r.terms_accepted_at,
  };
}

function describeEvents(data) {
  const events = [];
  if (data.instantWin) events.push(`${data.instantWin} won instantly`);
  if (data.threeSpadeWin) events.push(`${data.order[0]} won with the 3♠ as the last card`);
  if (data.stuckLast) events.push(describeStuckLast(data));
  for (const [p, n] of Object.entries(data.stuckTwos || {})) events.push(`${p} was stuck with ${n} × 2`);
  for (const p of data.cong || []) events.push(`${p} never played a card (cóng)`);
  for (const c of data.chops || []) events.push(describeChop(c));
  return events;
}

function gameView(g, seats, userId, nameOf) {
  const names = seats.map((p) => p.name);
  const deltas = gameDeltas(g.data, names, g.rules);
  const chips = gameChips(deltas, g.chip_rate);
  return {
    id: g.id,
    at: g.created_at,
    recordedBy: nameOf[g.recorded_by] || 'a deleted account',
    undoneAt: g.undone_at,
    undoneBy: g.undone_at ? nameOf[g.undone_by] || 'a deleted account' : null,
    players: seats.map((p) => {
      const place = g.data.instantWin
        ? (p.name === g.data.instantWin ? 1 : null)
        : g.data.order.indexOf(p.name) + 1 || null;
      return {
        name: p.name,
        userId: p.user_id,
        isMe: p.user_id === userId,
        place,
        placeLabel: place ? ordinal(place) : null,
        points: deltas[p.name] || 0,
        chips: g.chip_rate ? chips[p.name] : null,
      };
    }),
    events: describeEvents(g.data),
  };
}

function summarize(games) {
  const stats = { games: 0, wins: 0, points: 0, chips: 0 };
  for (const g of games) {
    const me = g.players.find((p) => p.isMe);
    if (g.undoneAt || !me) continue;
    stats.games += 1;
    if (me.place === 1) stats.wins += 1;
    stats.points += me.points;
    stats.chips += me.chips || 0;
  }
  return stats;
}

async function sessionHistory(userId) {
  const { rows: sessions } = await pool.query(
    `select s.id, s.name, s.created_at, s.chip_rate,
            (s.leader_id = $1 or exists (select 1 from session_members m where m.session_id = s.id and m.user_id = $1)) as can_open
     from tracker_sessions s
     where exists (select 1 from session_players p where p.session_id = s.id and p.user_id = $1)`,
    [userId],
  );
  if (!sessions.length) return [];

  const ids = sessions.map((s) => s.id);
  const [players, games] = await Promise.all([
    pool.query(
      'select session_id, name, user_id from session_players where session_id = any($1) order by position',
      [ids],
    ),
    pool.query(
      `select id, session_id, data, rules, chip_rate, created_at, undone_at, recorded_by, undone_by
       from games where session_id = any($1) order by created_at desc`,
      [ids],
    ),
  ]);
  const peopleIds = [...new Set(games.rows.flatMap((g) => [g.recorded_by, g.undone_by]).filter(Boolean))];
  const people = await pool.query(
    `select u.id, coalesce(pr.display_name, u.name) as name from "user" u left join profiles pr on pr.user_id = u.id
     where u.id = any($1)`,
    [peopleIds],
  );

  const nameOf = Object.fromEntries(people.rows.map((p) => [p.id, p.name]));
  const seatsBySession = {};
  for (const p of players.rows) (seatsBySession[p.session_id] ||= []).push(p);
  const gamesBySession = {};
  for (const g of games.rows) (gamesBySession[g.session_id] ||= []).push(g);

  return sessions
    .map((s) => {
      const seats = seatsBySession[s.id] || [];
      const list = (gamesBySession[s.id] || []).map((g) => gameView(g, seats, userId, nameOf));
      return {
        id: s.id,
        name: s.name,
        createdAt: s.created_at,
        canOpen: s.can_open,
        chipRate: s.chip_rate,
        lastPlayedAt: list[0]?.at || null,
        players: seats.map((p) => p.name),
        stats: summarize(list),
        games: list,
      };
    })
    .sort((a, b) => new Date(b.lastPlayedAt || b.createdAt) - new Date(a.lastPlayedAt || a.createdAt));
}

const router = express.Router();
router.use(express.json());

const handle = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server. Try again.' });
});

router.get('/me', handle(async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.json({ user: null });
  const profile = await loadProfile(user.id);
  const needsConsent = !profile.termsAcceptedAt;
  if (!needsConsent) await applyDailyTopUp(user.id);
  res.json({
    user: { id: profile.id, name: profile.name, email: profile.email, image: profile.image },
    profile,
    needsConsent,
    balance: await getBalance(user.id),
  });
}));

router.post('/me/accept', handle(async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in with Google to continue.' });
  if (req.body?.over13 !== true || req.body?.agree !== true) {
    return res.status(400).json({ error: 'Confirm you are 13 or older and agree to the terms to continue.' });
  }
  await pool.query(
    `insert into profiles (user_id, terms_accepted_at) values ($1, now())
     on conflict (user_id) do update set terms_accepted_at = now()`,
    [user.id],
  );
  res.json({ ok: true });
}));

router.patch('/me/settings', handle(async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in with Google to continue.' });
  const current = await loadProfile(user.id);
  const b = req.body || {};
  let displayName = current.displayName;
  if (b.displayName !== undefined) {
    const trimmed = String(b.displayName).replace(/\s+/g, ' ').trim();
    if (trimmed.length > 30) return res.status(400).json({ error: 'Display name can be at most 30 characters.' });
    displayName = trimmed || null;
  }
  const flag = (key, fallback) => (typeof b[key] === 'boolean' ? b[key] : fallback);
  await pool.query(
    `insert into profiles (user_id, display_name, hide_avatar, hide_from_leaderboard, private_profile)
     values ($1, $2, $3, $4, $5)
     on conflict (user_id) do update set display_name = $2, hide_avatar = $3, hide_from_leaderboard = $4, private_profile = $5`,
    [
      user.id,
      displayName,
      flag('hideAvatar', current.hideAvatar),
      flag('hideFromLeaderboard', current.hideFromLeaderboard),
      flag('privateProfile', current.privateProfile),
    ],
  );
  res.json({ profile: await loadProfile(user.id) });
}));

router.get('/me/export', handle(async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in with Google to continue.' });
  const profile = await loadProfile(user.id);
  const [sessions, ledger, logins, history] = await Promise.all([
    pool.query(
      `select s.id, s.name, s.created_at, (s.leader_id = $1) as is_leader,
              (select name from session_players p where p.session_id = s.id and p.user_id = $1) as your_player
       from tracker_sessions s
       where s.leader_id = $1 or exists (select 1 from session_members m where m.session_id = s.id and m.user_id = $1)
       order by s.created_at`,
      [user.id],
    ),
    pool.query(
      `select amount, reason, session_id, game_id, created_at from chip_ledger where user_id = $1 order by created_at`,
      [user.id],
    ),
    pool.query(
      `select "createdAt" as created_at, "expiresAt" as expires_at, "ipAddress" as ip_address, "userAgent" as user_agent
       from "session" where "userId" = $1 order by "createdAt"`,
      [user.id],
    ),
    sessionHistory(user.id),
  ]);
  const data = {
    exportedAt: new Date().toISOString(),
    account: {
      id: profile.id,
      googleName: profile.googleName,
      email: profile.email,
      googleImage: profile.googleImage,
      createdAt: profile.createdAt,
      termsAcceptedAt: profile.termsAcceptedAt,
    },
    settings: {
      displayName: profile.displayName,
      hideAvatar: profile.hideAvatar,
      hideFromLeaderboard: profile.hideFromLeaderboard,
      privateProfile: profile.privateProfile,
    },
    chipBalance: await getBalance(user.id),
    sessions: sessions.rows,
    games: history.flatMap((s) => s.games.map((g) => ({ sessionId: s.id, sessionName: s.name, ...g }))),
    chipHistory: ledger.rows,
    loginSessions: logins.rows,
  };
  res.setHeader('Content-Disposition', 'attachment; filename="tien-len-my-data.json"');
  res.json(data);
}));

router.delete('/me', handle(async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in with Google to continue.' });
  if (req.body?.confirm !== 'DELETE') {
    return res.status(400).json({ error: 'Type DELETE to confirm.' });
  }
  await transaction(async (db) => {
    const { rows: led } = await db.query('select id from tracker_sessions where leader_id = $1', [user.id]);
    for (const { id } of led) {
      const { rows: heirs } = await db.query(
        `select user_id from (
           select user_id, 0 as rank, position as ord from session_players where session_id = $1 and user_id is not null and user_id <> $2
           union all
           select user_id, 1 as rank, 0 as ord from session_members where session_id = $1 and user_id <> $2
         ) c order by rank, ord limit 1`,
        [id, user.id],
      );
      if (heirs[0]) {
        await db.query('update tracker_sessions set leader_id = $2 where id = $1', [id, heirs[0].user_id]);
      } else {
        await db.query('delete from tracker_sessions where id = $1', [id]);
      }
    }
    await db.query('update session_players set user_id = null where user_id = $1', [user.id]);
    await db.query('delete from session_members where user_id = $1', [user.id]);
    await db.query('delete from chip_ledger where user_id = $1', [user.id]);
    await db.query('update games set recorded_by = null where recorded_by = $1', [user.id]);
    await db.query('update games set undone_by = null where undone_by = $1', [user.id]);
    await db.query('delete from profiles where user_id = $1', [user.id]);
    await db.query('delete from "session" where "userId" = $1', [user.id]);
    await db.query('delete from "account" where "userId" = $1', [user.id]);
    await db.query('delete from "user" where id = $1', [user.id]);
  });
  res.clearCookie('better-auth.session_token');
  res.status(204).end();
}));

router.get('/users/:id', handle(async (req, res) => {
  const viewer = await getUser(req);
  const profile = await loadProfile(req.params.id);
  if (!profile) return res.status(404).json({ error: 'This profile does not exist.' });
  const isMe = viewer?.id === profile.id;
  if (profile.privateProfile && !isMe) return res.status(403).json({ error: 'This profile is private.' });
  const base = {
    id: profile.id,
    name: profile.name,
    image: profile.image,
    joinedAt: profile.createdAt,
    isMe,
    balance: isMe || !profile.hideFromLeaderboard ? await getBalance(profile.id) : null,
  };
  if (!isMe) return res.json(base);
  const [sessions, chipHistory] = await Promise.all([
    sessionHistory(profile.id),
    pool.query(
      `select amount, reason, created_at from chip_ledger
       where user_id = $1 order by created_at desc limit 300`,
      [profile.id],
    ),
  ]);
  res.json({ ...base, sessions, chipHistory: chipHistory.rows });
}));

router.get('/leaderboard', handle(async (req, res) => {
  const { rows } = await pool.query(
    `select u.id, coalesce(pr.display_name, u.name) as name,
            case when pr.hide_avatar then null else u.image end as image,
            coalesce(pr.private_profile, false) as private_profile,
            coalesce(sum(l.amount), 0)::int as balance
     from "user" u
     left join profiles pr on pr.user_id = u.id
     left join chip_ledger l on l.user_id = u.id
     where pr.terms_accepted_at is not null and not pr.hide_from_leaderboard
     group by u.id, pr.display_name, pr.hide_avatar, pr.private_profile
     order by balance desc, name
     limit 10`,
  );
  res.json(rows.map((r) => ({
    id: r.private_profile ? null : r.id,
    name: r.name,
    image: r.image,
    balance: r.balance,
  })));
}));

export default router;
