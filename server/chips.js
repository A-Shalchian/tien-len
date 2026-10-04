import { pool, transaction } from './db.js';
import { STARTING_CHIPS } from './auth.js';

const DAILY_TOP_UP = 100;

export async function getBalance(userId, db = pool) {
  const { rows } = await db.query('select coalesce(sum(amount), 0)::int as balance from chip_ledger where user_id = $1', [userId]);
  return rows[0].balance;
}

export async function applyDailyTopUp(userId) {
  await pool.query(
    `insert into chip_ledger (user_id, amount, reason, day)
     select $1, $2, 'daily', (now() at time zone 'utc')::date
     where (select coalesce(sum(amount), 0) from chip_ledger where user_id = $1) < $3
     on conflict do nothing`,
    [userId, DAILY_TOP_UP, STARTING_CHIPS],
  );
}

export async function recordOnlineChips(movements) {
  if (movements.length === 0) return;
  await transaction(async (db) => {
    for (const m of movements) {
      await db.query(`insert into chip_ledger (user_id, amount, reason) values ($1, $2, 'online')`, [m.userId, m.amount]);
    }
  });
}

export function chipMovements(deltas, players, rate) {
  if (!rate) return [];
  const names = Object.keys(deltas);
  const average = names.reduce((sum, n) => sum + deltas[n], 0) / names.length;
  return players
    .filter((p) => p.user_id)
    .map((p) => ({ userId: p.user_id, amount: Math.round((deltas[p.name] - average) * rate) }))
    .filter((m) => m.amount !== 0);
}
