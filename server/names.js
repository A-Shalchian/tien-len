export function cleanImage(url) {
  return typeof url === 'string' && url.startsWith('https://lh3.googleusercontent.com/') ? url : null;
}

export function cleanName(name) {
  return typeof name === 'string' ? name.trim().slice(0, 40) || 'Player' : 'Player';
}

export function publicName(displayName, googleName) {
  if (typeof displayName === 'string' && displayName.trim()) return cleanName(displayName);
  const parts = cleanName(googleName).split(/\s+/);
  if (parts.length < 2) return parts[0];
  const initial = Array.from(parts[parts.length - 1])[0].toUpperCase();
  return `${parts[0]} ${initial}.`;
}
