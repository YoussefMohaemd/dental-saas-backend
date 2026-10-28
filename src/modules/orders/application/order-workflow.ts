import { DOMAIN_ERROR_CODES, DomainError } from '../../../shared/domain/errors/domain-error';
import { type OrderStatus } from '../../../shared/domain/entities/dental-data-model';

export const ORDER_WORKFLOW_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  New: ['Review', 'Cancelled'],
  Review: ['Design', 'Cancelled'],
  Design: ['Production', 'Cancelled'],
  Production: ['Quality Check', 'Cancelled'],
  'Quality Check': ['Ready', 'Cancelled'],
  Ready: ['Completed', 'Cancelled'],
  Completed: [],
  Cancelled: [],
};

export function assertOrderStatusTransition(fromStatus: OrderStatus, toStatus: OrderStatus): void {
  if (fromStatus === toStatus) {
    throw new DomainError(
      `Order is already in '${fromStatus}' status`,
      DOMAIN_ERROR_CODES.ENTITY_CONFLICT,
      {
        currentStatus: fromStatus,
        requestedStatus: toStatus,
      },
    );
  }

  const allowedStatuses = ORDER_WORKFLOW_TRANSITIONS[fromStatus] ?? [];
  if (allowedStatuses.includes(toStatus)) {
    return;
  }

  throw new DomainError(
    `Cannot transition order status from '${fromStatus}' to '${toStatus}'. Allowed next statuses: ${
      allowedStatuses.length > 0 ? allowedStatuses.join(', ') : 'none (terminal status)'
    }`,
    DOMAIN_ERROR_CODES.BUSINESS_RULE_VIOLATION,
    {
      currentStatus: fromStatus,
      requestedStatus: toStatus,
      allowedNextStatuses: allowedStatuses,
    },
  );
}
