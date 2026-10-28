import { Router } from 'express';

import { requireAnyCapability } from '../../auth/presentation/auth.middleware';
import { OrdersService } from '../application/orders-service';
import { MongooseOrdersRepository } from '../infrastructure/mongoose-orders-repository';
import { OrdersController } from './orders.controller';

const ordersRouter = Router();

const ordersController = new OrdersController(
  new OrdersService(new MongooseOrdersRepository()),
);

ordersRouter.get('/orders', requireAnyCapability(['orders.read']), ordersController.listOrders);
ordersRouter.post('/orders', requireAnyCapability(['orders.create']), ordersController.createOrder);
ordersRouter.get('/orders/:orderId', requireAnyCapability(['orders.read']), ordersController.getOrderById);
ordersRouter.patch('/orders/:orderId', requireAnyCapability(['orders.update']), ordersController.updateOrder);
ordersRouter.delete('/orders/:orderId', requireAnyCapability(['orders.delete']), ordersController.deleteOrder);

ordersRouter.get('/orders/:orderId/sub-orders', requireAnyCapability(['orders.read']), ordersController.listSubOrders);
ordersRouter.post('/orders/:orderId/sub-orders', requireAnyCapability(['orders.subOrders.manage']), ordersController.createSubOrders);
ordersRouter.put('/orders/:orderId/sub-orders', requireAnyCapability(['orders.subOrders.manage']), ordersController.replaceSubOrders);
ordersRouter.get('/orders/:orderId/sub-orders/:subOrderId', requireAnyCapability(['orders.read']), ordersController.getSubOrder);
ordersRouter.patch('/orders/:orderId/sub-orders/:subOrderId', requireAnyCapability(['orders.subOrders.update']), ordersController.updateSubOrder);
ordersRouter.delete('/orders/:orderId/sub-orders/:subOrderId', requireAnyCapability(['orders.subOrders.manage']), ordersController.deleteSubOrder);

export { ordersRouter };
