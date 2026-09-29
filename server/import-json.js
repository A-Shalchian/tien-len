import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { pool, transaction } from './db.js';
import { migrate } from './migrate.js';

const [email, leaderPlayer] = process.argv.slice(2);
if (!email) {
  console.log('Usage: npm run import-json -- <leader email> [leader player name]');
  process.exit(1);
}

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'scores.json');
const sessions = JSON.parse(fs.readFileSync(file, 'utf8'));

await migrate();
const { rows } = await pool.query('select id, name from "user" where lower(email) = lower($1)', [email]);
if (!rows[0]) {
  console.log(`No account with ${email}. Sign in with Google once first, then run this again.`);
  process.exit(1);
}
const leader = rows[0];

for (const session of sessions) {
  const exists = await pool.query('select 1 from tracker_sessions where id = $1', [session.id]);
  if (exists.rowCount) {
    console.log(`Skipped "${session.name}", already imported`);
    continue;
  }
  await transaction(async (db) => {
    await db.query(
      `insert into tracker_sessions (id, name, leader_id, rules, chip_rate, invite_code, created_at)
       values ($1, $2, $3, $4, 10, $5, $6)`,
      [session.id, session.name, leader.id, session.rules, crypto.randomBytes(8).toString('hex'), session.createdAt],
    );
    for (const [i, name] of session.players.entries()) {
      await db.query(
        `insert into session_players (session_id, position, name, user_id) values ($1, $2, $3, $4)`,
        [session.id, i, name, leaderPlayer && name.toLowerCase() === leaderPlayer.toLowerCase() ? leader.id : null],
      );
    }
    for (const game of session.games) {
      const { id, at, ...data } = game;
      await db.query(
        `insert into games (id, session_id, data, rules, created_at) values ($1, $2, $3, $4, $5)`,
        [id, session.id, data, session.rules, at],
      );
    }
  });
  console.log(`Imported "${session.name}" with ${session.games.length} games, leader ${leader.name}`);
}

await pool.end();
