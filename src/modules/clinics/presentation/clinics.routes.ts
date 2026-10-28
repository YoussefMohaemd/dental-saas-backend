import { Router } from 'express';

import { requireAnyCapability } from '../../auth/presentation/auth.middleware';
import { ClinicService } from '../application/clinic-service';
import { MongooseClinicRepository } from '../infrastructure/mongoose-clinic-repository';
import { ClinicsController } from './clinics.controller';

const clinicsRouter = Router();

const clinicsController = new ClinicsController(
  new ClinicService(new MongooseClinicRepository()),
);

clinicsRouter.get('/clinics', requireAnyCapability(['clinics.read']), clinicsController.listClinics);
clinicsRouter.post('/clinics', requireAnyCapability(['clinics.manage']), clinicsController.createClinic);
clinicsRouter.get('/clinics/:clinicId', requireAnyCapability(['clinics.read']), clinicsController.getClinicById);
clinicsRouter.patch('/clinics/:clinicId', requireAnyCapability(['clinics.manage']), clinicsController.updateClinic);
clinicsRouter.delete('/clinics/:clinicId', requireAnyCapability(['clinics.manage']), clinicsController.deleteClinic);

export { clinicsRouter };
