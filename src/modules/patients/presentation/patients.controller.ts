import { type Request, type Response } from 'express';
import { Types } from 'mongoose';

import { normalizePaginationQuery } from '../../../shared/application/contracts/pagination';
import { APPLICATION_ERROR_CODES, ApplicationError } from '../../../shared/application/errors/application-error';
import { sendCreated, sendNoContent, sendOk } from '../../../shared/presentation/http/api-response';
import { type RequestWithContext } from '../../../shared/presentation/http/request-context';
import { ensureNonEmptyPatientUpdate, type PatientService } from '../application/patient-service';
import {
  createPatientBodySchema,
  patientIdParamsSchema,
  patientsListQuerySchema,
  updatePatientBodySchema,
} from './patients.schemas';
import { getAuthenticatedDataScope } from '../../../shared/presentation/http/http-utils';

export class PatientsController {
  public constructor(private readonly patientService: PatientService) {}

  public createPatient = async (req: Request, res: Response): Promise<void> => {
    const payload = removeUndefined(createPatientBodySchema.parse(req.body));
    assertValidObjectId(payload.clinicId, 'clinicId');
    assertValidObjectId(payload.doctorId, 'doctorId');

    const created = await this.patientService.createPatient(
      payload,
      await getAuthenticatedDataScope(req),
    );
    sendCreated(res, created, this.buildMeta(req as RequestWithContext));
  };

  public getPatientById = async (req: Request, res: Response): Promise<void> => {
    const { patientId } = patientIdParamsSchema.parse(req.params);
    assertValidObjectId(patientId, 'patientId');

    const patient = await this.patientService.getPatientById(
      patientId,
      await getAuthenticatedDataScope(req),
    );
    sendOk(res, patient, this.buildMeta(req as RequestWithContext));
  };

  public listPatients = async (req: Request, res: Response): Promise<void> => {
    const query = patientsListQuerySchema.parse(req.query);
    const pagination = normalizePaginationQuery({
      ...(query.page !== undefined ? { page: query.page } : {}),
      ...(query.pageSize !== undefined ? { pageSize: query.pageSize } : {}),
    });
    const result = await this.patientService.listPatients(
      {
        scope: await getAuthenticatedDataScope(req),
        ...(query.search !== undefined ? { search: query.search } : {}),
        sortBy: query.sortBy,
        sortDirection: query.sortDirection,
        statuses: query.status,
      },
      pagination,
    );

    sendOk(res, result.items, {
      ...this.buildMeta(req as RequestWithContext),
      pagination: result.meta,
    });
  };

  public updatePatient = async (req: Request, res: Response): Promise<void> => {
    const { patientId } = patientIdParamsSchema.parse(req.params);
    assertValidObjectId(patientId, 'patientId');

    const payload = removeUndefined(updatePatientBodySchema.parse(req.body));
    ensureNonEmptyPatientUpdate(payload);
    if (payload.clinicId !== undefined) {
      assertValidObjectId(payload.clinicId, 'clinicId');
    }
    if (payload.doctorId !== undefined) {
      assertValidObjectId(payload.doctorId, 'doctorId');
    }

    const updated = await this.patientService.updatePatient(
      patientId,
      payload,
      await getAuthenticatedDataScope(req),
    );
    sendOk(res, updated, this.buildMeta(req as RequestWithContext));
  };

  public deletePatient = async (req: Request, res: Response): Promise<void> => {
    const { patientId } = patientIdParamsSchema.parse(req.params);
    assertValidObjectId(patientId, 'patientId');

    await this.patientService.deletePatient(
      patientId,
      await getAuthenticatedDataScope(req),
    );
    sendNoContent(res);
  };

  private buildMeta(req: RequestWithContext): { requestId?: string } | undefined {
    return req.context.requestId === undefined ? undefined : { requestId: req.context.requestId };
  }
}

function removeUndefined<TPayload extends Record<string, unknown>>(payload: TPayload): TPayload {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  ) as TPayload;
}

function assertValidObjectId(value: string, field: string): void {
  if (!Types.ObjectId.isValid(value)) {
    throw new ApplicationError({
      message: `${field} must be a valid identifier`,
      statusCode: 400,
      code: APPLICATION_ERROR_CODES.VALIDATION_ERROR,
      expose: true,
      details: { field },
    });
  }
}
