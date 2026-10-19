import { Router } from 'express';

import { requireAnyRole, requireAuthenticated } from '../../auth/presentation/auth.middleware';
import { UserService } from '../application/user-service';
import { MongooseUserRepository } from '../infrastructure/mongoose-user-repository';
import { UsersController } from './users.controller';

const usersRouter = Router();

const usersController = new UsersController(
  new UserService(new MongooseUserRepository()),
);

usersRouter.get('/users', requireAuthenticated, usersController.listUsers);
usersRouter.get('/users/:userId', requireAuthenticated, usersController.getUserById);
usersRouter.post('/users', requireAuthenticated, requireAnyRole(['admin']), usersController.createUser);
usersRouter.patch(
  '/users/:userId/role-status',
  requireAuthenticated,
  requireAnyRole(['admin']),
  usersController.updateUserRoleStatus,
);
usersRouter.post(
  '/users/:userId/deactivate',
  requireAuthenticated,
  requireAnyRole(['admin']),
  usersController.deactivateUser,
);
usersRouter.post(
  '/users/:userId/reactivate',
  requireAuthenticated,
  requireAnyRole(['admin']),
  usersController.reactivateUser,
);

export { usersRouter };
