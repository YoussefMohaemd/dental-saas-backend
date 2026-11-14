import { describe, expect, it } from 'vitest';

import { verifyReply } from './response-verifier';

describe('verifyReply', () => {
  it('marks a price present in trusted execution data as verified', () => {
    const result = verifyReply({
      replyText: 'Crown costs 450',
      executions: [
        {
          actionId: 'a1',
          tool: 'list_service_prices',
          status: 'executed',
          result: { services: [{ name: 'Crown', basePrice: 450 }] },
        },
      ],
    });

    expect(result).toEqual({ status: 'verified', issues: [] });
  });

  it('reports a reply price that is absent from trusted execution data', () => {
    const result = verifyReply({
      replyText: 'Crown costs 400',
      executions: [
        {
          actionId: 'a1',
          tool: 'list_service_prices',
          status: 'executed',
          result: { services: [{ name: 'Crown', basePrice: 450 }] },
        },
      ],
    });

    expect(result.status).toBe('warnings');
    expect(result.issues).toContainEqual({ kind: 'unknown_price', value: '400' });
  });

  it('reports an identifier that is absent from trusted execution data', () => {
    const result = verifyReply({
      replyText: 'Order 507f1f77bcf86cd799439011 is ready',
      executions: [
        {
          actionId: 'a1',
          tool: 'search_orders',
          status: 'executed',
          result: { items: [{ id: '507f1f77bcf86cd799439012' }] },
        },
      ],
    });

    expect(result.status).toBe('warnings');
    expect(result.issues).toContainEqual({
      kind: 'unknown_id',
      value: '507f1f77bcf86cd799439011',
    });
  });
});
