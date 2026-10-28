import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { APPLICATION_ERROR_CODES } from '../../../shared/application/errors/application-error';
import { createCase } from './cases-service';

describe('createCase scope checks', () => {
  it('rejects doctor-scoped case creation for a different doctor profile', async () => {
    await expect(
      createCase({
        caseNumber: 'CASE-001',
        title: 'Single crown',
        patientId: new Types.ObjectId('66f200000000000000000001').toString(),
        doctorId: new Types.ObjectId('66f200000000000000000002').toString(),
        clinicId: new Types.ObjectId('66f200000000000000000003').toString(),
        status: 'Open',
        priority: 'Normal',
        notes: '',
        tenantId: new Types.ObjectId('66f200000000000000000010'),
        scope: {
          tenantId: new Types.ObjectId('66f200000000000000000010'),
          userId: new Types.ObjectId('66f200000000000000000011'),
          doctorId: new Types.ObjectId('66f200000000000000000012'),
          clinicId: new Types.ObjectId('66f200000000000000000003'),
          isAdmin: false,
          isDoctor: true,
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: APPLICATION_ERROR_CODES.FORBIDDEN,
      message: 'Doctors can only create cases for their own profile',
    });
  });

  it('rejects case creation outside the authenticated clinic scope', async () => {
    await expect(
      createCase({
        caseNumber: 'CASE-002',
        title: 'Implant planning',
        patientId: new Types.ObjectId('66f200000000000000000021').toString(),
        doctorId: new Types.ObjectId('66f200000000000000000022').toString(),
        clinicId: new Types.ObjectId('66f200000000000000000023').toString(),
        status: 'Open',
        priority: 'Normal',
        notes: '',
        tenantId: new Types.ObjectId('66f200000000000000000030'),
        scope: {
          tenantId: new Types.ObjectId('66f200000000000000000030'),
          userId: new Types.ObjectId('66f200000000000000000031'),
          clinicId: new Types.ObjectId('66f200000000000000000099'),
          isAdmin: false,
          isTechnician: true,
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: APPLICATION_ERROR_CODES.FORBIDDEN,
      message: 'Case clinic must match the authenticated clinic scope',
    });
  });
});
