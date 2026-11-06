import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type CounterRecord = { count: number; resetAt: Date };

function createMockResponse(): Response {
  const response = {
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return response as unknown as Response;
}

function createCounterQuery(record: CounterRecord) {
  return {
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(record),
  };
}

async function loadRateLimitMiddleware(params?: {
  findOneAndUpdateImpl?: (...args: unknown[]) => unknown;
}) {
  vi.resetModules();

  const findOneAndUpdate = vi.fn(params?.findOneAndUpdateImpl);
  if (!params?.findOneAndUpdateImpl) {
    findOneAndUpdate.mockImplementation(() =>
      createCounterQuery({ count: 1, resetAt: new Date(Date.now() + 60_000) }),
    );
  }

  const loggerWarn = vi.fn();

  vi.doMock('../config/env', () => ({
    env: {
      AUTH_RATE_LIMIT_WINDOW_SECONDS: 60,
      AUTH_RATE_LIMIT_MAX_ATTEMPTS_PER_IP: 5,
      AUTH_RATE_LIMIT_MAX_ATTEMPTS_PER_ACCOUNT: 3,
    },
  }));

  vi.doMock('../config/logger', () => ({
    logger: {
      warn: loggerWarn,
    },
  }));

  vi.doMock('../shared/infrastructure/persistence/mongoose/models/auth-rate-limit.model', () => ({
    AuthRateLimitModel: {
      findOneAndUpdate,
    },
  }));

  const module = await import('./auth-rate-limit.js');
  return {
    authRateLimit: module.authRateLimit,
    findOneAndUpdate,
    loggerWarn,
  };
}

describe('authRateLimit middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies IP-based limiting even when request body has no tenant/email', async () => {
    const { authRateLimit, findOneAndUpdate } = await loadRateLimitMiddleware();
    const req = {
      body: {},
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as Request;
    const res = createMockResponse();
    const next = vi.fn();

    await authRateLimit(req, res, next);

    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    const responseView = res as unknown as { status: { mock: { calls: unknown[] } } };
    expect(responseView.status.mock.calls.length).toBe(0);
  });

  it('fails open when the rate-limit store is unavailable', async () => {
    const { authRateLimit, loggerWarn } = await loadRateLimitMiddleware({
      findOneAndUpdateImpl: () => ({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockRejectedValue(new Error('mongo down')),
      }),
    });
    const req = {
      body: {
        tenantId: '507f191e810c19729de860ea',
        email: 'dev-admin@example.test',
      },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as Request;
    const res = createMockResponse();
    const next = vi.fn();

    await authRateLimit(req, res, next);

    expect(next).toHaveBeenCalledWith();
    const responseView = res as unknown as { status: { mock: { calls: unknown[] } } };
    expect(responseView.status.mock.calls.length).toBe(0);
    expect(loggerWarn).toHaveBeenCalledTimes(1);
  });
});
