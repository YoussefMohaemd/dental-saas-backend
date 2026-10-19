import { Router } from 'express';

import { OrdersService } from '../application/orders-service';
import { MongooseOrdersRepository } from '../infrastructure/mongoose-orders-repository';
import { OrdersController } from './orders.controller';

const ordersRouter = Router();

const ordersController = new OrdersController(
  new OrdersService(new MongooseOrdersRepository()),
);

ordersRouter.get('/orders', ordersController.listOrders);
ordersRouter.post('/orders', ordersController.createOrder);
ordersRouter.get('/orders/:orderId', ordersController.getOrderById);
ordersRouter.patch('/orders/:orderId', ordersController.updateOrder);
ordersRouter.delete('/orders/:orderId', ordersController.deleteOrder);

ordersRouter.get('/orders/:orderId/sub-orders', ordersController.listSubOrders);
ordersRouter.post('/orders/:orderId/sub-orders', ordersController.createSubOrders);
ordersRouter.put('/orders/:orderId/sub-orders', ordersController.replaceSubOrders);
ordersRouter.get('/orders/:orderId/sub-orders/:subOrderId', ordersController.getSubOrder);
ordersRouter.patch('/orders/:orderId/sub-orders/:subOrderId', ordersController.updateSubOrder);
ordersRouter.delete('/orders/:orderId/sub-orders/:subOrderId', ordersController.deleteSubOrder);

export { ordersRouter };
