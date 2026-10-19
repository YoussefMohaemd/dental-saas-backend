import { Router } from 'express';

import { DoctorService } from '../application/doctor-service';
import { MongooseDoctorRepository } from '../infrastructure/mongoose-doctor-repository';
import { DoctorsController } from './doctors.controller';

const doctorsRouter = Router();

const doctorsController = new DoctorsController(
  new DoctorService(new MongooseDoctorRepository()),
);

doctorsRouter.get('/doctors', doctorsController.listDoctors);
doctorsRouter.post('/doctors', doctorsController.createDoctor);
doctorsRouter.get('/doctors/:doctorId', doctorsController.getDoctorById);
doctorsRouter.patch('/doctors/:doctorId', doctorsController.updateDoctor);
doctorsRouter.delete('/doctors/:doctorId', doctorsController.deleteDoctor);

export { doctorsRouter };

