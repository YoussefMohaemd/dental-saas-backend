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

  it('allows direct jumps between non-identical workflow statuses', () => {
    expect(() => assertOrderStatusTransition('New', 'Production')).not.toThrow();
    expect(() => assertOrderStatusTransition('Review', 'Completed')).not.toThrow();
    expect(() => assertOrderStatusTransition('Completed', 'Production')).not.toThrow();
  });

  it('allows moving orders out of terminal statuses', () => {
    expect(() => assertOrderStatusTransition('Completed', 'Cancelled')).not.toThrow();
    expect(() => assertOrderStatusTransition('Cancelled', 'New')).not.toThrow();
  });
});
