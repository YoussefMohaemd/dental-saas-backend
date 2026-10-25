import { describe, expect, it } from 'vitest';

import { resolveRoleCapabilities } from './authorization-policy';

describe('resolveRoleCapabilities', () => {
  it('grants broad access to admin role', () => {
    const capabilities = resolveRoleCapabilities(['admin']);

    expect(capabilities).toContain('users.manage');
    expect(capabilities).toContain('orders.delete');
    expect(capabilities).toContain('auth.sessions.revoke');
  });

  it('normalizes role aliases and keeps manager read-only for write actions', () => {
    const capabilities = resolveRoleCapabilities(['Lab Manager']);

    expect(capabilities).toContain('orders.read');
    expect(capabilities).toContain('orders.export');
    expect(capabilities).not.toContain('orders.delete');
    expect(capabilities).not.toContain('orders.create');
  });

  it('falls back to baseline read access for unknown roles', () => {
    const capabilities = resolveRoleCapabilities(['viewer']);

    expect(capabilities).toContain('dashboard.read');
    expect(capabilities).toContain('reports.read');
    expect(capabilities).not.toContain('orders.delete');
  });
});
