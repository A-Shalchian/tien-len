import { betterAuth } from 'better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { pool } from './db.js';

export const STARTING_CHIPS = 1000;

export const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [process.env.BETTER_AUTH_URL],
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 60,
    updateAge: 60 * 60 * 24,
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await pool.query(
            `insert into chip_ledger (user_id, amount, reason) values ($1, $2, 'signup')`,
            [user.id, STARTING_CHIPS],
          );
        },
      },
    },
  },
});

export async function getUser(req) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  return session?.user || null;
}
