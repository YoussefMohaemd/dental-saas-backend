import { Router } from 'express';

import { requireAnyRole } from '../../auth/presentation/auth.middleware';
import { DoctorService } from '../application/doctor-service';
import { MongooseDoctorRepository } from '../infrastructure/mongoose-doctor-repository';
import { DoctorsController } from './doctors.controller';

const doctorsRouter = Router();

const doctorsController = new DoctorsController(
  new DoctorService(new MongooseDoctorRepository()),
);

doctorsRouter.get('/doctors', doctorsController.listDoctors);
doctorsRouter.post('/doctors', requireAnyRole(['admin', 'staff']), doctorsController.createDoctor);
doctorsRouter.get('/doctors/:doctorId', doctorsController.getDoctorById);
doctorsRouter.patch('/doctors/:doctorId', requireAnyRole(['admin', 'staff']), doctorsController.updateDoctor);
doctorsRouter.delete('/doctors/:doctorId', requireAnyRole(['admin', 'staff']), doctorsController.deleteDoctor);

export { doctorsRouter };
