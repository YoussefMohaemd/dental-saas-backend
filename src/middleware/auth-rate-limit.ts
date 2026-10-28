import type { Request, RequestHandler } from 'express';

import { env } from '../config/env';
import { AuthRateLimitModel } from '../shared/infrastructure/persistence/mongoose/models/auth-rate-limit.model';

const WINDOW_MS = env.AUTH_RATE_LIMIT_WINDOW_SECONDS * 1000;
const MAX_ATTEMPTS = env.AUTH_RATE_LIMIT_MAX_ATTEMPTS;
const MIN_DATE = new Date(0);

export const authRateLimit: RequestHandler = async (req, res, next) => {
  try {
    const now = new Date();
    const resetAt = new Date(now.getTime() + WINDOW_MS);
    const key = buildRateLimitKey(req);

    const current = await AuthRateLimitModel.findOneAndUpdate(
      { key },
      [
        {
          $set: {
            key,
            resetAt: {
              $cond: [
                { $gt: [{ $ifNull: ['$resetAt', MIN_DATE] }, now] },
                '$resetAt',
                resetAt,
              ],
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

    if (!current) {
      next(new Error('Failed to evaluate authentication rate limit'));
      return;
    }

    if (current.count > MAX_ATTEMPTS) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((new Date(current.resetAt).getTime() - now.getTime()) / 1000),
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
    next(error);
  }
};

function buildRateLimitKey(req: Request): string {
  const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
  const tenantId = extractBodyString(req.body, 'tenantId') ?? '-';
  const email = extractBodyString(req.body, 'email') ?? '-';

  return `${ipAddress}|${tenantId}|${email}`;
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
