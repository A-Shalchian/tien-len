import { pool, transaction } from './db.js';

const DAILY_CHIPS = 100;
const REFILL_CHIPS = 1000;
const REFILL_BELOW = 100;

export async function getBalance(userId, db = pool) {
  const { rows } = await db.query(
    'select coalesce((select balance from user_balances where user_id = $1), 0)::int as balance',
    [userId],
  );
  return rows[0].balance;
}

export async function chipClaims(userId) {
  const { rows } = await pool.query(
    `with last as (
       select max(created_at) filter (where reason = 'daily') + interval '24 hours' as daily_at,
              max(created_at) filter (where reason = 'refill') + interval '7 days' as refill_at
       from chip_ledger where user_id = $1 and reason in ('daily', 'refill')
     )
     select case when daily_at > now() then daily_at end as daily_at,
            case when refill_at > now() then refill_at end as refill_at
     from last`,
    [userId],
  );
  return {
    daily: DAILY_CHIPS,
    dailyAt: rows[0].daily_at,
    refill: REFILL_CHIPS,
    refillBelow: REFILL_BELOW,
    refillAt: rows[0].refill_at,
  };
}

async function claim(userId, sql, params) {
  return transaction(async (db) => {
    await db.query('select id from "user" where id = $1 for update', [userId]);
    const { rowCount } = await db.query(sql, [userId, ...params]);
    return rowCount > 0;
  });
}

export function claimDaily(userId) {
  return claim(
    userId,
    `insert into chip_ledger (user_id, amount, reason, day)
     select $1, $2, 'daily', (now() at time zone 'utc')::date
     where not exists (
       select 1 from chip_ledger
       where user_id = $1 and reason = 'daily' and created_at > now() - interval '24 hours'
     )`,
    [DAILY_CHIPS],
  );
}

export function claimRefill(userId) {
  return claim(
    userId,
    `insert into chip_ledger (user_id, amount, reason)
     select $1, $2, 'refill'
     where coalesce((select balance from user_balances where user_id = $1), 0) < $3
       and not exists (
         select 1 from chip_ledger
         where user_id = $1 and reason = 'refill' and created_at > now() - interval '7 days'
       )`,
    [REFILL_CHIPS, REFILL_BELOW],
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
