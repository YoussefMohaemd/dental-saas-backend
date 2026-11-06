import type { Request, RequestHandler } from 'express';

import { env } from '../config/env';
import { logger } from '../config/logger';
import { AuthRateLimitModel } from '../shared/infrastructure/persistence/mongoose/models/auth-rate-limit.model';

const WINDOW_MS = env.AUTH_RATE_LIMIT_WINDOW_SECONDS * 1000;
const MAX_ATTEMPTS_PER_IP = env.AUTH_RATE_LIMIT_MAX_ATTEMPTS_PER_IP;
const MAX_ATTEMPTS_PER_ACCOUNT = env.AUTH_RATE_LIMIT_MAX_ATTEMPTS_PER_ACCOUNT;
const MIN_DATE = new Date(0);
const RATE_LIMIT_STORE_TIMEOUT_MS = 750;

export const authRateLimit: RequestHandler = async (req, res, next) => {
  try {
    const now = new Date();
    const resetAt = new Date(now.getTime() + WINDOW_MS);
    const ipKey = buildIpRateLimitKey(req);
    const accountKey = buildAccountRateLimitKey(req);
    const counters = await Promise.all([
      incrementRateLimitCounter(ipKey, now, resetAt),
      accountKey ? incrementRateLimitCounter(accountKey, now, resetAt) : Promise.resolve(undefined),
    ]);
    const ipCounter = counters[0];
    const accountCounter = counters[1];

    if (!ipCounter) {
      next(new Error('Failed to evaluate authentication rate limit by IP'));
      return;
    }

    const violations: Date[] = [];
    if (ipCounter.count > MAX_ATTEMPTS_PER_IP) {
      violations.push(ipCounter.resetAt);
    }

    if (accountCounter && accountCounter.count > MAX_ATTEMPTS_PER_ACCOUNT) {
      violations.push(accountCounter.resetAt);
    }

    if (violations.length > 0) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((maxDate(violations).getTime() - now.getTime()) / 1000),
      );
      res.setHeader('Retry-After', retryAfterSeconds);
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many authentication attempts. Try again later.',
        },
      });
      return;
    }

    next();
  } catch (error) {
    logger.warn(
      {
        err: error,
        ip: req.ip ?? req.socket.remoteAddress,
        route: req.originalUrl ?? req.url,
      },
      'Authentication rate-limit check failed; proceeding without enforcement',
    );
    next();
  }
};

async function incrementRateLimitCounter(
  key: string,
  now: Date,
  resetAt: Date,
): Promise<{ count: number; resetAt: Date } | null> {
  const queryPromise = AuthRateLimitModel.findOneAndUpdate(
    { key },
    [
      {
        $set: {
          key,
          resetAt: {
            $cond: [{ $gt: [{ $ifNull: ['$resetAt', MIN_DATE] }, now] }, '$resetAt', resetAt],
          },
          count: {
            $cond: [
              { $gt: [{ $ifNull: ['$resetAt', MIN_DATE] }, now] },
              { $add: [{ $ifNull: ['$count', 0] }, 1] },
              1,
            ],
          },
        },
      },
    ],
    { new: true, upsert: true },
  )
    .select({ count: 1, resetAt: 1 })
    .lean<{ count: number; resetAt: Date } | null>()
    .exec();

  return withTimeout(queryPromise, RATE_LIMIT_STORE_TIMEOUT_MS, 'Rate-limit store timeout');
}

function buildIpRateLimitKey(req: Request): string {
  const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

  return `ip:${ipAddress}`;
}

function buildAccountRateLimitKey(req: Request): string | undefined {
  const email = extractBodyString(req.body, 'email');
  if (!email) {
    return undefined;
  }

  const tenantId = extractBodyString(req.body, 'tenantId') ?? '-';
  return `account:${tenantId}|${email}`;
}

function maxDate(dates: Date[]): Date {
  if (dates.length === 0) {
    return MIN_DATE;
  }
  return dates.reduce((latest, date) => (date > latest ? date : latest), dates[0]!);
}

function extractBodyString(value: unknown, field: string): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const body = value as Record<string, unknown>;
  const raw = body[field];
  if (typeof raw !== 'string') {
    return undefined;
  }

  const normalized = raw.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}
