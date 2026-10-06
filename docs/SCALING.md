# Scaling guide

Written 2026-10-06. Prices come from the Render and Neon pricing pages in October 2026. They are estimates, so check them again before you pay for anything.

## How the app runs today

- One Node process on Render's free plan (service `tien-len`). It sleeps after 15 minutes with no traffic, and the next visitor waits about 50 s.
- Express 4 serves the API and the built React app. Socket.IO 4 runs the games. Better Auth handles Google sign-in.
- Neon Postgres through `pg`, with a pool of 5 connections (`server/db.js`).
- Rooms, games, the matchmaking queue and rejoin seats live in Maps in `server/rooms.js`. A restart or deploy ends every live game.
- Bots run on timers inside the same process.
- Render already compresses responses with Brotli. The live site returns `content-encoding: br`.

## Packages we use

Versions are the ones installed after `npm audit fix` on 2026-10-06.

| Package | Version | What it does | Verdict |
|---|---|---|---|
| express | 4.22.3 | HTTP server, API routes, serves the client | Keep. Express 4 still gets security fixes. Express 5 changes the wildcard routes (`app.get('*')`, `/api/auth/*`) and adds nothing this app needs. |
| socket.io | 4.8.3 | Real-time game messages | Update to 4.8.4 (patch). |
| better-auth | 1.7.6 | Google sign-in and sessions | Update to 1.7.7 (patch). |
| pg | 8.23.0 | Postgres client | Update to 8.23.1 (patch). |
| cors | 2.8.6 | CORS headers for local dev | Keep, but allow only the site URL and localhost. Express and Socket.IO both allow any origin today. |
| react, react-dom | 19.2.4 | UI | Update to 19.3.0 (minor). |
| socket.io-client | 4.8.3 | Browser side of Socket.IO | Update to 4.8.4 at the same time as the server. |
| vite (dev) | 6.4.3 | Dev server and production build | Keep for now. Vite 6.4 still gets security backports. Move to Vite 8 when you have a free afternoon. |
| @vitejs/plugin-react (dev) | 4.7.0 | React support for Vite | Move to 6 together with Vite 8. |
| concurrently (root, dev) | 9.2.1 | Runs server and client with `npm run dev` | Keep. Run `npm audit fix` in the repo root to get a patched `shell-quote`. |

To take all the patch and minor updates, run `npm update` in `server/` and `client/`, then `npm test` and `npx vite build`.

Audit status:

- Before the fix, the server had 8 advisories (1 critical, 4 high, 2 moderate, 1 low). They included memory-exhaustion bugs in `engine.io`, `socket.io-parser` and `ws` that anyone could trigger.
- Before the fix, the client had 11 advisories (8 high, 2 moderate, 1 low). Most were in build tools.
- After the fix, both folders report 0.
- Run `npm audit` in both folders once a month.

## Packages to add

| Package | Where | When | Why |
|---|---|---|---|
| helmet | server | Now | Sets security headers. The live site sends no `X-Frame-Options` or `Content-Security-Policy`, so any site can load the game in a frame. Allow Google avatar images (`lh3.googleusercontent.com`) in the CSP. |
| express-rate-limit | server | Now | Limits requests per IP. Use a strict limit on `/api/auth` and `/api/join/:code` (invite codes), and a looser one on the rest of `/api`. |
| @sentry/node, @sentry/react | both | About 1,000 users | Sends you an alert when the server or the page throws. The free plan is enough for a hobby project. |
| @socket.io/redis-adapter, redis | server | About 100,000 users | Lets several server instances broadcast to the same Socket.IO room. |
| bullmq | server | About 100,000 users | A job queue on the same Redis. Saves hand results with retries. |

Skip these:

- `compression`. Render already sends Brotli.
- `dotenv`. Node's `--env-file` flag already loads `.env`.
- An ORM. Plain SQL through `pg` works at every tier below.

Socket events are not HTTP requests, so express-rate-limit does not cover them. Add a small per-socket counter in code for `create-room`, `emote` and `find-match`. Today one script can call `create-room` in a loop and fill the server's memory. Also set Socket.IO's `maxHttpBufferSize` to about 10 KB. The default is 1 MB, and the largest message this game receives is a short list of card ids.

## Scaling by number of users

Assumptions:

- "Users" means signed-up accounts. "Online" means connected during the busiest hour.
- About 10% of users are online at peak. Most sites see less, so this guess is on the safe side.
- Over a whole day, the average number online is about a third of the peak.
- 4 players per table and about 20 hands per table per hour.
- Each player gets about 54 game messages per hand at about 1.1 KB each. I measured this by playing 50 bot hands through the engine. That is about 60 KB per hand, or 1.2 MB per player per hour.
- Render bills WebSocket traffic as bandwidth. The free Hobby workspace includes 5 GB a month, Pro ($25 a month) includes 25 GB, and each extra GB costs $0.15.
- Neon Launch costs $0.106 per compute-hour plus $0.35 per GB-month of storage. One compute unit (CU) is about 4 GB of RAM. A 0.25 CU database that never sleeps uses about 180 compute-hours a month.
- All costs are rough monthly estimates in US dollars.

### 100 users (about 10 online)

What breaks first:

- The free plan sleeps. The first visitor waits about 50 s.
- Every deploy ends live games.
- Nothing limits requests or socket events.

What to change:

- Add helmet, express-rate-limit and the socket event limits.
- Deploy when nobody is playing. The admin dashboard shows live rooms.

Cost estimate: $0 on Render free and Neon free. $7 if you move to Render Starter to stop the cold start.

### 1,000 users (about 100 online, 25 tables)

What breaks first:

- Neon free includes 100 compute-hours a month. With players on most of the day, the database stops sleeping and needs about 180.
- Cold starts on the free plan now hit real players.
- Bandwidth passes the 5 GB Hobby allowance (about 30 GB a month).
- The leaderboard in `server/profile.js` sums every `chip_ledger` row on every request. Each ranked hand adds up to 4 rows, so it gets slower every week.

What to change:

- Render Starter ($7, 0.5 CPU, 512 MB) and Neon Launch.
- Put the Render service and the Neon database in the same region. Saving one hand runs up to 9 queries one after another, so network distance adds up.
- Use Neon's pooled connection string. Its host name contains `-pooler`.
- Cache the leaderboard in memory for 60 seconds.
- Add Sentry.

Cost estimate: about $25 to $40.

### 10,000 users (about 1,000 online, 250 tables)

What breaks first:

- Balances. `getBalance`, the daily top-up and the leaderboard all run `sum(amount)` over `chip_ledger`, which now grows by about 5 million rows a month.
- Boot time. `server/schema.sql` runs on every start. Its `add constraint` line re-checks every `chip_ledger` row and locks the table while it does.
- Deploys. 1,000 sockets reconnect at once. Each one runs 2 to 3 queries (session and profile) through a pool of 5.
- Lost chips. `recordOnlineHand` runs without a retry. If the database fails for a moment, that hand's chip changes are gone.

What to change:

- Add a `balance` column (or a `user_balances` table). Update it in the same transaction as each ledger insert. Read balances and the leaderboard from it. Keep the ledger as history.
- Add the constraint only when it is missing, so boot does not scan the ledger.
- Turn on Better Auth's `session.cookieCache`, so most session checks skip the database.
- Raise the pool to 10 or 15.
- Retry failed hand saves.
- Handle `SIGTERM`. Stop starting new hands, let running hands finish, then exit. Set `maxShutdownDelaySeconds` on Render (up to 300).
- Send nicknames, bot flags and away flags only when they change, not with every move. This cuts bandwidth.
- Move to Render Standard ($25, 1 CPU, 2 GB) if memory in the Render metrics stays above about 400 MB.

Cost estimate: about $90 to $160 (Render $7 to $25, Neon $40 to $80, bandwidth about $45).

### 100,000 users (about 10,000 online, 2,500 tables)

What breaks first:

- One process. It sends about 3,000 messages a second and runs every bot timer on one CPU core. A crash or deploy ends 2,500 games at once.
- You cannot just add a second instance. Each instance has its own Maps in `rooms.js`, so players in one room could land on different instances and never see each other.
- Render has no sticky sessions, and Socket.IO's long-polling fallback needs them.
- Bandwidth is about 3 TB a month and is now the largest bill.

What to change:

- Add Render Key Value (Redis) and `@socket.io/redis-adapter`. Run 3 or 4 instances.
- Set the client to `transports: ['websocket']`. Each connection then stays on one instance without sticky sessions.
- Move rooms, the matchmaking queue and rejoin seats from the Maps in `rooms.js` into Redis.
- Give each room one owner instance that runs its game and bot timers. Other instances forward player actions to the owner with Socket.IO's `serverSideEmit`.
- Save hand results through a BullMQ queue. A worker writes them to Postgres and retries on failure.
- Cache the leaderboard in Redis and refresh it once a minute.
- Put the static files on a CDN. File names in `/assets` are hashed, so send them with a one-year cache header and turn on Render edge caching.
- Track online players, open tables, event loop delay, pool wait time and queue length. Alert on errors and restarts.

Cost estimate: about $700 to $1,200 (instances $75 to $340, Redis about $30, Neon 1 to 4 CU $80 to $310, bandwidth about $440, Render Pro workspace $25).

### 1,000,000 users (about 100,000 online, 25,000 tables)

What breaks first:

- Bandwidth on Render is about 30 TB a month, which costs about $4,400.
- Postgres writes. About 140 hands a second means about 1,200 new rows a second.
- Players in Vietnam or Australia on a US server see about 200 ms of lag.
- One Redis instance carries every room and every broadcast.

What to change:

- Split game servers by region, for example Singapore and Virginia. Match players within their region. Keep one database region. Only hand results and profiles travel there.
- Run 20 or more game server processes behind a lobby service. The lobby handles sign-in, the room list and matchmaking, and tells each client which game server hosts its room.
- Batch ledger inserts in the queue worker. Split `chip_ledger` and `online_hands` into monthly partitions.
- Neon Scale or a dedicated Postgres server, with a read replica for profile and history pages.
- Compare hosts on bandwidth price. At this size, bandwidth costs more than servers.

Cost estimate: about $6,000 to $12,000.

### 10,000,000 users (about 1,000,000 online)

What breaks first:

- Everything above, at 10 times the size. One person can no longer run it.

What to change:

- Hire a team with on-call shifts.
- Game servers in every major region, a global matchmaker and a Redis cluster per region.
- Shard the database by user, or move chips to a separate ledger service.
- Anti-cheat tools, customer support and a legal review of the chip economy in each country.

Cost estimate: about $50,000 to $150,000, plus salaries.

## Do this first

1. Add helmet and express-rate-limit, limit `create-room`, `emote` and `find-match` per socket, set a small `maxHttpBufferSize`, and restrict CORS to the site URL.
2. Add a balance column that updates in the same transaction as the ledger, and cache the leaderboard for 60 seconds.
3. Stop `schema.sql` from re-adding the `chip_ledger` constraint on every boot.
4. Handle `SIGTERM` so deploys let running hands finish, and retry failed hand saves.
5. When real players start to wait on cold starts, move to Render Starter and Neon Launch in the same region.
