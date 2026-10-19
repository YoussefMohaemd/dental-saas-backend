import { type Request, type Response } from 'express';

import { sendOk } from '../../../shared/presentation/http/api-response';
import { getHealthSnapshot } from '../application/get-health-snapshot';
import { RuntimeHealthProvider } from '../infrastructure/runtime-health-provider';

const runtimeHealthProvider = new RuntimeHealthProvider();

export function getHealthController(_req: Request, res: Response): void {
  const snapshot = getHealthSnapshot(runtimeHealthProvider);
  sendOk(res, snapshot);
}
