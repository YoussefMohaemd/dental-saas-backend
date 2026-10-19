import { Router } from 'express';

import { ClinicService } from '../application/clinic-service';
import { MongooseClinicRepository } from '../infrastructure/mongoose-clinic-repository';
import { ClinicsController } from './clinics.controller';

const clinicsRouter = Router();

const clinicsController = new ClinicsController(
  new ClinicService(new MongooseClinicRepository()),
);

clinicsRouter.get('/clinics', clinicsController.listClinics);
clinicsRouter.post('/clinics', clinicsController.createClinic);
clinicsRouter.get('/clinics/:clinicId', clinicsController.getClinicById);
clinicsRouter.patch('/clinics/:clinicId', clinicsController.updateClinic);
clinicsRouter.delete('/clinics/:clinicId', clinicsController.deleteClinic);

export { clinicsRouter };

