import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { buildDocumentAccessFilter } from './documents-service';

describe('buildDocumentAccessFilter', () => {
  it('keeps technicians limited to their own uploads even when clinic scope exists', () => {
    const scope = {
      tenantId: new Types.ObjectId('66f300000000000000000001'),
      userId: new Types.ObjectId('66f300000000000000000002'),
      clinicId: new Types.ObjectId('66f300000000000000000003'),
      isAdmin: false,
      isTechnician: true,
    };

    const filter = buildDocumentAccessFilter(scope);

    expect(filter).toMatchObject({
      tenantId: scope.tenantId,
      uploadedBy: scope.userId,
    });
    expect(filter).not.toHaveProperty('clinicId');
  });
});
