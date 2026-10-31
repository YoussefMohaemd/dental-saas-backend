import { describe, expect, it } from 'vitest';

import { app } from './app';

function isRateLimitedPath(path: string): boolean {
  const layers = (app as unknown as { router?: { stack?: unknown[] } }).router?.stack ?? [];

  return layers
    .filter(
      (layer): layer is { name: string; matchers?: Array<(path: string) => unknown> } =>
        typeof layer === 'object' &&
        layer !== null &&
        'name' in layer &&
        (layer as { name?: unknown }).name === 'authRateLimit',
    )
    .some((layer) => layer.matchers?.some((match) => Boolean(match(path))) ?? false);
}

describe('auth rate-limit route registration', () => {
  it('registers auth rate-limiter for all auth mutation endpoints', () => {
    expect(isRateLimitedPath('/api/auth/login')).toBe(true);
    expect(isRateLimitedPath('/api/auth/refresh')).toBe(true);
    expect(isRateLimitedPath('/api/auth/logout')).toBe(true);
    expect(isRateLimitedPath('/api/auth/password')).toBe(true);
  });

  it('does not apply auth rate-limiter to health endpoint', () => {
    expect(isRateLimitedPath('/api/health')).toBe(false);
  });
});
