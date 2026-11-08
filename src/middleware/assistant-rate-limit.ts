import type { RequestHandler } from 'express';

import { logger } from '../config/logger';
import { AuthRateLimitModel } from '../shared/infrastructure/persistence/mongoose/models/auth-rate-limit.model';
import { type RequestWithContext } from '../shared/presentation/http/request-context';

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_IP = 60;
const MAX_REQUESTS_PER_USER = 120;
const MIN_DATE = new Date(0);

export const assistantRateLimit: RequestHandler = async (req, res, next) => {
  try {
    const now = new Date();
    const resetAt = new Date(now.getTime() + WINDOW_MS);
    const ipKey = buildIpKey(req);
    const userKey = buildUserKey(req);

    const [ipCounter, userCounter] = await Promise.all([
      incrementRateLimitCounter(ipKey, now, resetAt),
      userKey ? incrementRateLimitCounter(userKey, now, resetAt) : Promise.resolve(undefined),
    ]);

    if (!ipCounter) {
      next(new Error('Failed to evaluate assistant rate limit by IP'));
      return;
    }

    const exceeded =
      ipCounter.count > MAX_REQUESTS_PER_IP ||
      (userCounter !== undefined &&
        userCounter !== null &&
        userCounter.count > MAX_REQUESTS_PER_USER);
    if (!exceeded) {
      next();
      return;
    }

    const retryAfterDate =
      userCounter &&
      userCounter.count > MAX_REQUESTS_PER_USER &&
      userCounter.resetAt > ipCounter.resetAt
        ? userCounter.resetAt
        : ipCounter.resetAt;
    const retryAfterSeconds = Math.max(1, Math.ceil((retryAfterDate.getTime() - now.getTime()) / 1000));

    res.setHeader('Retry-After', retryAfterSeconds);
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many assistant requests. Try again shortly.',
      },
    });
  } catch (error) {
    logger.warn(
      {
        err: error,
        ip: req.ip ?? req.socket.remoteAddress,
        route: req.originalUrl ?? req.url,
      },
      'Assistant rate-limit check failed; proceeding without enforcement',
    );
    next();
  }
};

async function incrementRateLimitCounter(
  key: string,
  now: Date,
  resetAt: Date,
): Promise<{ count: number; resetAt: Date } | null> {
  const result = await AuthRateLimitModel.findOneAndUpdate(
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

  return result;
}

function buildIpKey(req: Parameters<RequestHandler>[0]): string {
  const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
  return `assistant:ip:${ipAddress}`;
}

function buildUserKey(req: Parameters<RequestHandler>[0]): string | undefined {
  const requestWithContext = req as RequestWithContext;
  const principal = requestWithContext.context?.principal;
  if (!principal) {
    return undefined;
  }

  return `assistant:user:${principal.tenantId}:${principal.userId}`;
}
