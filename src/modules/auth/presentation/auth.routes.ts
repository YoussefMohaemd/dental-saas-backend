import { Router } from 'express';

import {
  getCurrentUserController,
  loginController,
  logoutController,
  refreshController,
  revokeSessionsController,
} from './auth.controller';
import { requireAnyRole, requireAuthenticated } from './auth.middleware';

const authRouter = Router();

authRouter.post('/auth/login', loginController);
authRouter.post('/auth/refresh', refreshController);
authRouter.post('/auth/logout', logoutController);

authRouter.get('/auth/me', requireAuthenticated, getCurrentUserController);
authRouter.post(
  '/auth/sessions/revoke',
  requireAuthenticated,
  requireAnyRole(['admin']),
  revokeSessionsController,
);

export { authRouter };
