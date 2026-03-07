# Progress Log

## 2026-03-06 — 4-Player Support & AI Bots

Upgraded the game from 2-player only to 2-4 players with AI bot opponents.

**4-Player Support:**
- Turn rotation cycles through all players instead of toggling between two
- Pass logic uses a Set — round ends when all but one player pass
- Win resolution calculates penalties for all losers, not just one
- Rooms support configurable player count (2/3/4)
- Lobby shows player count selector and waiting player list
- Game UI renders multiple opponent slots with active turn and passed indicators

**AI Bots:**
- Bot generates all valid combos from its hand and picks the lowest one
- Saves 2s for later (prefers non-2 plays)
- Passes when nothing beats the table
- Acts on a randomized 0.8-2s delay
- Host can toggle "fill with bots" in lobby or click "Start with Bots" while waiting
- Bot players show a BOT badge in the game UI

**Files changed:**
- `server/game/deck.js` — deal() accepts playerCount param
- `server/game/engine.js` — rewritten for N players
- `server/game/bot.js` — new file, bot AI logic
- `server/rooms.js` — multi-player rooms, bot backfill, startManually()
- `server/index.js` — N-player broadcasts, bot turn scheduling
- `client/src/App.jsx` — tracks botFlags, playerOrder, opponent map
- `client/src/components/Lobby.jsx` — player count, bot toggle, lobby player list
- `client/src/components/Game.jsx` — multi-opponent rendering, per-loser penalties
- `client/src/styles.css` — opponents-area layout, bot badge, passed states
