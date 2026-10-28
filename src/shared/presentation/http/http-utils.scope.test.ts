import type { Request } from 'express';
import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { APPLICATION_ERROR_CODES } from '../../application/errors/application-error';
import { DoctorModel } from '../../infrastructure/persistence/mongoose/models/doctor.model';
import { UserModel } from '../../infrastructure/persistence/mongoose/models/user.model';
import { getAuthenticatedDataScope } from './http-utils';

describe('getAuthenticatedDataScope', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns doctor scope only when an active doctor profile exists', async () => {
    const doctorId = new Types.ObjectId('66f100000000000000000111');
    const clinicId = new Types.ObjectId('66f100000000000000000112');

    vi.spyOn(UserModel, 'findOne').mockReturnValue(
      createFindOneChain<{ email?: string; clinicId?: Types.ObjectId } | null, ReturnType<typeof UserModel.findOne>>(
        { email: 'doctor@example.test' },
      ),
    );
    const doctorFindOne = vi.spyOn(DoctorModel, 'findOne').mockReturnValue(
      createFindOneChain<
        { _id: Types.ObjectId; clinicId: Types.ObjectId; status: 'Active' | 'Inactive' } | null,
        ReturnType<typeof DoctorModel.findOne>
      >({
        _id: doctorId,
        clinicId,
        status: 'Active',
      }),
    );

    const scope = await getAuthenticatedDataScope(createRequest(['doctor']));

    expect(scope.doctorId?.toString()).toBe(doctorId.toString());
    expect(scope.clinicId?.toString()).toBe(clinicId.toString());
    expect(scope.isDoctor).toBe(true);
    const doctorQuery = doctorFindOne.mock.calls[0]?.[0] as
      | { email?: string; status?: string }
      | undefined;
    expect(doctorQuery?.email).toBe('doctor@example.test');
    expect(doctorQuery?.status).toBe('Active');
  });

  it('rejects doctor access when no active doctor profile is linked', async () => {
    vi.spyOn(UserModel, 'findOne').mockReturnValue(
      createFindOneChain<{ email?: string; clinicId?: Types.ObjectId } | null, ReturnType<typeof UserModel.findOne>>(
        { email: 'doctor@example.test' },
      ),
    );
    vi.spyOn(DoctorModel, 'findOne').mockReturnValue(
      createFindOneChain<
        { _id: Types.ObjectId; clinicId: Types.ObjectId; status: 'Active' | 'Inactive' } | null,
        ReturnType<typeof DoctorModel.findOne>
      >(null),
    );

    await expect(getAuthenticatedDataScope(createRequest(['doctor']))).rejects.toMatchObject({
      statusCode: 403,
      code: APPLICATION_ERROR_CODES.FORBIDDEN,
      message: 'Doctor role is not linked to an active doctor profile',
    });
  });

  it('rejects doctor access when the user profile has no email', async () => {
    vi.spyOn(UserModel, 'findOne').mockReturnValue(
      createFindOneChain<{ email?: string; clinicId?: Types.ObjectId } | null, ReturnType<typeof UserModel.findOne>>(
        { clinicId: new Types.ObjectId('66f100000000000000000113') },
      ),
    );
    const doctorFindOne = vi.spyOn(DoctorModel, 'findOne');

    await expect(getAuthenticatedDataScope(createRequest(['doctor']))).rejects.toMatchObject({
      statusCode: 403,
      code: APPLICATION_ERROR_CODES.FORBIDDEN,
      message: 'Doctor role is not linked to an active doctor profile',
    });
    expect(doctorFindOne).not.toHaveBeenCalled();
  });
});

function createFindOneChain<TResult, TQuery>(result: TResult): TQuery {
  return {
    select: () => ({
      lean: () => ({
        exec: () => Promise.resolve(result),
      }),
    }),
  } as unknown as TQuery;
}

function createRequest(roles: string[]): Request {
  return {
    context: {
      requestId: undefined,
      principal: {
        tenantId: '66f100000000000000000001',
        userId: '66f100000000000000000002',
        roles,
      },
    },
  } as unknown as Request;
}
