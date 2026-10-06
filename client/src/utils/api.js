import { clearPrivateData } from './offline.js';

export async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      ...options,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw Object.assign(new Error("You're offline. Check your connection."), { offline: true });
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || data.message || 'Request failed'), { data });
  return data;
}

export async function getMe() {
  const me = await api('/me');
  if (!me.user) clearPrivateData();
  return me;
}

export async function signIn(returnTo = window.location.pathname) {
  const { url } = await api('/auth/sign-in/social', {
    method: 'POST',
    body: { provider: 'google', callbackURL: returnTo },
  });
  window.location.href = url;
}

export async function signOut() {
  await api('/auth/sign-out', { method: 'POST', body: {} });
  clearPrivateData();
  window.location.reload();
}
