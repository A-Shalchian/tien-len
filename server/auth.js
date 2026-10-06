import { betterAuth } from 'better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { pool } from './db.js';

export const STARTING_CHIPS = 1000;

const env = (name) => process.env[name]?.trim();
const baseURL = env('BETTER_AUTH_URL');

export const auth = betterAuth({
  database: pool,
  secret: env('BETTER_AUTH_SECRET'),
  baseURL,
  trustedOrigins: [baseURL],
  socialProviders: {
    google: {
      clientId: env('GOOGLE_CLIENT_ID'),
      clientSecret: env('GOOGLE_CLIENT_SECRET'),
    },
  },
  account: {
    encryptOAuthTokens: true,
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

export function isAdmin(user) {
  const emails = (env('ADMIN_EMAILS') || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return Boolean(user?.email && user.emailVerified && emails.includes(user.email.toLowerCase()));
}

export async function getUser(req) {
  return getUserFromHeaders(req.headers);
}

export async function getUserFromHeaders(headers) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
  return session?.user || null;
}
