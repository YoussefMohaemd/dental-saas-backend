import { describe, expect, it } from 'vitest';

import {
  assistantConfirmBodySchema,
  assistantCreateConversationBodySchema,
  assistantMessageBodySchema,
} from './assistant.schemas';

describe('assistant.schemas', () => {
  it('accepts safe conversation payload', () => {
    const parsed = assistantCreateConversationBodySchema.parse({
      title: 'Operations review',
    });

    expect(parsed.title).toBe('Operations review');
  });

  it('rejects tenant spoofing fields in request payload', () => {
    expect(() =>
      assistantMessageBodySchema.parse({
        content: 'show reports',
        tenantId: '66f100000000000000000999',
      }),
    ).toThrow();
  });

  it('requires confirmation token', () => {
    expect(() => assistantConfirmBodySchema.parse({})).toThrow();
  });

  it('rejects message content longer than service contract limit', () => {
    const content = 'a'.repeat(4_001);
    expect(() => assistantMessageBodySchema.parse({ content })).toThrow();
  });
});
