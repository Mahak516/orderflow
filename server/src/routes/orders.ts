import { Router } from 'express';
import { z } from 'zod';
import { ORDER_STATUSES, OrderStatus } from '../domain/orderStatus';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { Order } from '../models/order';
import { emitToAdmins, emitToUser } from '../realtime';
import { changeStatus, placeOrder } from '../services/orderService';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpError } from '../utils/httpError';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const idParams = z.object({ id: objectId });

const createBody = z.object({
  items: z
    .array(z.object({ productId: objectId, quantity: z.number().int().min(1).max(20) }))
    .min(1, 'Add at least one item')
    .max(50),
});

const listQuery = z.object({
  all: z.enum(['true', 'false']).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

type OrderDoc = Awaited<ReturnType<typeof changeStatus>>;

/** Tell the order owner and every admin that an order changed. */
function broadcastUpdate(order: OrderDoc): void {
  const payload = order.toJSON();
  emitToUser(String(order.user), 'order:updated', payload);
  emitToAdmins('order:updated', payload);
}

export const ordersRouter = Router();
ordersRouter.use(authenticate);

ordersRouter.post(
  '/',
  validate({ body: createBody }),
  asyncHandler(async (req, res) => {
    const { items } = req.body as z.infer<typeof createBody>;
    const rawKey = req.header('Idempotency-Key');
    const idempotencyKey = rawKey ? rawKey.slice(0, 100) : undefined;

    const { order, created } = await placeOrder(req.user!.id, items, idempotencyKey);
    if (created) emitToAdmins('order:created', order.toJSON());

    res.status(created ? 201 : 200).json({ order });
  }),
);

ordersRouter.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof listQuery>;
    const isAdmin = req.user!.role === 'admin';
    if (query.all === 'true' && !isAdmin) throw new HttpError(403, 'Only admins can list all orders');

    const filter: Record<string, unknown> = {};
    if (query.all !== 'true') filter.user = req.user!.id;
    if (query.status) filter.status = query.status;

    const [items, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .populate('user', 'name email'),
      Order.countDocuments(filter),
    ]);

    res.json({
      items,
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    });
  }),
);

ordersRouter.get(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);
    // Answer 404 (not 403) for other people's orders so ids cannot be probed.
    if (!order || (req.user!.role !== 'admin' && String(order.user) !== req.user!.id)) {
      throw new HttpError(404, 'Order not found');
    }
    await order.populate('user', 'name email');
    res.json({ order });
  }),
);

// Simulated payment: a real system would confirm a payment-provider webhook here.
ordersRouter.post(
  '/:id/pay',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const existing = await Order.findOne({ _id: req.params.id, user: req.user!.id });
    if (!existing) throw new HttpError(404, 'Order not found');
    const order = await changeStatus(req.params.id, 'paid', req.user!.id);
    broadcastUpdate(order);
    res.json({ order });
  }),
);

// Customers may cancel their own order only while it is still pending.
ordersRouter.post(
  '/:id/cancel',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const isAdmin = req.user!.role === 'admin';
    const existing = await Order.findById(req.params.id);
    if (!existing || (!isAdmin && String(existing.user) !== req.user!.id)) {
      throw new HttpError(404, 'Order not found');
    }
    if (!isAdmin && existing.status !== 'pending') {
      throw new HttpError(409, 'Only pending orders can be cancelled. Please contact support.');
    }
    const order = await changeStatus(req.params.id, 'cancelled', req.user!.id);
    broadcastUpdate(order);
    res.json({ order });
  }),
);

ordersRouter.patch(
  '/:id/status',
  requireRole('admin'),
  validate({ params: idParams, body: z.object({ status: z.enum(ORDER_STATUSES) }) }),
  asyncHandler(async (req, res) => {
    const { status } = req.body as { status: OrderStatus };
    const order = await changeStatus(req.params.id, status, req.user!.id);
    broadcastUpdate(order);
    res.json({ order });
  }),
);
