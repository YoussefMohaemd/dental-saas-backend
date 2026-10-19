import { describe, expect, it } from 'vitest';

import { DOMAIN_ERROR_CODES, DomainError } from '../../../shared/domain/errors/domain-error';
import { assertOrderStatusTransition } from './order-workflow';

describe('order workflow transitions', () => {
  it('allows linear workflow transitions', () => {
    expect(() => assertOrderStatusTransition('New', 'Review')).not.toThrow();
    expect(() => assertOrderStatusTransition('Review', 'Design')).not.toThrow();
    expect(() => assertOrderStatusTransition('Design', 'Production')).not.toThrow();
    expect(() => assertOrderStatusTransition('Production', 'Quality Check')).not.toThrow();
    expect(() => assertOrderStatusTransition('Quality Check', 'Ready')).not.toThrow();
    expect(() => assertOrderStatusTransition('Ready', 'Completed')).not.toThrow();
  });

  it('allows cancelling from non-terminal statuses', () => {
    expect(() => assertOrderStatusTransition('New', 'Cancelled')).not.toThrow();
    expect(() => assertOrderStatusTransition('Review', 'Cancelled')).not.toThrow();
    expect(() => assertOrderStatusTransition('Design', 'Cancelled')).not.toThrow();
    expect(() => assertOrderStatusTransition('Production', 'Cancelled')).not.toThrow();
    expect(() => assertOrderStatusTransition('Quality Check', 'Cancelled')).not.toThrow();
    expect(() => assertOrderStatusTransition('Ready', 'Cancelled')).not.toThrow();
  });

  it('rejects no-op transitions with conflict code', () => {
    try {
      assertOrderStatusTransition('Review', 'Review');
      expect.fail('Expected transition to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe(DOMAIN_ERROR_CODES.ENTITY_CONFLICT);
    }
  });

  it('rejects invalid jumps with allowed status details', () => {
    try {
      assertOrderStatusTransition('New', 'Production');
      expect.fail('Expected transition to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      const domainError = error as DomainError;
      expect(domainError.code).toBe(DOMAIN_ERROR_CODES.BUSINESS_RULE_VIOLATION);
      expect(Array.isArray(domainError.details?.allowedNextStatuses)).toBe(true);
      expect(domainError.details?.allowedNextStatuses).toContain('Review');
    }
  });

  it('rejects transitions out of terminal statuses', () => {
    for (const [from, to] of [
      ['Completed', 'Cancelled'],
      ['Cancelled', 'New'],
    ] as const) {
      try {
        assertOrderStatusTransition(from, to);
        expect.fail(`Expected transition ${from} -> ${to} to throw`);
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe(
          DOMAIN_ERROR_CODES.BUSINESS_RULE_VIOLATION,
        );
      }
    }
  });
});
