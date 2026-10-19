import { type Request, type Response } from 'express';
import { Types } from 'mongoose';

import { normalizePaginationQuery } from '../../../shared/application/contracts/pagination';
import { APPLICATION_ERROR_CODES, ApplicationError } from '../../../shared/application/errors/application-error';
import { sendCreated, sendOk } from '../../../shared/presentation/http/api-response';
import { hasAuthenticatedPrincipal, type RequestWithContext } from '../../../shared/presentation/http/request-context';
import { type UserService } from '../application/user-service';
import {
  createUserBodySchema,
  updateUserRoleStatusBodySchema,
  userIdParamsSchema,
  usersListQuerySchema,
} from './users.schemas';

export class UsersController {
  public constructor(private readonly userService: UserService) {}

  public listUsers = async (req: Request, res: Response): Promise<void> => {
    const principal = this.getPrincipal(req as RequestWithContext);
    const query = usersListQuerySchema.parse(req.query);

    const pagination = normalizePaginationQuery({
      ...(query.page !== undefined ? { page: query.page } : {}),
      ...(query.pageSize !== undefined ? { pageSize: query.pageSize } : {}),
    });

    const result = await this.userService.listUsers(
      principal.tenantId,
      {
        ...(query.search !== undefined ? { search: query.search } : {}),
        sortBy: query.sortBy,
        sortDirection: query.sortDirection,
        statuses: query.status,
        ...(query.role !== undefined ? { role: query.role } : {}),
      },
      pagination,
    );

    sendOk(res, result.items, {
      ...this.buildMeta(req as RequestWithContext),
      pagination: result.meta,
    });
  };

  public getUserById = async (req: Request, res: Response): Promise<void> => {
    const principal = this.getPrincipal(req as RequestWithContext);
    const { userId } = userIdParamsSchema.parse(req.params);
    assertValidObjectId(userId, 'userId');

    const user = await this.userService.getUserById(principal.tenantId, userId);
    sendOk(res, user, this.buildMeta(req as RequestWithContext));
  };

  public createUser = async (req: Request, res: Response): Promise<void> => {
    const principal = this.getPrincipal(req as RequestWithContext);
    const payload = createUserBodySchema.parse(req.body);
    if (payload.clinicId !== undefined) {
      assertValidObjectId(payload.clinicId, 'clinicId');
    }

    const created = await this.userService.createUser(principal.tenantId, payload);
    sendCreated(res, created, this.buildMeta(req as RequestWithContext));
  };

  public updateUserRoleStatus = async (req: Request, res: Response): Promise<void> => {
    const principal = this.getPrincipal(req as RequestWithContext);
    const { userId } = userIdParamsSchema.parse(req.params);
    assertValidObjectId(userId, 'userId');

    const payload = updateUserRoleStatusBodySchema.parse(req.body);
    const updated = await this.userService.updateUserRoleStatus(
      principal.tenantId,
      userId,
      payload,
      principal.userId,
    );

    sendOk(res, updated, this.buildMeta(req as RequestWithContext));
  };

  public deactivateUser = async (req: Request, res: Response): Promise<void> => {
    const principal = this.getPrincipal(req as RequestWithContext);
    const { userId } = userIdParamsSchema.parse(req.params);
    assertValidObjectId(userId, 'userId');

    const updated = await this.userService.deactivateUser(principal.tenantId, userId, principal.userId);
    sendOk(res, updated, this.buildMeta(req as RequestWithContext));
  };

  public reactivateUser = async (req: Request, res: Response): Promise<void> => {
    const principal = this.getPrincipal(req as RequestWithContext);
    const { userId } = userIdParamsSchema.parse(req.params);
    assertValidObjectId(userId, 'userId');

    const updated = await this.userService.reactivateUser(principal.tenantId, userId);
    sendOk(res, updated, this.buildMeta(req as RequestWithContext));
  };

  private getPrincipal(req: RequestWithContext): NonNullable<RequestWithContext['context']['principal']> {
    if (!hasAuthenticatedPrincipal(req)) {
      throw new ApplicationError({
        message: 'Authentication is required',
        statusCode: 401,
        code: APPLICATION_ERROR_CODES.UNAUTHORIZED,
        expose: true,
      });
    }

    return req.context.principal;
  }

  private buildMeta(req: RequestWithContext): { requestId?: string } | undefined {
    return req.context.requestId === undefined ? undefined : { requestId: req.context.requestId };
  }
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
