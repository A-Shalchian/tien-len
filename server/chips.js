import { pool, transaction } from './db.js';
import { STARTING_CHIPS } from './auth.js';

const DAILY_TOP_UP = 100;

export async function getBalance(userId, db = pool) {
  const { rows } = await db.query(
    'select coalesce((select balance from user_balances where user_id = $1), 0)::int as balance',
    [userId],
  );
  return rows[0].balance;
}

export async function applyDailyTopUp(userId) {
  await pool.query(
    `insert into chip_ledger (user_id, amount, reason, day)
     select $1, $2, 'daily', (now() at time zone 'utc')::date
     where coalesce((select balance from user_balances where user_id = $1), 0) < $3
     on conflict do nothing`,
    [userId, DAILY_TOP_UP, STARTING_CHIPS],
  );
}

export async function recordOnlineHand({ id, stake, data, players }) {
  await transaction(async (db) => {
    await db.query('insert into online_hands (id, stake, data) values ($1, $2, $3)', [id, stake, data]);
    for (const p of players) {
      await db.query(
        `insert into online_hand_players (hand_id, seat, user_id, name, place, points, chips)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [id, p.seat, p.userId, p.name, p.place, p.points, p.chips],
      );
      if (p.userId && p.chips) {
        await db.query(
          `insert into chip_ledger (user_id, amount, reason, game_id) values ($1, $2, 'online', $3)`,
          [p.userId, p.chips, id],
        );
      }
    }
  });
}
