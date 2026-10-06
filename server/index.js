import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import scoresRouter from './scores.js';
import profileRouter, { loadProfile } from './profile.js';
import { createAdminRouter } from './admin.js';
import { auth, getUserFromHeaders } from './auth.js';
import { getBalance, recordOnlineHand } from './chips.js';
import { createGameServer, MAX_MESSAGE_BYTES } from './game-server.js';
import { migrate } from './migrate.js';

import { fileURLToPath } from 'url';
import path from 'path';

process.on('unhandledRejection', (err) => console.error('Unhandled promise rejection', err));
process.on('uncaughtException', (err) => console.error('Uncaught exception', err));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, '..', 'client', 'dist');

const app = express();
app.use(cors());
app.use(express.static(clientDist));
app.all('/api/auth/*', toNodeHandler(auth));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  maxHttpBufferSize: MAX_MESSAGE_BYTES,
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

async function loadPlayer(userId) {
  const profile = await loadProfile(userId);
  if (!profile) return null;
  return { userId: profile.id, name: profile.name, termsAccepted: !!profile.termsAcceptedAt };
}

const game = createGameServer(io, { getUser: getUserFromHeaders, loadPlayer, getBalance, recordOnlineHand });

app.use('/api/admin', createAdminRouter({
  live: game.live,
  closeRoom: (code) => game.closeRoomFor(code, 'An admin closed this room.'),
}));
app.use('/api', profileRouter);
app.use('/api', scoresRouter);

app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

const PORT = process.env.PORT || 3001;
await migrate();
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
