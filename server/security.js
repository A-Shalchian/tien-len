import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

export const SLOW_DOWN = 'Too many requests. Try again in a minute.';

const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:3001'];
const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), payment=(), usb=()';

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
  const headers = helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", 'data:'],
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
  const permissions = (req, res, next) => {
    res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
    next();
  };
  return [headers, permissions];
}

export function clientIp(headers, fallback) {
  const cf = headers['cf-connecting-ip'];
  return typeof cf === 'string' && cf ? cf : fallback || 'unknown';
}

function limiter(limit) {
  return rateLimit({
    windowMs: 60000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => clientIp(req.headers, req.ip),
    message: { error: SLOW_DOWN },
    validate: false,
  });
}

export const authLimiter = limiter(30);
export const inviteLimiter = limiter(10);
export const apiLimiter = limiter(300);
