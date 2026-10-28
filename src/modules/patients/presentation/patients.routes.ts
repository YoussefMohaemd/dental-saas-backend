import { Router } from 'express';

import { requireAnyCapability } from '../../auth/presentation/auth.middleware';
import { PatientService } from '../application/patient-service';
import { MongoosePatientRepository } from '../infrastructure/mongoose-patient-repository';
import { PatientsController } from './patients.controller';

const patientsRouter = Router();

const patientsController = new PatientsController(
  new PatientService(new MongoosePatientRepository()),
);

patientsRouter.get('/patients', requireAnyCapability(['patients.read']), patientsController.listPatients);
patientsRouter.post('/patients', requireAnyCapability(['patients.create']), patientsController.createPatient);
patientsRouter.get('/patients/:patientId', requireAnyCapability(['patients.read']), patientsController.getPatientById);
patientsRouter.patch('/patients/:patientId', requireAnyCapability(['patients.update']), patientsController.updatePatient);
patientsRouter.delete('/patients/:patientId', requireAnyCapability(['patients.delete']), patientsController.deletePatient);

export { patientsRouter };
