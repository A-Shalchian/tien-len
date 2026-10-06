import helmet from 'helmet';

const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:3001'];

function siteOrigin() {
  const base = process.env.BETTER_AUTH_URL?.trim();
  try {
    return base ? new URL(base).origin : null;
  } catch {
    return null;
  }
}

export function allowedOrigins() {
  const origins = [siteOrigin(), ...(process.env.NODE_ENV === 'production' ? [] : DEV_ORIGINS)];
  return [...new Set(origins.filter(Boolean))];
}

export function isAllowedOrigin(origin) {
  return !origin || allowedOrigins().includes(origin);
}

export function securityHeaders() {
  const origin = siteOrigin();
  const secure = origin?.startsWith('https://');
  const socketOrigin = origin ? origin.replace(/^http/, 'ws') : null;
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://lh3.googleusercontent.com'],
        connectSrc: ["'self'", ...(socketOrigin ? [socketOrigin] : [])],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        ...(secure ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    strictTransportSecurity: secure ? { maxAge: 31536000, includeSubDomains: true } : false,
  });
}
