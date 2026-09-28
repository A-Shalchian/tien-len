# Tiên Lên

I made this for playing Tiên Lên with my girlfriend Vy and her workmate Thư (aka clemenfahhh). We play in person a lot, and keeping score with pen and paper got old, so I built a score tracker for whenever we play.

Next up is the online version, so they can play on my site instead of on Facebook. Maybe with some gambling, haha.

## Score tracker

Open `/scores` to start a session with 2 to 4 players. After each game, enter the finish order and any penalties. The page keeps running totals, wins and game history with undo.

Default points for 3 players:

| Event | Points |
|---|---|
| 1st / 2nd / 3rd | +2 / +1 / 0 |
| Chopping a black 2 | chopper +1, chopped player -1 |
| Chopping a red 2 | chopper +2, chopped player -2 |
| Last place left holding a black 2 | last -1, player above them +1 |
| Last place left holding a red 2 | last -2, player above them +2 |
| Cóng (never played a card) | -1 |
| Instant win | winner +3 |

Multiple 2s add up. You can change every point value when you create a session.

## Online game

The online version runs on Socket.IO with 2 to 4 players, bots, room links and betting.

## Running it

```
npm install
npm run install:all
npm run dev
```

The client runs at http://localhost:5173 and the server on port 3001. Score sessions are saved to `server/data/scores.json`.
