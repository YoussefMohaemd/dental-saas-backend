import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import {
  buildDecisionUpdateDocument,
  buildChangeRequestRequesterFilter,
  buildChangeRequestIdentityFilter,
  buildChangeRequestListFilter,
} from './change-requests-service';

describe('change request tenant scoping filters', () => {
  it('builds list filters with tenant isolation and escaped search', () => {
    const tenantId = new Types.ObjectId('66f100000000000000000001');

    const filter = buildChangeRequestListFilter({
      tenantId,
      statuses: ['Pending', 'In Review'],
      priorities: ['High'],
      search: 'REQ-1.*(draft)',
    });

    expect(filter.tenantId).toEqual(tenantId);
    expect(filter.status).toEqual({ $in: ['Pending', 'In Review'] });
    expect(filter.priority).toEqual({ $in: ['High'] });

    const orFilters = filter.$or as Array<{ requestNumber?: RegExp; description?: RegExp }> | undefined;
    expect(orFilters?.length).toBe(2);

    const requestRegex = orFilters?.[0]?.requestNumber;
    expect(requestRegex).toBeInstanceOf(RegExp);
    expect(requestRegex?.flags).toContain('i');
    expect('REQ-1.*(draft)').toMatch(requestRegex as RegExp);
    expect('REQ-1x(draft)').not.toMatch(requestRegex as RegExp);
  });

  it('builds identity filters with tenant scope when available', () => {
    const tenantId = new Types.ObjectId('66f100000000000000000001');
    const requestId = new Types.ObjectId('66f100000000000000000099');

    const tenantScoped = buildChangeRequestIdentityFilter(requestId, tenantId);
    expect(tenantScoped).toEqual({
      _id: requestId,
      tenantId,
    });

    const unscoped = buildChangeRequestIdentityFilter(requestId);
    expect(unscoped).toEqual({ _id: requestId });
  });

  it('does not clear resolution note when note is omitted', () => {
    const withoutNote = buildDecisionUpdateDocument({
      status: 'In Review',
    });

    expect(withoutNote).toEqual({
      $set: {
        status: 'In Review',
      },
    });

    const withNote = buildDecisionUpdateDocument({
      status: 'Rejected',
      note: 'Missing scan details',
    });

    expect(withNote).toEqual({
      $set: {
        status: 'Rejected',
        resolutionNote: 'Missing scan details',
      },
    });
  });

  it('applies requester scope for non-admin roles', () => {
    const doctorId = new Types.ObjectId('66f100000000000000000010');
    const userId = new Types.ObjectId('66f100000000000000000011');
    const clinicId = new Types.ObjectId('66f100000000000000000012');
    const tenantId = new Types.ObjectId('66f100000000000000000001');

    expect(
      buildChangeRequestRequesterFilter({
        tenantId,
        userId,
        isAdmin: true,
        roles: ['admin'],
      }),
    ).toBeUndefined();

    expect(
      buildChangeRequestRequesterFilter({
        tenantId,
        userId,
        doctorId,
        clinicId,
        isAdmin: false,
        isDoctor: true,
        roles: ['doctor'],
      }),
    ).toEqual({ requesterId: userId });

    expect(
      buildChangeRequestRequesterFilter({
        tenantId,
        userId,
        clinicId,
        isAdmin: false,
        isTechnician: true,
        roles: ['technician'],
      }),
    ).toEqual({ requesterId: userId });

    expect(
      buildChangeRequestRequesterFilter({
        tenantId,
        userId,
        clinicId,
        isAdmin: false,
        isStaff: true,
        roles: ['staff'],
      }),
    ).toEqual({ requesterId: userId });
  });
});
