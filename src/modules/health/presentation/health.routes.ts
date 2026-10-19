import { Router } from 'express';

import { getHealthController } from './health.controller';

const healthRouter = Router();

healthRouter.get('/health', getHealthController);

export { healthRouter };
