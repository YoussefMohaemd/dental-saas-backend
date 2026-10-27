import { Router } from 'express';

import { requireAnyRole } from '../../auth/presentation/auth.middleware';
import { OrdersService } from '../application/orders-service';
import { MongooseOrdersRepository } from '../infrastructure/mongoose-orders-repository';
import { OrdersController } from './orders.controller';

const ordersRouter = Router();

const ordersController = new OrdersController(
  new OrdersService(new MongooseOrdersRepository()),
);

ordersRouter.get('/orders', ordersController.listOrders);
ordersRouter.post('/orders', requireAnyRole(['admin', 'staff', 'doctor']), ordersController.createOrder);
ordersRouter.get('/orders/:orderId', ordersController.getOrderById);
ordersRouter.patch('/orders/:orderId', requireAnyRole(['admin', 'staff', 'doctor']), ordersController.updateOrder);
ordersRouter.delete('/orders/:orderId', requireAnyRole(['admin', 'staff', 'doctor']), ordersController.deleteOrder);

ordersRouter.get('/orders/:orderId/sub-orders', ordersController.listSubOrders);
ordersRouter.post('/orders/:orderId/sub-orders', requireAnyRole(['admin', 'staff', 'doctor']), ordersController.createSubOrders);
ordersRouter.put('/orders/:orderId/sub-orders', requireAnyRole(['admin', 'staff', 'doctor']), ordersController.replaceSubOrders);
ordersRouter.get('/orders/:orderId/sub-orders/:subOrderId', ordersController.getSubOrder);
ordersRouter.patch('/orders/:orderId/sub-orders/:subOrderId', requireAnyRole(['admin', 'staff', 'doctor', 'technician']), ordersController.updateSubOrder);
ordersRouter.delete('/orders/:orderId/sub-orders/:subOrderId', requireAnyRole(['admin', 'staff', 'doctor']), ordersController.deleteSubOrder);

export { ordersRouter };
