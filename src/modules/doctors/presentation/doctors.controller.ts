import { type Request, type Response } from 'express';
import { Types } from 'mongoose';

import { normalizePaginationQuery } from '../../../shared/application/contracts/pagination';
import { APPLICATION_ERROR_CODES, ApplicationError } from '../../../shared/application/errors/application-error';
import { sendCreated, sendNoContent, sendOk } from '../../../shared/presentation/http/api-response';
import { type RequestWithContext } from '../../../shared/presentation/http/request-context';
import { ensureNonEmptyDoctorUpdate, type DoctorService } from '../application/doctor-service';
import { createDoctorBodySchema, doctorIdParamsSchema, doctorsListQuerySchema, updateDoctorBodySchema } from './doctors.schemas';

export class DoctorsController {
  public constructor(private readonly doctorService: DoctorService) {}

  public createDoctor = async (req: Request, res: Response): Promise<void> => {
    const payload = removeUndefined(createDoctorBodySchema.parse(req.body));
    assertValidObjectId(payload.clinicId, 'clinicId');

    const created = await this.doctorService.createDoctor(payload);
    sendCreated(res, created, this.buildMeta(req as RequestWithContext));
  };

  public getDoctorById = async (req: Request, res: Response): Promise<void> => {
    const { doctorId } = doctorIdParamsSchema.parse(req.params);
    assertValidObjectId(doctorId, 'doctorId');

    const doctor = await this.doctorService.getDoctorById(doctorId);
    sendOk(res, doctor, this.buildMeta(req as RequestWithContext));
  };

  public listDoctors = async (req: Request, res: Response): Promise<void> => {
    const query = doctorsListQuerySchema.parse(req.query);
    if (query.clinicId !== undefined) {
      assertValidObjectId(query.clinicId, 'clinicId');
    }

    const pagination = normalizePaginationQuery({
      ...(query.page !== undefined ? { page: query.page } : {}),
      ...(query.pageSize !== undefined ? { pageSize: query.pageSize } : {}),
    });
    const result = await this.doctorService.listDoctors(
      {
        ...(query.search !== undefined ? { search: query.search } : {}),
        sortBy: query.sortBy,
        sortDirection: query.sortDirection,
        statuses: query.status,
        ...(query.clinicId !== undefined ? { clinicId: query.clinicId } : {}),
      },
      pagination,
    );

    sendOk(res, result.items, {
      ...this.buildMeta(req as RequestWithContext),
      pagination: result.meta,
    });
  };

  public updateDoctor = async (req: Request, res: Response): Promise<void> => {
    const { doctorId } = doctorIdParamsSchema.parse(req.params);
    assertValidObjectId(doctorId, 'doctorId');

    const payload = removeUndefined(updateDoctorBodySchema.parse(req.body));
    ensureNonEmptyDoctorUpdate(payload);
    if (payload.clinicId !== undefined) {
      assertValidObjectId(payload.clinicId, 'clinicId');
    }

    const updated = await this.doctorService.updateDoctor(doctorId, payload);
    sendOk(res, updated, this.buildMeta(req as RequestWithContext));
  };

  public deleteDoctor = async (req: Request, res: Response): Promise<void> => {
    const { doctorId } = doctorIdParamsSchema.parse(req.params);
    assertValidObjectId(doctorId, 'doctorId');

    await this.doctorService.deleteDoctor(doctorId);
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
