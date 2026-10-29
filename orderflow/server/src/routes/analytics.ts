import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { Order } from '../models/order';
import { Product } from '../models/product';
import { User } from '../models/user';
import { asyncHandler } from '../utils/asyncHandler';

const summaryQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

const DAY_MS = 24 * 60 * 60 * 1000;
const LOW_STOCK_LIMIT = 5;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export const analyticsRouter = Router();
analyticsRouter.use(authenticate, requireRole('admin'));

/**
 * Dashboard numbers, computed inside MongoDB with aggregation pipelines.
 * "Revenue" and "orders" exclude cancelled orders.
 */
analyticsRouter.get(
  '/summary',
  validate({ query: summaryQuery }),
  asyncHandler(async (req, res) => {
    const { days } = req.query as unknown as z.infer<typeof summaryQuery>;
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setTime(start.getTime() - (days - 1) * DAY_MS);

    const inRange = { createdAt: { $gte: start } };
    const notCancelled = { ...inRange, status: { $ne: 'cancelled' } };

    const [totals, daily, byStatus, topProducts, lowStock, customers] = await Promise.all([
      Order.aggregate<{ revenueCents: number; orders: number }>([
        { $match: notCancelled },
        { $group: { _id: null, revenueCents: { $sum: '$totalCents' }, orders: { $sum: 1 } } },
      ]),
      Order.aggregate<{ _id: string; revenueCents: number; orders: number }>([
        { $match: notCancelled },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
            revenueCents: { $sum: '$totalCents' },
            orders: { $sum: 1 },
          },
        },
      ]),
      Order.aggregate<{ _id: string; count: number }>([
        { $match: inRange },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Order.aggregate<{ _id: unknown; name: string; units: number; revenueCents: number }>([
        { $match: notCancelled },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.product',
            name: { $first: '$items.name' },
            units: { $sum: '$items.quantity' },
            revenueCents: { $sum: { $multiply: ['$items.unitPriceCents', '$items.quantity'] } },
          },
        },
        { $sort: { revenueCents: -1 } },
        { $limit: 5 },
      ]),
      Product.find({ active: true, stock: { $lte: LOW_STOCK_LIMIT } })
        .sort({ stock: 1, name: 1 })
        .limit(5)
        .select('name stock category'),
      User.countDocuments({ role: 'customer' }),
    ]);

    // Fill days without orders with zeros so charts have a continuous x-axis.
    const byDay = new Map(daily.map((row) => [row._id, row]));
    const revenueByDay = Array.from({ length: days }, (_, index) => {
      const key = dayKey(new Date(start.getTime() + index * DAY_MS));
      const row = byDay.get(key);
      return { date: key, revenueCents: row?.revenueCents ?? 0, orders: row?.orders ?? 0 };
    });

    const revenueCents = totals[0]?.revenueCents ?? 0;
    const orders = totals[0]?.orders ?? 0;

    res.json({
      days,
      totals: {
        revenueCents,
        orders,
        averageOrderCents: orders > 0 ? Math.round(revenueCents / orders) : 0,
        customers,
      },
      revenueByDay,
      ordersByStatus: byStatus.map((row) => ({ status: row._id, count: row.count })),
      topProducts: topProducts.map((row) => ({
        productId: String(row._id),
        name: row.name,
        units: row.units,
        revenueCents: row.revenueCents,
      })),
      lowStock,
    });
  }),
);
