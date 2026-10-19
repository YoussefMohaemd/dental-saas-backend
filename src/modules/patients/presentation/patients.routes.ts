import { Router } from 'express';

import { PatientService } from '../application/patient-service';
import { MongoosePatientRepository } from '../infrastructure/mongoose-patient-repository';
import { PatientsController } from './patients.controller';

const patientsRouter = Router();

const patientsController = new PatientsController(
  new PatientService(new MongoosePatientRepository()),
);

patientsRouter.get('/patients', patientsController.listPatients);
patientsRouter.post('/patients', patientsController.createPatient);
patientsRouter.get('/patients/:patientId', patientsController.getPatientById);
patientsRouter.patch('/patients/:patientId', patientsController.updatePatient);
patientsRouter.delete('/patients/:patientId', patientsController.deletePatient);

export { patientsRouter };

