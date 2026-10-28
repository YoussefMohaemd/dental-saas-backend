import { describe, expect, it } from 'vitest';

import { ORDER_STATUSES } from '../../../shared/domain/entities/dental-data-model';
import { DOMAIN_ERROR_CODES, DomainError } from '../../../shared/domain/errors/domain-error';
import { ORDER_WORKFLOW_TRANSITIONS, assertOrderStatusTransition } from './order-workflow';

describe('order workflow transitions', () => {
  it('allows the documented linear workflow transitions', () => {
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

  it('rejects undocumented jumps with business rule violation', () => {
    expect(() => assertOrderStatusTransition('New', 'Completed')).toThrowError(DomainError);
    expect(() => assertOrderStatusTransition('New', 'Quality Check')).toThrowError(DomainError);
    expect(() => assertOrderStatusTransition('Completed', 'New')).toThrowError(DomainError);
    expect(() => assertOrderStatusTransition('Quality Check', 'Design')).toThrowError(DomainError);

    try {
      assertOrderStatusTransition('New', 'Completed');
      expect.fail('Expected transition to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe(DOMAIN_ERROR_CODES.BUSINESS_RULE_VIOLATION);
      expect((error as DomainError).details).toMatchObject({
        currentStatus: 'New',
        requestedStatus: 'Completed',
        allowedNextStatuses: ['Review', 'Cancelled'],
      });
    }
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

  it('treats Completed and Cancelled as terminal statuses', () => {
    for (const terminalStatus of ['Completed', 'Cancelled'] as const) {
      for (const target of ORDER_STATUSES) {
        if (target === terminalStatus) {
          continue;
        }

        expect(() => assertOrderStatusTransition(terminalStatus, target)).toThrowError(
          new RegExp(`Allowed next statuses: none \\(terminal status\\)`),
        );
      }
    }
  });

  it('exposes a transition matrix keyed by exactly the documented statuses', () => {
    expect(Object.keys(ORDER_WORKFLOW_TRANSITIONS).sort()).toEqual([...ORDER_STATUSES].sort());

    for (const workflowStatus of [
      'New',
      'Review',
      'Design',
      'Production',
      'Quality Check',
      'Ready',
      'Completed',
    ] as const) {
      expect(Object.keys(ORDER_WORKFLOW_TRANSITIONS)).toContain(workflowStatus);
    }
  });

  it('exposes transition values within the documented status set', () => {
    for (const [fromStatus, nextStatuses] of Object.entries(ORDER_WORKFLOW_TRANSITIONS)) {
      for (const nextStatus of nextStatuses) {
        expect(ORDER_STATUSES).toContain(nextStatus);
        expect(nextStatus).not.toBe(fromStatus);
      }
    }
  });
});
