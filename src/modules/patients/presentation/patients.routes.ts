import { Router } from 'express';

import { requireAnyRole } from '../../auth/presentation/auth.middleware';
import { PatientService } from '../application/patient-service';
import { MongoosePatientRepository } from '../infrastructure/mongoose-patient-repository';
import { PatientsController } from './patients.controller';

const patientsRouter = Router();

const patientsController = new PatientsController(
  new PatientService(new MongoosePatientRepository()),
);

patientsRouter.get('/patients', patientsController.listPatients);
patientsRouter.post('/patients', requireAnyRole(['admin', 'staff', 'doctor']), patientsController.createPatient);
patientsRouter.get('/patients/:patientId', patientsController.getPatientById);
patientsRouter.patch('/patients/:patientId', requireAnyRole(['admin', 'staff', 'doctor']), patientsController.updatePatient);
patientsRouter.delete('/patients/:patientId', requireAnyRole(['admin', 'staff']), patientsController.deletePatient);

export { patientsRouter };
