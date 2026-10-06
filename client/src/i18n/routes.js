export const PUBLIC_PATHS = ['/', '/play', '/scores', '/privacy', '/terms'];

export function splitPath(pathname) {
  const match = pathname.match(/^\/vi(\/.*)?$/);
  return match ? { prefixed: true, path: match[1] || '/' } : { prefixed: false, path: pathname };
}

export function isPublicPath(path) {
  return PUBLIC_PATHS.includes(path);
}

export function langFromUrl(pathname) {
  const { prefixed, path } = splitPath(pathname);
  if (!isPublicPath(path)) return null;
  return prefixed ? 'vi' : 'en';
}

export function localePath(path, lang) {
  if (lang !== 'vi' || !isPublicPath(path)) return path;
  return path === '/' ? '/vi' : `/vi${path}`;
}
