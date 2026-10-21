import { type Request, type Response } from 'express';
import { Types } from 'mongoose';

import { type ClinicService } from '../application/clinic-service';
import { clinicsListQuerySchema, clinicIdParamsSchema, createClinicBodySchema, updateClinicBodySchema } from './clinics.schemas';
import { sendCreated, sendNoContent, sendOk } from '../../../shared/presentation/http/api-response';
import { type RequestWithContext } from '../../../shared/presentation/http/request-context';
import { APPLICATION_ERROR_CODES, ApplicationError } from '../../../shared/application/errors/application-error';
import { ensureNonEmptyUpdate } from '../application/clinic-service';
import { normalizePaginationQuery } from '../../../shared/application/contracts/pagination';
import { getAuthenticatedDataScope } from '../../../shared/presentation/http/http-utils';

export class ClinicsController {
  public constructor(private readonly clinicService: ClinicService) {}

  public createClinic = async (req: Request, res: Response): Promise<void> => {
    const payload = createClinicBodySchema.parse(req.body);
    const created = await this.clinicService.createClinic(payload);
    sendCreated(res, created, this.buildMeta(req as RequestWithContext));
  };

  public getClinicById = async (req: Request, res: Response): Promise<void> => {
    const { clinicId } = clinicIdParamsSchema.parse(req.params);
    assertValidObjectId(clinicId, 'clinicId');

    const clinic = await this.clinicService.getClinicById(
      clinicId,
      await getAuthenticatedDataScope(req),
    );
    sendOk(res, clinic, this.buildMeta(req as RequestWithContext));
  };

  public listClinics = async (req: Request, res: Response): Promise<void> => {
    const query = clinicsListQuerySchema.parse(req.query);
    const pagination = normalizePaginationQuery({
      ...(query.page !== undefined ? { page: query.page } : {}),
      ...(query.pageSize !== undefined ? { pageSize: query.pageSize } : {}),
    });
    const result = await this.clinicService.listClinics(
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

  public updateClinic = async (req: Request, res: Response): Promise<void> => {
    const { clinicId } = clinicIdParamsSchema.parse(req.params);
    assertValidObjectId(clinicId, 'clinicId');

    const payload = removeUndefined(updateClinicBodySchema.parse(req.body));
    ensureNonEmptyUpdate(payload);
    const updated = await this.clinicService.updateClinic(
      clinicId,
      payload,
      await getAuthenticatedDataScope(req),
    );
    sendOk(res, updated, this.buildMeta(req as RequestWithContext));
  };

  public deleteClinic = async (req: Request, res: Response): Promise<void> => {
    const { clinicId } = clinicIdParamsSchema.parse(req.params);
    assertValidObjectId(clinicId, 'clinicId');

    await this.clinicService.deleteClinic(
      clinicId,
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
