# Tien Len - Feature Roadmap

## How We're Splitting Work

Arash handles **server-side game logic and core gameplay upgrades**.
GF handles **UI/UX, animations, audio, and visual polish**.

This keeps us working in different files 90% of the time so we don't conflict.

---

## Arash's Features

### 1. 4-Player Support
The real Tien Len is 4 players. Right now it's hardcoded for 2.

**Server changes:**
- `server/game/deck.js` — `deal()` should split into 4 hands of 13 (full deck used)
- `server/game/engine.js` — `createGame()` takes 2-4 players, turn rotation cycles through all players, pass logic tracks multiple passes (round ends when 3 players pass in a row), `getOpponent()` becomes `getNextPlayer()`, `sanitizeHands()` returns all player counts
- `server/rooms.js` — rooms support 2-4 players, host can set player count, game starts when room is full
- `server/index.js` — update all event handlers to broadcast to all players in room

**Client changes (minimal):**
- `client/src/components/Game.jsx` — render multiple opponents instead of one, show all balances
- `client/src/components/OpponentHand.jsx` — reuse for each opponent, position them around the table

### 2. AI Bot Players
Fill empty seats with bots so you can play solo or with fewer humans.

- Create `server/game/bot.js` — bot logic that picks valid plays from its hand
- Simple strategy: play lowest valid combo, pass if nothing beats table, save 2s for late game
- Bots act on a short delay (1-2 seconds) so it feels natural
- Host can toggle "fill with bots" before game starts
- Bot names: random Vietnamese-themed names

### 3. Reconnection Support
Right now if you refresh, your game is gone.

- `server/rooms.js` — store a reconnection token per player, don't destroy room immediately on disconnect (use a 30-second timeout)
- `server/index.js` — add `reconnect` event that re-associates a socket ID with a player slot
- Client stores reconnection token in `sessionStorage`

### 4. Smarter Penalty System
Expand the chip penalty rules to match common house rules:

- Holding all four 2s at end = instant loss penalty (big multiplier)
- Last card is a 2 = double penalty
- Getting "tien len'd" (opponent plays all cards in one continuous streak without you playing) = triple penalty

### 5. Game History / Stats
- Track wins, losses, biggest pots per session in server memory
- Add a `game-history` event that sends stats to clients
- Client shows a simple stats panel (GF will style it)

---

## GF's Features

### 1. Card Animations
Right now cards just appear/disappear. Add:

- **Deal animation** — cards fly out from center to hand positions
- **Play animation** — selected cards slide from hand to table
- **Win animation** — confetti or card explosion effect
- **Card flip** — opponent cards flip over at end of hand to reveal remaining cards

Files to touch: `client/src/components/Card.jsx`, `client/src/components/Hand.jsx`, `client/src/components/Table.jsx`, `client/src/styles.css`

### 2. Sound Effects
- Card play sound (slap/snap)
- Card select click
- Pass sound (subtle whoosh)
- Win/lose jingle
- Emote pop sound
- Your-turn notification chime

Create `client/src/hooks/useSound.js` — preload audio files, expose `playSound('cardPlay')` etc.
Add audio files in `client/public/sounds/`

### 3. Visual Theme Upgrade
The current UI is minimal dark theme. Level it up:

- Green felt table background texture in the table area
- Card design upgrade — add corner pips, make them look more like real cards
- Nicer card-back design with a pattern
- Player avatars (pick from a set of preset avatars in lobby)
- Pot display in center of table showing current ante

Files: `client/src/styles.css`, `client/src/components/Card.jsx`, `client/src/components/OpponentHand.jsx`

### 4. Responsive Layout for Desktop
Currently mobile-first. Make it work great on desktop too:

- Landscape layout with opponents positioned around a virtual table (top, left, right)
- Bigger cards on desktop
- Hover effects on cards (preview lift)
- Keyboard shortcuts (1-9 to select cards, Enter to play, Backspace to pass)

### 5. Emote System Upgrade
Current emotes are basic emoji buttons. Upgrade:

- Animated emote reactions (not just floating text)
- Emote cooldown (prevent spam)
- More emote options, maybe organized in categories
- Emote appears near the player who sent it

Files: `client/src/components/EmoteBar.jsx`, `client/src/components/EmoteOverlay.jsx`, `client/src/styles.css`

### 6. Stats Panel UI
Ryan will send game history data from the server. Build the UI:

- Slide-out panel or modal showing session stats
- Win/loss record, chip graph over time
- "Best hand" highlight

---

## Shared / Coordinate Together

- **4-player UI layout** — Arash builds the server logic, GF builds the multi-opponent layout. Coordinate on the data shape.
- **Stats** — Arash sends the data, GF builds the display.
- **Bot UI indicators** — Arash creates bots, GF adds a bot badge/icon to distinguish them from humans.
