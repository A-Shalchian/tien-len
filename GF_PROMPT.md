# Claude Code Prompt - Tien Len UI/UX Features

You are working on a **Tien Len (Vietnamese card game)** web app. It's a React + Vite frontend with a Socket.IO backend. You are responsible for **UI/UX, animations, audio, and visual polish**. Another developer (Arash) is handling server-side game logic changes separately — do NOT modify server files unless absolutely necessary.

## Project Structure

```
tien-len/
├── server/              # DO NOT MODIFY (Ryan's domain)
│   ├── index.js
│   ├── rooms.js
│   └── game/
│       ├── deck.js
│       ├── validator.js
│       └── engine.js
├── client/              # YOUR WORKSPACE
│   ├── vite.config.js
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── styles.css
│   │   ├── hooks/useSocket.js
│   │   ├── utils/cards.js
│   │   └── components/
│   │       ├── Lobby.jsx
│   │       ├── Game.jsx
│   │       ├── Card.jsx
│   │       ├── Hand.jsx
│   │       ├── OpponentHand.jsx
│   │       ├── Table.jsx
│   │       ├── MoneyDisplay.jsx
│   │       ├── EmoteBar.jsx
│   │       └── EmoteOverlay.jsx
```

## Tech Stack

- React 19, Vite 6, Socket.IO client
- Pure CSS (no Tailwind, no CSS-in-JS) — all styles in `client/src/styles.css`
- No component library — everything is custom
- Dark theme (#1a1a1a background)
- Mobile-first design

## How the Game Works

Tien Len is a climbing card game. Players take turns playing combos (singles, pairs, triples, sequences, double sequences) that beat what's on the table. First to empty their hand wins. Cards rank 3 (lowest) to 2 (highest). Suits rank: Spades < Clubs < Diamonds < Hearts.

The game flow: Lobby (create/join room) -> Game starts (13 cards dealt) -> Players take turns playing or passing -> Hand ends when someone empties their hand -> Next hand or game over.

## Your Features (in priority order)

### Feature 1: Card Animations
Add smooth animations for card actions. Currently cards just appear/disappear instantly.

**What to build:**
- Deal animation: cards fly from center of screen to hand, staggered (each card delayed ~50ms)
- Play animation: selected cards slide from hand position up to the table
- Card reveal: at end of hand, opponent's remaining cards flip from back to front
- Win celebration: simple particle/confetti burst when you win

**Where to work:**
- `Card.jsx` — add CSS transition classes
- `Hand.jsx` — stagger dealing animation
- `Table.jsx` — animate cards arriving
- `Game.jsx` — trigger animations on state changes
- `styles.css` — all the keyframe animations

**Tips:**
- Use CSS animations/transitions, not a library
- Add a `data-dealing` or className like `dealing` that triggers the animation, then remove it
- For the play animation, you can use `onAnimationEnd` to clean up

### Feature 2: Sound Effects
Add audio feedback for game actions.

**What to build:**
- Create `client/src/hooks/useSound.js` hook
- Preload small audio files on mount
- Sound triggers: card select (click), card play (slap), pass (whoosh), win (fanfare), lose (sad trombone), emote pop, your-turn chime
- Add a mute toggle button somewhere in the game UI
- Store mute preference in localStorage

**Where to work:**
- Create `client/src/hooks/useSound.js`
- Create `client/public/sounds/` directory with audio files
- `Game.jsx` — call `playSound()` at appropriate moments
- `styles.css` — style the mute button

**Tips:**
- Use small .mp3 or .wav files (keep them under 50KB each)
- You can generate placeholder sounds or use freesound.org links
- Use the Web Audio API or simple `new Audio()` — keep it simple
- Respect the mute state everywhere

### Feature 3: Visual Theme Upgrade
Level up the look and feel from basic dark mode to something that feels like a real card table.

**What to build:**
- Green felt texture background on the table area (CSS gradient or subtle pattern, no image needed)
- Better card design: add corner rank/suit pips (top-left and bottom-right like real cards), subtle shadow
- Nicer card backs with a repeating diamond/cross pattern
- Show the pot amount in the center of the table area
- Player avatar system: pick from 8-10 preset emoji avatars in the lobby, display next to names in game

**Where to work:**
- `styles.css` — most of the work
- `Card.jsx` — add corner pips markup
- `OpponentHand.jsx` — card back pattern
- `Lobby.jsx` — avatar picker
- `Game.jsx` — show pot, show avatars
- `MoneyDisplay.jsx` — maybe redesign with a chip icon

### Feature 4: Desktop Responsive Layout
Currently works on mobile. Make desktop great.

**What to build:**
- Media query breakpoint at ~768px
- Desktop: landscape layout, cards bigger, opponent area at top with more space
- Hover effect on cards (slight lift + glow on hover, full lift on select)
- Keyboard shortcuts: number keys to toggle card selection, Enter to play, Escape to deselect all, Space to pass

**Where to work:**
- `styles.css` — media queries
- `Game.jsx` — keyboard event listeners
- `Card.jsx` — hover states

### Feature 5: Emote System Upgrade
Make emotes more fun and less spammable.

**What to build:**
- Animated emote display (scale in + bounce, not just float up)
- 2-second cooldown between sending emotes (disable buttons during cooldown)
- Show emote near the sender's avatar/name area instead of generic center position
- Add more emotes: organize into a small grid/popover instead of a single row

**Where to work:**
- `EmoteBar.jsx` — cooldown logic, grid layout
- `EmoteOverlay.jsx` — new animation, positioned near player
- `styles.css` — animations

## Git Workflow

- Work on a feature branch: `git checkout -b feature/card-animations`
- Make small, focused commits
- When done with a feature, push and create a PR
- Start with Feature 1 (card animations) since it has the biggest visual impact

## Running the Project

```bash
# From the root directory
npm run install:all   # install all dependencies
npm run dev           # starts both server (port 3001) and client (vite dev server)
```

The client connects to `http://localhost:3001` by default. Open two browser tabs to test (create room in one, join in the other).
