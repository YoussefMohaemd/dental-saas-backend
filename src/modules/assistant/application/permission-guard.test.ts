import { describe, expect, it } from 'vitest';

import { PermissionGuard } from './permission-guard';

describe('PermissionGuard', () => {
  it('requires all capabilities when match mode is all', () => {
    const guard = new PermissionGuard();

    expect(
      guard.hasRequiredCapabilities(
        new Set(['orders.read', 'reports.read']),
        ['orders.read', 'reports.read'],
        'all',
      ),
    ).toBe(true);

    expect(
      guard.hasRequiredCapabilities(
        new Set(['orders.read']),
        ['orders.read', 'reports.read'],
        'all',
      ),
    ).toBe(false);
  });

  it('accepts one capability when match mode is any', () => {
    const guard = new PermissionGuard();

    expect(
      guard.hasRequiredCapabilities(
        new Set(['orders.read']),
        ['orders.read', 'reports.read'],
        'any',
      ),
    ).toBe(true);
  });
});
