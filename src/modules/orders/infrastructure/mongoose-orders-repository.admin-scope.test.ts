import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { clinicFindOneMock, doctorFindOneMock, patientFindOneMock } = vi.hoisted(() => ({
  clinicFindOneMock: vi.fn(),
  doctorFindOneMock: vi.fn(),
  patientFindOneMock: vi.fn(),
}));

vi.mock('../../../shared/infrastructure/persistence/mongoose/models/clinic.model', () => ({
  ClinicModel: {
    findOne: clinicFindOneMock,
  },
}));

vi.mock('../../../shared/infrastructure/persistence/mongoose/models/doctor.model', () => ({
  DoctorModel: {
    findOne: doctorFindOneMock,
  },
}));

vi.mock('../../../shared/infrastructure/persistence/mongoose/models/patient.model', () => ({
  PatientModel: {
    findOne: patientFindOneMock,
  },
}));

import { type DataVisibilityScope } from '../../../shared/application/contracts/data-scope';
import { MongooseOrdersRepository } from './mongoose-orders-repository';

const tenantId = new Types.ObjectId('66f100000000000000000001');
const adminClinicId = new Types.ObjectId('06e17f57cf52f959baefcc50');
const targetClinicId = 'f5d9afd005f77d5531ffefe5';
const targetDoctorId = 'f14520aef48bb3bc9ab3ff59';
const targetPatientId = '6aef72c18dc3b190f0f5048d';

describe('MongooseOrdersRepository admin visibility scope', () => {
  it('allows admin clinicExists checks outside user.clinicId scope', async () => {
    const repository = new MongooseOrdersRepository();

    const exists = await repository.clinicExists(targetClinicId, adminScope());

    expect(exists).toBe(true);
    expect(clinicFindOneMock).toHaveBeenCalledWith({
      _id: targetClinicId,
      tenantId,
    });
  });

  it('does not constrain findDoctorById by scope.clinicId for admin', async () => {
    const repository = new MongooseOrdersRepository();

    const doctor = await repository.findDoctorById(targetDoctorId, adminScope());

    expect(doctorFindOneMock).toHaveBeenCalledWith({
      _id: targetDoctorId,
      tenantId,
    });
    expect(doctor).toMatchObject({
      id: targetDoctorId,
      clinicId: targetClinicId,
    });
  });

  it('does not constrain findPatientById by scope.clinicId for admin', async () => {
    const repository = new MongooseOrdersRepository();

    const patient = await repository.findPatientById(targetPatientId, adminScope());

    expect(patientFindOneMock).toHaveBeenCalledWith({
      _id: targetPatientId,
      tenantId,
    });
    expect(patient).toMatchObject({
      id: targetPatientId,
      clinicId: targetClinicId,
      doctorId: targetDoctorId,
    });
  });
});

function adminScope(): DataVisibilityScope {
  return {
    tenantId,
    userId: new Types.ObjectId('66f100000000000000000005'),
    clinicId: adminClinicId,
    isAdmin: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  clinicFindOneMock.mockImplementation(() => ({
    select: () => ({
      lean: () => ({
        exec: () => Promise.resolve({ _id: new Types.ObjectId(targetClinicId) }),
      }),
    }),
  }));

  doctorFindOneMock.mockImplementation(() => ({
    select: () => ({
      lean: () => ({
        exec: () =>
          Promise.resolve({
            _id: new Types.ObjectId(targetDoctorId),
            name: 'Dr. Admin Scope',
            clinicId: new Types.ObjectId(targetClinicId),
          }),
      }),
    }),
  }));

  patientFindOneMock.mockImplementation(() => ({
    select: () => ({
      lean: () => ({
        exec: () =>
          Promise.resolve({
            _id: new Types.ObjectId(targetPatientId),
            name: 'Patient Admin Scope',
            doctorId: new Types.ObjectId(targetDoctorId),
            clinicId: new Types.ObjectId(targetClinicId),
          }),
      }),
    }),
  }));
});
