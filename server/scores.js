import express from 'express';
import crypto from 'crypto';
import { pool, transaction } from './db.js';
import { getUser } from './auth.js';
import { hasAcceptedTerms } from './profile.js';
import { gameChips } from './chips.js';
import { DEFAULT_PLACE_POINTS, DEFAULT_PENALTIES, gameDeltas } from '../client/src/utils/scoring.js';

const DEFAULT_CHIP_RATE = 10;

function newId(bytes = 6) {
  return crypto.randomBytes(bytes).toString('hex');
}

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) ? n : fallback;
}

function cleanRules(input, playerCount, previous) {
  const base = previous || { place: DEFAULT_PLACE_POINTS[playerCount], ...DEFAULT_PENALTIES };
  const place = Array.isArray(input?.place) && input.place.length === playerCount
    ? input.place.map((v, i) => toInt(v, base.place[i]))
    : base.place;
  const rules = { place };
  for (const key of Object.keys(DEFAULT_PENALTIES)) {
    rules[key] = Math.max(0, toInt(input?.[key], base[key] ?? DEFAULT_PENALTIES[key]));
  }
  return rules;
}

function cleanChipRate(value, fallback) {
  return Math.min(1000, Math.max(0, toInt(value, fallback)));
}

function validateGame(players, rules, body) {
  const has = (name) => players.includes(name);
  const legacy = rules.stuckTwo !== undefined;

  const instantWin = body.instantWin || null;
  if (instantWin && !has(instantWin)) return { error: 'Unknown instant winner' };

  let order = [];
  if (!instantWin) {
    order = Array.isArray(body.order) ? body.order : [];
    if (order.length !== players.length || new Set(order).size !== players.length || !order.every(has)) {
      return { error: 'Finish order must list every player once' };
    }
  }
  const winner = instantWin || order[0];

  const stuckTwos = {};
  let stuckLast = null;
  const threeSpadeWin = !instantWin && !legacy && Boolean(body.threeSpadeWin);
  const cong = [];
  const chops = [];
  if (!instantWin) {
    if (legacy) {
      for (const [name, count] of Object.entries(body.stuckTwos || {})) {
        const n = toInt(count, 0);
        if (!has(name) || name === winner || n < 0 || n > 4) return { error: 'Invalid stuck 2s' };
        if (n > 0) stuckTwos[name] = n;
      }
    }
    if (!legacy && body.stuckLast) {
      const black = toInt(body.stuckLast.black, 0);
      const red = toInt(body.stuckLast.red, 0);
      if (black < 0 || red < 0 || black > 2 || red > 2) return { error: 'Invalid 2s left' };
      if (black + red > 0) stuckLast = { black, red };
    }
    for (const name of body.cong || []) {
      if (!has(name) || name === winner) return { error: 'Invalid cóng player' };
      if (!cong.includes(name)) cong.push(name);
    }
    for (const chop of body.chops || []) {
      if (!has(chop?.by) || !has(chop?.victim) || chop.by === chop.victim) return { error: 'Invalid chop' };
      if (legacy) {
        const count = toInt(chop.count, 1);
        if (count < 1) return { error: 'Invalid chop' };
        chops.push({ by: chop.by, victim: chop.victim, count });
      } else {
        const black = toInt(chop.black, 0);
        const red = toInt(chop.red, 0);
        if (black < 0 || red < 0 || black > 2 || red > 2 || black + red < 1) {
          return { error: 'A chop needs 1 or 2 black 2s and/or 1 or 2 red 2s' };
        }
        chops.push({ by: chop.by, victim: chop.victim, black, red });
      }
    }
  }

  return { game: { order, instantWin, stuckTwos, stuckLast, threeSpadeWin, cong, chops } };
}

async function loadAccess(sessionId, userId) {
  const { rows } = await pool.query(
    `select s.*, (s.leader_id = $2) as is_leader,
            exists (select 1 from session_members m where m.session_id = s.id and m.user_id = $2) as is_member
     from tracker_sessions s where s.id = $1`,
    [sessionId, userId],
  );
  const s = rows[0];
  if (!s || (!s.is_leader && !s.is_member)) return null;
  return s;
}

async function loadPlayers(sessionId, db = pool) {
  const { rows } = await db.query(
    `select p.name, p.user_id, coalesce(pr.display_name, u.name) as user_name,
            case when pr.hide_avatar then null else u.image end as image
     from session_players p
     left join "user" u on u.id = p.user_id
     left join profiles pr on pr.user_id = p.user_id
     where p.session_id = $1 order by p.position`,
    [sessionId],
  );
  return rows;
}

async function sessionView(s, userId) {
  const players = await loadPlayers(s.id);
  const [games, leader] = await Promise.all([
    pool.query(
      `select id, data, rules, chip_rate, created_at from games where session_id = $1 and undone_at is null order by created_at`,
      [s.id],
    ),
    pool.query(
      `select coalesce(pr.display_name, u.name) as name from "user" u left join profiles pr on pr.user_id = u.id where u.id = $1`,
      [s.leader_id],
    ),
  ]);
  const names = players.map((p) => p.name);
  const chips = Object.fromEntries(names.map((n) => [n, 0]));
  for (const g of games.rows) {
    const moved = gameChips(gameDeltas(g.data, names, g.rules), g.chip_rate);
    for (const n of names) chips[n] += moved[n];
  }
  const me = players.find((p) => p.user_id === userId);
  return {
    id: s.id,
    name: s.name,
    createdAt: s.created_at,
    role: s.is_leader ? 'leader' : me ? 'player' : 'viewer',
    leaderName: leader.rows[0]?.name || null,
    inviteCode: s.is_leader ? s.invite_code : undefined,
    rules: s.rules,
    chipRate: s.chip_rate,
    players: names,
    links: players.map((p) => ({
      name: p.name,
      userId: p.user_id,
      userName: p.user_name,
      image: p.image,
      isMe: p.user_id === userId,
      chips: chips[p.name],
    })),
    games: games.rows.map((g) => ({ id: g.id, at: g.created_at, ...g.data, rules: g.rules })),
  };
}

const router = express.Router();
router.use(express.json());

const handle = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server. Try again.' });
});

const requireUser = (fn) => handle(async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Sign in with Google to continue.' });
  if (!(await hasAcceptedTerms(user.id))) {
    return res.status(403).json({ error: 'Accept the terms and privacy policy to continue.', needsConsent: true });
  }
  return fn(req, res, user);
});

router.get('/sessions', requireUser(async (req, res, user) => {
  const { rows } = await pool.query(
    `select s.id, s.name, s.created_at, (s.leader_id = $1) as is_leader,
            (select array_agg(p.name order by p.position) from session_players p where p.session_id = s.id) as players,
            (select count(*)::int from games g where g.session_id = s.id and g.undone_at is null) as game_count
     from tracker_sessions s
     where s.leader_id = $1 or exists (select 1 from session_members m where m.session_id = s.id and m.user_id = $1)
     order by s.created_at desc`,
    [user.id],
  );
  res.json(rows.map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    players: r.players || [],
    gameCount: r.game_count,
    role: r.is_leader ? 'leader' : 'member',
  })));
}));

router.post('/sessions', requireUser(async (req, res, user) => {
  const players = (Array.isArray(req.body?.players) ? req.body.players : [])
    .map((p) => String(p).trim().slice(0, 20))
    .filter(Boolean);
  if (players.length < 2 || players.length > 4) {
    return res.status(400).json({ error: 'Need 2 to 4 players' });
  }
  if (new Set(players.map((p) => p.toLowerCase())).size !== players.length) {
    return res.status(400).json({ error: 'Player names must be different' });
  }
  const meIndex = toInt(req.body?.me, -1);
  const name = String(req.body?.name || '').trim().slice(0, 40)
    || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const id = newId();

  await transaction(async (db) => {
    await db.query(
      `insert into tracker_sessions (id, name, leader_id, rules, chip_rate, invite_code) values ($1, $2, $3, $4, $5, $6)`,
      [id, name, user.id, cleanRules(req.body?.rules, players.length), cleanChipRate(req.body?.chipRate, DEFAULT_CHIP_RATE), newId(8)],
    );
    for (const [i, p] of players.entries()) {
      await db.query(
        `insert into session_players (session_id, position, name, user_id) values ($1, $2, $3, $4)`,
        [id, i, p, i === meIndex ? user.id : null],
      );
    }
  });

  const s = await loadAccess(id, user.id);
  res.status(201).json(await sessionView(s, user.id));
}));

router.get('/sessions/:id', requireUser(async (req, res, user) => {
  const s = await loadAccess(req.params.id, user.id);
  if (!s) return res.status(404).json({ error: 'Session not found, or you have not joined it.' });
  res.json(await sessionView(s, user.id));
}));

router.patch('/sessions/:id', requireUser(async (req, res, user) => {
  const s = await loadAccess(req.params.id, user.id);
  if (!s) return res.status(404).json({ error: 'Session not found' });
  if (!s.is_leader) return res.status(403).json({ error: 'Only the session leader can change settings.' });
  const players = await loadPlayers(s.id);
  const name = req.body?.name !== undefined ? String(req.body.name).trim().slice(0, 40) || s.name : s.name;
  const rules = req.body?.rules ? cleanRules(req.body.rules, players.length, s.rules) : s.rules;
  const chipRate = req.body?.chipRate !== undefined ? cleanChipRate(req.body.chipRate, s.chip_rate) : s.chip_rate;
  await pool.query(
    `update tracker_sessions set name = $2, rules = $3, chip_rate = $4 where id = $1`,
    [s.id, name, rules, chipRate],
  );
  res.json(await sessionView(await loadAccess(s.id, user.id), user.id));
}));

router.delete('/sessions/:id', requireUser(async (req, res, user) => {
  const s = await loadAccess(req.params.id, user.id);
  if (!s) return res.status(404).json({ error: 'Session not found' });
  if (!s.is_leader) return res.status(403).json({ error: 'Only the session leader can delete it.' });
  await pool.query('delete from tracker_sessions where id = $1', [s.id]);
  res.status(204).end();
}));

router.post('/sessions/:id/games', requireUser(async (req, res, user) => {
  const s = await loadAccess(req.params.id, user.id);
  if (!s) return res.status(404).json({ error: 'Session not found' });
  if (!s.is_leader) return res.status(403).json({ error: 'Only the session leader can record games.' });
  const players = await loadPlayers(s.id);
  const names = players.map((p) => p.name);
  const { game, error } = validateGame(names, s.rules, req.body || {});
  if (error) return res.status(400).json({ error });

  await pool.query(
    `insert into games (id, session_id, data, rules, chip_rate, recorded_by) values ($1, $2, $3, $4, $5, $6)`,
    [newId(), s.id, game, s.rules, s.chip_rate, user.id],
  );
  res.status(201).json(await sessionView(s, user.id));
}));

router.delete('/sessions/:id/games/:gameId', requireUser(async (req, res, user) => {
  const s = await loadAccess(req.params.id, user.id);
  if (!s) return res.status(404).json({ error: 'Session not found' });
  if (!s.is_leader) return res.status(403).json({ error: 'Only the session leader can undo games.' });
  const { rowCount } = await pool.query(
    `update games set undone_at = now(), undone_by = $3 where id = $1 and session_id = $2 and undone_at is null`,
    [req.params.gameId, s.id, user.id],
  );
  if (!rowCount) return res.status(404).json({ error: 'Game not found' });
  res.json(await sessionView(s, user.id));
}));

router.get('/join/:code', requireUser(async (req, res, user) => {
  const { rows } = await pool.query(
    `select s.id, s.name, s.leader_id, coalesce(pr.display_name, u.name) as leader_name,
            exists (select 1 from session_members m where m.session_id = s.id and m.user_id = $2) as is_member
     from tracker_sessions s join "user" u on u.id = s.leader_id left join profiles pr on pr.user_id = u.id
     where s.invite_code = $1`,
    [req.params.code, user.id],
  );
  const s = rows[0];
  if (!s) return res.status(404).json({ error: 'This invite link is not valid. Ask the session leader for a new one.' });
  const players = await loadPlayers(s.id);
  res.json({
    id: s.id,
    name: s.name,
    leaderName: s.leader_name,
    joined: s.is_member || s.leader_id === user.id,
    claimed: players.some((p) => p.user_id === user.id),
    openPlayers: players.filter((p) => !p.user_id).map((p) => p.name),
  });
}));

router.post('/join/:code', requireUser(async (req, res, user) => {
  const { rows } = await pool.query(`select id, leader_id from tracker_sessions where invite_code = $1`, [req.params.code]);
  const s = rows[0];
  if (!s) return res.status(404).json({ error: 'This invite link is not valid. Ask the session leader for a new one.' });
  const claim = req.body?.claim ? String(req.body.claim) : null;

  const error = await transaction(async (db) => {
    if (s.leader_id !== user.id) {
      await db.query(
        `insert into session_members (session_id, user_id) values ($1, $2) on conflict do nothing`,
        [s.id, user.id],
      );
    }
    if (!claim) return null;
    const mine = await db.query(`select 1 from session_players where session_id = $1 and user_id = $2`, [s.id, user.id]);
    if (mine.rowCount) return 'You already have a player in this session.';
    const { rowCount } = await db.query(
      `update session_players set user_id = $3 where session_id = $1 and name = $2 and user_id is null`,
      [s.id, claim, user.id],
    );
    return rowCount ? null : 'That player is already taken.';
  });
  if (error) return res.status(409).json({ error });
  res.json({ id: s.id });
}));

router.use((req, res) => res.status(404).json({ error: 'Not found' }));

export default router;
