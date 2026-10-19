import { Router } from 'express';
import { z } from 'zod';

import { sendOk } from '../../../shared/presentation/http/api-response';
import { buildRequestMeta } from '../../../shared/presentation/http/http-utils';
import { InMemorySettingsStore } from '../infrastructure/settings-store';

const settingsRouter = Router();
const settingsStore = new InMemorySettingsStore();

const referenceDataQuerySchema = z.object({
  include: z.string().optional(),
});

settingsRouter.get('/settings/reference-data', (req, res) => {
  const query = referenceDataQuerySchema.parse(req.query);
  const include = query.include
    ?.split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const snapshot = settingsStore.getSnapshot();

  const data = {
    scanCenters: shouldInclude(include, 'scanCenters') ? snapshot.scanCenters : undefined,
    quarterlyTargets: shouldInclude(include, 'quarterlyTargets') ? snapshot.quarterlyTargets : undefined,
    teamMembers: shouldInclude(include, 'teamMembers') ? snapshot.teamMembers : undefined,
  };

  sendOk(res, data, buildRequestMeta(req));
});

function shouldInclude(selected: string[] | undefined, section: string): boolean {
  if (!selected || selected.length === 0) {
    return true;
  }

  return selected.includes(section);
}

export { settingsRouter };
