# Progress

## Now

- [x] One `server/schema.sql` instead of a migrations folder. The server runs it on every start and it only adds what's missing.
- [x] Database cleanup: dropped the old migrations table, backup saved outside the repo. There were no session chip rows or expired logins to delete.
- [x] Online rules: play out every place, bigger chops, last winner starts the next hand, 3♠ only on the first hand
- [x] Online chips scored like the score tracker, each point worth the stake. Leaving mid-hand hands your seat to a bot. Engine tests in `server/game/engine.test.js` (`npm test` in server)
- [x] Save Quick Match hands (place, points, chips per player). Profiles show online hands and wins, and your own profile has an Online tab. Practice rooms aren't saved.
- [x] Rejoin after a refresh or dropped connection. A bot plays your seat for up to 60 seconds while you're gone. Pressing Back still leaves for good.
- [x] Smarter bots: they plan their hand, hold 2s and chops, always chop 2s, and push harder when someone is close to going out. Against the old bots over 3,000 hands they win 27% vs 23% (4 players), 36% vs 30% (3) and 54% vs 46% (2).
- [x] Score tracker works offline: the page is cached, games recorded with no signal stay on the phone and sync later. Sessions have a points-over-time chart and a head-to-head table.
- [ ] Vietnamese language toggle for the whole site

## Later

- Stop chip farming in Quick Match
- More instant wins (six pairs, 5 pairs in a row)
- Turn timer for idle players

## Done before

- Oct 5: shorter chip info, site wide scrollbars, app icon, MIT license, name spelled Tiến Lên
- Oct 4: score tracker sessions are private, profile groups games by session, README screenshots, chip info modal, three column lobby
- Oct 3: phone friendly play screens, sign-in for Quick Match, open rooms list
- Sep 28: Neon database, Google sign-in, chips, invites, profiles, data export, account deletion, legal pages
- Sep 27: landing page, 3♠ finish bonus
