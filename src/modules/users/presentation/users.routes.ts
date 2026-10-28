import { Router } from 'express';

import { requireAnyCapability, requireAuthenticated } from '../../auth/presentation/auth.middleware';
import { UserService } from '../application/user-service';
import { MongooseUserRepository } from '../infrastructure/mongoose-user-repository';
import { UsersController } from './users.controller';

const usersRouter = Router();

const usersController = new UsersController(
  new UserService(new MongooseUserRepository()),
);

usersRouter.get('/users', requireAuthenticated, requireAnyCapability(['users.read']), usersController.listUsers);
usersRouter.get('/users/:userId', requireAuthenticated, requireAnyCapability(['users.read']), usersController.getUserById);
usersRouter.post('/users', requireAuthenticated, requireAnyCapability(['users.manage']), usersController.createUser);
usersRouter.patch(
  '/users/:userId/role-status',
  requireAuthenticated,
  requireAnyCapability(['users.manage']),
  usersController.updateUserRoleStatus,
);
usersRouter.post(
  '/users/:userId/deactivate',
  requireAuthenticated,
  requireAnyCapability(['users.manage']),
  usersController.deactivateUser,
);
usersRouter.post(
  '/users/:userId/reactivate',
  requireAuthenticated,
  requireAnyCapability(['users.manage']),
  usersController.reactivateUser,
);

export { usersRouter };
