import { Router } from 'express';

import { requireAnyRole } from '../../auth/presentation/auth.middleware';
import { ClinicService } from '../application/clinic-service';
import { MongooseClinicRepository } from '../infrastructure/mongoose-clinic-repository';
import { ClinicsController } from './clinics.controller';

const clinicsRouter = Router();

const clinicsController = new ClinicsController(
  new ClinicService(new MongooseClinicRepository()),
);

clinicsRouter.get('/clinics', clinicsController.listClinics);
clinicsRouter.post('/clinics', requireAnyRole(['admin', 'staff']), clinicsController.createClinic);
clinicsRouter.get('/clinics/:clinicId', clinicsController.getClinicById);
clinicsRouter.patch('/clinics/:clinicId', requireAnyRole(['admin', 'staff']), clinicsController.updateClinic);
clinicsRouter.delete('/clinics/:clinicId', requireAnyRole(['admin', 'staff']), clinicsController.deleteClinic);

export { clinicsRouter };
