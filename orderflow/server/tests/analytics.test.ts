import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  Session,
  app,
  bearer,
  connectTestDb,
  createAdmin,
  createProduct,
  disconnectTestDb,
  placeOrder,
  registerCustomer,
  resetDb,
} from './helpers';

let admin: Session;
let customer: Session;

beforeAll(connectTestDb);
beforeEach(async () => {
  await resetDb();
  admin = await createAdmin();
  customer = await registerCustomer();
});
afterAll(disconnectTestDb);

describe('analytics access', () => {
  it('is admin-only', async () => {
    expect((await request(app).get('/api/analytics/summary')).status).toBe(401);
    expect((await request(app).get('/api/analytics/summary').set(...bearer(customer))).status).toBe(403);
    expect((await request(app).get('/api/analytics/summary').set(...bearer(admin))).status).toBe(200);
  });

  it('returns an empty but well-formed summary when there are no orders', async () => {
    const res = await request(app).get('/api/analytics/summary').query({ days: 7 }).set(...bearer(admin));
    expect(res.body.totals).toMatchObject({ revenueCents: 0, orders: 0, averageOrderCents: 0 });
    expect(res.body.revenueByDay).toHaveLength(7);
    expect(res.body.topProducts).toEqual([]);
  });

  it('rejects an unreasonable range', async () => {
    const res = await request(app).get('/api/analytics/summary').query({ days: 9999 }).set(...bearer(admin));
    expect(res.status).toBe(400);
  });
});

describe('analytics numbers', () => {
  it('excludes cancelled orders from revenue and ranks products', async () => {
    const popular = await createProduct(admin, { name: 'Popular', priceCents: 10000, stock: 10 });
    const premium = await createProduct(admin, { name: 'Premium', priceCents: 50000, stock: 5 });

    await placeOrder(customer, [{ productId: popular.id, quantity: 2 }]); // 20 000
    const cancelled = await placeOrder(customer, [{ productId: premium.id, quantity: 1 }]); // 50 000, cancelled below
    await placeOrder(customer, [{ productId: popular.id, quantity: 1 }]); // 10 000

    await request(app)
      .patch(`/api/orders/${cancelled.body.order.id}/status`)
      .set(...bearer(admin))
      .send({ status: 'cancelled' });

    const res = await request(app).get('/api/analytics/summary').query({ days: 7 }).set(...bearer(admin));

    expect(res.body.totals).toMatchObject({
      revenueCents: 30000,
      orders: 2,
      averageOrderCents: 15000,
      customers: 1,
    });

    const today = res.body.revenueByDay[res.body.revenueByDay.length - 1];
    expect(today).toMatchObject({ revenueCents: 30000, orders: 2 });

    expect(res.body.topProducts).toEqual([
      { productId: popular.id, name: 'Popular', units: 3, revenueCents: 30000 },
    ]);

    const statuses = Object.fromEntries(
      res.body.ordersByStatus.map((row: { status: string; count: number }) => [row.status, row.count]),
    );
    expect(statuses).toEqual({ pending: 2, cancelled: 1 });

    // The cancelled order gave its stock back, so Premium (stock 5) is flagged as low stock.
    expect(res.body.lowStock.map((p: { name: string }) => p.name)).toEqual(['Premium']);
  });
});
