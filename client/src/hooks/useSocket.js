import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';
const KEY_NAME = 'tienlen-player-key';

function playerKey() {
  const fresh = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  try {
    let key = localStorage.getItem(KEY_NAME);
    if (!key) {
      key = fresh();
      localStorage.setItem(KEY_NAME, key);
    }
    return key;
  } catch {
    return fresh();
  }
}

const socket = io(SERVER_URL || window.location.origin, {
  auth: { key: playerKey() },
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
});

export function useSocket() {
  return socket;
}
