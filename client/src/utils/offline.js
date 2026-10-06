function read(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

export function cached(key) {
  return read(`tl-cache:${key}`, null);
}

export function remember(key, value) {
  write(`tl-cache:${key}`, value);
  return value;
}

export function queuedGames(sessionId) {
  return read(`tl-queue:${sessionId}`, []);
}

export function setQueuedGames(sessionId, games) {
  write(`tl-queue:${sessionId}`, games);
}

export function newClientId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
