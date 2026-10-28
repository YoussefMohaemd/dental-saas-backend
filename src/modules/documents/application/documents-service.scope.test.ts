import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { APPLICATION_ERROR_CODES } from '../../../shared/application/errors/application-error';
import { ClinicModel } from '../../../shared/infrastructure/persistence/mongoose/models/clinic.model';
import { DoctorModel } from '../../../shared/infrastructure/persistence/mongoose/models/doctor.model';
import { OrderModel } from '../../../shared/infrastructure/persistence/mongoose/models/order.model';
import { PatientModel } from '../../../shared/infrastructure/persistence/mongoose/models/patient.model';
import { SubOrderModel } from '../../../shared/infrastructure/persistence/mongoose/models/sub-order.model';
import { UserModel } from '../../../shared/infrastructure/persistence/mongoose/models/user.model';
import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';
import { createDocument } from './documents-service';

describe('createDocument scoped references', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects patient references outside the authenticated doctor scope', async () => {
    const scope = createDoctorScope();
    const doctorId = scope.doctorId as Types.ObjectId;
    const clinicId = scope.clinicId as Types.ObjectId;

    vi.spyOn(DoctorModel, 'findOne').mockReturnValue(
      createFindOneChain<{ _id: Types.ObjectId; clinicId: Types.ObjectId } | null, ReturnType<typeof DoctorModel.findOne>>({
        _id: doctorId,
        clinicId,
      }),
    );
    vi.spyOn(PatientModel, 'findOne').mockReturnValue(
      createFindOneChain<{ _id: Types.ObjectId; doctorId: Types.ObjectId; clinicId: Types.ObjectId } | null, ReturnType<typeof PatientModel.findOne>>(null),
    );
    vi.spyOn(ClinicModel, 'findOne').mockReturnValue(
      createFindOneChain<{ _id: Types.ObjectId } | null, ReturnType<typeof ClinicModel.findOne>>({ _id: clinicId }),
    );
    vi.spyOn(UserModel, 'exists').mockReturnValue(
      createExecChain<{ _id: Types.ObjectId } | null, ReturnType<typeof UserModel.exists>>({
        _id: scope.userId,
      }),
    );

    await expect(
      createDocument(
        {
          ...createPayload(),
          patientId: '66f100000000000000000210',
        },
        scope,
      ),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      message: 'Document references must belong to the authenticated tenant and access scope',
    });
  });

  it('rejects a sub-order reference that is not linked to the selected order', async () => {
    const scope = createAdminScope();
    const selectedOrderId = new Types.ObjectId('66f100000000000000000301');
    const mismatchedOrderId = new Types.ObjectId('66f100000000000000000302');

    const orderFindOne = vi.spyOn(OrderModel, 'findOne');
    orderFindOne
      .mockReturnValueOnce(
        createFindOneChain<
          { _id: Types.ObjectId; patientId: Types.ObjectId; doctorId: Types.ObjectId; clinicId: Types.ObjectId } | null,
          ReturnType<typeof OrderModel.findOne>
        >({
          _id: selectedOrderId,
          patientId: new Types.ObjectId('66f100000000000000000401'),
          doctorId: new Types.ObjectId('66f100000000000000000402'),
          clinicId: new Types.ObjectId('66f100000000000000000403'),
        }),
      )
      .mockReturnValueOnce(
        createFindOneChain<{ _id: Types.ObjectId } | null, ReturnType<typeof OrderModel.findOne>>({
          _id: mismatchedOrderId,
        }),
      );

    vi.spyOn(SubOrderModel, 'findOne').mockReturnValue(
      createFindOneChain<{ _id: Types.ObjectId; orderId: Types.ObjectId } | null, ReturnType<typeof SubOrderModel.findOne>>({
        _id: new Types.ObjectId('66f100000000000000000501'),
        orderId: mismatchedOrderId,
      }),
    );
    vi.spyOn(UserModel, 'exists').mockReturnValue(
      createExecChain<{ _id: Types.ObjectId } | null, ReturnType<typeof UserModel.exists>>({
        _id: scope.userId,
      }),
    );

    await expect(
      createDocument(
        {
          ...createPayload(),
          orderId: selectedOrderId.toString(),
          subOrderId: '66f100000000000000000501',
        },
        scope,
      ),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      message: 'Document sub-order must belong to the selected order',
    });
  });
});

function createPayload() {
  return {
    name: 'scan-a.stl',
    category: 'Scan Files' as const,
    type: 'model/stl',
    sizeBytes: 1024,
  };
}

function createDoctorScope(): DataVisibilityScope {
  return {
    tenantId: new Types.ObjectId('66f100000000000000000201'),
    userId: new Types.ObjectId('66f100000000000000000202'),
    doctorId: new Types.ObjectId('66f100000000000000000203'),
    clinicId: new Types.ObjectId('66f100000000000000000204'),
    isAdmin: false,
    isDoctor: true,
  };
}

function createAdminScope(): DataVisibilityScope {
  return {
    tenantId: new Types.ObjectId('66f100000000000000000205'),
    userId: new Types.ObjectId('66f100000000000000000206'),
    isAdmin: true,
  };
}

function createFindOneChain<TResult, TQuery>(result: TResult): TQuery {
  return {
    select: () => ({
      lean: () => ({
        exec: () => Promise.resolve(result),
      }),
    }),
  } as unknown as TQuery;
}

function createExecChain<TResult, TQuery>(result: TResult): TQuery {
  return {
    exec: () => Promise.resolve(result),
  } as unknown as TQuery;
}
