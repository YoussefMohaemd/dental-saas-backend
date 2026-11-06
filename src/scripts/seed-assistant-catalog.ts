import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import mongoose, { type Types } from 'mongoose';

import { env } from '../config/env';
import { logger } from '../config/logger';
import { AssistantCompanyProfileModel } from '../modules/assistant/infrastructure/persistence/mongoose/assistant-company-profile.model';
import { AssistantServiceCatalogModel } from '../modules/assistant/infrastructure/persistence/mongoose/assistant-service-catalog.model';
import { UserModel } from '../shared/infrastructure/persistence/mongoose/models/user.model';

/**
 * Idempotent: upserts the service catalog (and the optional company profile)
 * for every tenant. The assistant reads these collections; nothing is mocked in
 * the request path. Edit the data in MongoDB (or this file) and re-run.
 *
 *   npm run seed:assistant-catalog
 *
 * Company profile: copy scripts/company-profile.example.json to
 * scripts/company-profile.json, fill in the real values and re-run.
 */
const SERVICES = [
  {
    "serviceId": "treatment-plan",
    "name": "Treatment Plan",
    "description": "Comprehensive treatment planning with diagnostic data and clinical workflow.",
    "basePrice": 250,
    "turnaroundDays": 5,
    "scanRequirements": [
      "Full arch STL",
      "Bite registration"
    ],
    "sortOrder": 0
  },
  {
    "serviceId": "surgical-guide",
    "name": "Surgical Guide",
    "description": "Precision-guided implant surgery using CT and digital planning.",
    "basePrice": 420,
    "turnaroundDays": 8,
    "scanRequirements": [
      "CBCT / CT scan",
      "STL dental model",
      "Supporting reference files"
    ],
    "sortOrder": 1
  },
  {
    "serviceId": "gfmr",
    "name": "GFMR",
    "description": "Full-mouth rehabilitation with a guided functional occlusal approach.",
    "basePrice": 580,
    "turnaroundDays": 12,
    "scanRequirements": [
      "Upper arch scan",
      "Lower arch scan",
      "Bite scan"
    ],
    "sortOrder": 2
  },
  {
    "serviceId": "fmb",
    "name": "FMB / FMP",
    "description": "Full-mouth bridge or partial restoration fabricated to precision.",
    "basePrice": 540,
    "turnaroundDays": 10,
    "scanRequirements": [
      "Upper arch STL",
      "Lower arch STL"
    ],
    "sortOrder": 3
  },
  {
    "serviceId": "temp-restoration",
    "name": "Temporary Restoration",
    "description": "Interim restorations to protect and maintain occlusion during treatment.",
    "basePrice": 300,
    "turnaroundDays": 4,
    "scanRequirements": [
      "Working model scan",
      "Antagonist scan"
    ],
    "sortOrder": 4
  },
  {
    "serviceId": "final-restoration",
    "name": "Final Restoration",
    "description": "Definitive crowns, bridges, veneers, or full-arch restorations.",
    "basePrice": 460,
    "turnaroundDays": 9,
    "scanRequirements": [
      "Prep scan",
      "Antagonist scan",
      "Shade reference photo"
    ],
    "sortOrder": 5
  },
  {
    "serviceId": "full-guide",
    "name": "Full Guide Case",
    "description": "End-to-end digital workflow with guided surgery and final prosthetics.",
    "basePrice": 640,
    "turnaroundDays": 12,
    "scanRequirements": [
      "CBCT / CT scan",
      "Full arch STL",
      "Diagnostic model",
      "Bite registration"
    ],
    "sortOrder": 6
  },
  {
    "serviceId": "other",
    "name": "Other Service",
    "description": "Custom lab service or specialized dental work not listed above.",
    "basePrice": 250,
    "turnaroundDays": 7,
    "scanRequirements": [
      "As specified"
    ],
    "sortOrder": 7
  }
];

const run = async (): Promise<void> => {
  await mongoose.connect(env.MONGODB_URI);
  const tenantIds = (await UserModel.distinct('tenantId')) as Types.ObjectId[];

  for (const tenantId of tenantIds) {
    for (const service of SERVICES) {
      await AssistantServiceCatalogModel.updateOne(
        { tenantId, serviceId: service.serviceId },
        { $set: { ...service, tenantId, isActive: true }, $unset: { subServices: '' } },
        { upsert: true },
      );
    }
  }

  const profilePath = resolve(__dirname, 'company-profile.json');
  if (existsSync(profilePath)) {
    const profile = JSON.parse(readFileSync(profilePath, 'utf8')) as Record<string, unknown>;
    for (const tenantId of tenantIds) {
      await AssistantCompanyProfileModel.updateOne(
        { tenantId },
        { $set: { ...profile, tenantId } },
        { upsert: true },
      );
    }
  } else {
    logger.warn('scripts/company-profile.json not found; company profile not seeded');
  }

  logger.info({ tenants: tenantIds.length, services: SERVICES.length }, 'Assistant catalog seeded');
  await mongoose.disconnect();
};

run().catch((error: unknown) => {
  logger.error({ error }, 'Assistant catalog seed failed');
  process.exit(1);
});
