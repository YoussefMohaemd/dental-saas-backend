import { afterEach, describe, expect, it, vi } from 'vitest';

const originalCreateToolsEnabled = process.env.AI_ASSISTANT_CREATE_TOOLS_ENABLED;

afterEach(() => {
  if (originalCreateToolsEnabled === undefined) {
    delete process.env.AI_ASSISTANT_CREATE_TOOLS_ENABLED;
  } else {
    process.env.AI_ASSISTANT_CREATE_TOOLS_ENABLED = originalCreateToolsEnabled;
  }
  vi.resetModules();
});

describe('env defaults', () => {
  it('enables assistant create tools by default when no env override is provided', async () => {
    delete process.env.AI_ASSISTANT_CREATE_TOOLS_ENABLED;

    const { env } = await import('./env');

    expect(env.AI_ASSISTANT_CREATE_TOOLS_ENABLED).toBe(true);
  });
});
