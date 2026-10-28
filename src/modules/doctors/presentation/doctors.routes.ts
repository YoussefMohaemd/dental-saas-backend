import { Router } from 'express';

import { requireAnyCapability } from '../../auth/presentation/auth.middleware';
import { DoctorService } from '../application/doctor-service';
import { MongooseDoctorRepository } from '../infrastructure/mongoose-doctor-repository';
import { DoctorsController } from './doctors.controller';

const doctorsRouter = Router();

const doctorsController = new DoctorsController(
  new DoctorService(new MongooseDoctorRepository()),
);

doctorsRouter.get('/doctors', requireAnyCapability(['doctors.read']), doctorsController.listDoctors);
doctorsRouter.post('/doctors', requireAnyCapability(['doctors.manage']), doctorsController.createDoctor);
doctorsRouter.get('/doctors/:doctorId', requireAnyCapability(['doctors.read']), doctorsController.getDoctorById);
doctorsRouter.patch('/doctors/:doctorId', requireAnyCapability(['doctors.manage']), doctorsController.updateDoctor);
doctorsRouter.delete('/doctors/:doctorId', requireAnyCapability(['doctors.manage']), doctorsController.deleteDoctor);

export { doctorsRouter };
