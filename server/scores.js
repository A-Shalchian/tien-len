import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = process.env.SCORES_FILE || path.join(__dirname, 'data', 'scores.json');

const DEFAULT_PLACE_POINTS = {
  2: [1, 0],
  3: [2, 1, 0],
  4: [3, 2, 1, 0],
};

const DEFAULT_PENALTIES = {
  chopBlack: 1,
  chopRed: 2,
  stuckBlack: 1,
  stuckRed: 2,
  cong: 1,
  instantWin: 3,
  threeSpadeWin: 2,
};

let sessions = load();

function load() {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
  for (const session of data) {
    if (session.rules.stuckTwo !== undefined) continue;
    for (const [key, value] of Object.entries(DEFAULT_PENALTIES)) {
      if (session.rules[key] === undefined) session.rules[key] = value;
    }
  }
  return data;
}

function save() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(sessions, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function newId() {
  return crypto.randomBytes(6).toString('hex');
}

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) ? n : fallback;
}

function cleanRules(input, playerCount) {
  const placeDefault = DEFAULT_PLACE_POINTS[playerCount];
  const place = Array.isArray(input?.place) && input.place.length === playerCount
    ? input.place.map((v, i) => toInt(v, placeDefault[i]))
    : placeDefault;
  const rules = { place };
  for (const key of Object.keys(DEFAULT_PENALTIES)) {
    rules[key] = Math.max(0, toInt(input?.[key], DEFAULT_PENALTIES[key]));
  }
  return rules;
}

function validateGame(session, body) {
  const players = session.players;
  const has = (name) => players.includes(name);

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
  const threeSpadeWin = !instantWin && !session.rules.stuckTwo && Boolean(body.threeSpadeWin);
  const cong = [];
  const chops = [];
  const legacy = session.rules.stuckTwo !== undefined;
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

  return {
    game: {
      id: newId(),
      at: new Date().toISOString(),
      order,
      instantWin,
      stuckTwos,
      stuckLast,
      threeSpadeWin,
      cong,
      chops,
    },
  };
}

function summary(s) {
  return {
    id: s.id,
    name: s.name,
    createdAt: s.createdAt,
    players: s.players,
    gameCount: s.games.length,
  };
}

const router = express.Router();
router.use(express.json());

router.get('/sessions', (req, res) => {
  res.json([...sessions].reverse().map(summary));
});

router.post('/sessions', (req, res) => {
  const players = (Array.isArray(req.body?.players) ? req.body.players : [])
    .map((p) => String(p).trim().slice(0, 20))
    .filter(Boolean);
  if (players.length < 2 || players.length > 4) {
    return res.status(400).json({ error: 'Need 2 to 4 players' });
  }
  if (new Set(players.map((p) => p.toLowerCase())).size !== players.length) {
    return res.status(400).json({ error: 'Player names must be different' });
  }
  const name = String(req.body?.name || '').trim().slice(0, 40)
    || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const session = {
    id: newId(),
    name,
    createdAt: new Date().toISOString(),
    players,
    rules: cleanRules(req.body?.rules, players.length),
    games: [],
  };
  sessions.push(session);
  save();
  res.status(201).json(session);
});

router.get('/sessions/:id', (req, res) => {
  const session = sessions.find((s) => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

router.delete('/sessions/:id', (req, res) => {
  const before = sessions.length;
  sessions = sessions.filter((s) => s.id !== req.params.id);
  if (sessions.length === before) return res.status(404).json({ error: 'Session not found' });
  save();
  res.status(204).end();
});

router.post('/sessions/:id/games', (req, res) => {
  const session = sessions.find((s) => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const { game, error } = validateGame(session, req.body || {});
  if (error) return res.status(400).json({ error });
  session.games.push(game);
  save();
  res.status(201).json(session);
});

router.delete('/sessions/:id/games/:gameId', (req, res) => {
  const session = sessions.find((s) => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const before = session.games.length;
  session.games = session.games.filter((g) => g.id !== req.params.gameId);
  if (session.games.length === before) return res.status(404).json({ error: 'Game not found' });
  save();
  res.json(session);
});

router.use((req, res) => res.status(404).json({ error: 'Not found' }));

export default router;
