import { Router } from 'express';

import { requireAuthenticated } from './auth/presentation/auth.middleware';
import { authRouter } from './auth/presentation/auth.routes';
import { billingRouter } from './billing/presentation/billing.routes';
import { casesRouter } from './cases/presentation/cases.routes';
import { changeRequestsRouter } from './change-requests/presentation/change-requests.routes';
import { clinicsRouter } from './clinics/presentation/clinics.routes';
import { doctorsRouter } from './doctors/presentation/doctors.routes';
import { documentsRouter } from './documents/presentation/documents.routes';
import { healthRouter } from './health/presentation/health.routes';
import { notificationsRouter } from './notifications/presentation/notifications.routes';
import { ordersRouter } from './orders/presentation/orders.routes';
import { patientsRouter } from './patients/presentation/patients.routes';
import { reportsRouter } from './reports/presentation/reports.routes';
import { scanCentersRouter } from './scan-centers/presentation/scan-centers.routes';
import { settingsRouter } from './settings/presentation/settings.routes';
import { usersRouter } from './users/presentation/users.routes';

const moduleRouter = Router();
const v1Router = Router();

moduleRouter.use(authRouter);
moduleRouter.use(healthRouter);
v1Router.use(requireAuthenticated);
v1Router.use(clinicsRouter);
v1Router.use(doctorsRouter);
v1Router.use(patientsRouter);
v1Router.use(ordersRouter);
v1Router.use(casesRouter);
v1Router.use(billingRouter);
v1Router.use(changeRequestsRouter);
v1Router.use(scanCentersRouter);
v1Router.use(reportsRouter);
v1Router.use(documentsRouter);
v1Router.use(notificationsRouter);
v1Router.use(settingsRouter);
v1Router.use(usersRouter);
moduleRouter.use('/v1', v1Router);

export { moduleRouter };
