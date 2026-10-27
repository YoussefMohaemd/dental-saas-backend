import type { RequestHandler } from 'express';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 20;
const attempts = new Map<string, { count: number; resetAt: number }>();

export const authRateLimit: RequestHandler = (req, res, next) => {
  const now = Date.now();
  const forwardedFor = req.header('x-forwarded-for');
  const forwardedIp = forwardedFor?.split(',')[0]?.trim();
  const key = forwardedIp || req.ip || req.socket.remoteAddress || 'unknown';
  const current = attempts.get(key);

  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    next();
    return;
  }

  if (current.count >= MAX_ATTEMPTS) {
    res.setHeader('Retry-After', Math.ceil((current.resetAt - now) / 1000));
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many authentication attempts. Try again later.',
      },
    });
    return;
  }

  current.count += 1;
  next();
};

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attempts) {
    if (entry.resetAt <= now) {
      attempts.delete(key);
    }
  }
}, WINDOW_MS).unref();
