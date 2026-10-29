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
  getProduct,
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

describe('placing an order', () => {
  it('prices the order from the database and reduces stock', async () => {
    const product = await createProduct(admin, { priceCents: 25000, stock: 10 });

    // The client tries to send its own price; it must be ignored.
    const res = await request(app)
      .post('/api/orders')
      .set(...bearer(customer))
      .send({ items: [{ productId: product.id, quantity: 3, priceCents: 1 }] });

    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ totalCents: 75000, status: 'pending' });
    expect(res.body.order.items[0]).toMatchObject({ name: 'Test Product', unitPriceCents: 25000, quantity: 3 });
    expect(res.body.order.statusHistory).toHaveLength(1);
    expect((await getProduct(product.id)).stock).toBe(7);
  });

  it('merges repeated lines for the same product', async () => {
    const product = await createProduct(admin, { stock: 10 });
    const res = await placeOrder(customer, [
      { productId: product.id, quantity: 2 },
      { productId: product.id, quantity: 3 },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.order.items).toHaveLength(1);
    expect(res.body.order.items[0].quantity).toBe(5);
    expect((await getProduct(product.id)).stock).toBe(5);
  });

  it('requires a login', async () => {
    const product = await createProduct(admin);
    const res = await request(app).post('/api/orders').send({ items: [{ productId: product.id, quantity: 1 }] });
    expect(res.status).toBe(401);
  });

  it('validates the request body', async () => {
    const product = await createProduct(admin);
    expect((await placeOrder(customer, [])).status).toBe(400);
    expect((await placeOrder(customer, [{ productId: product.id, quantity: 0 }])).status).toBe(400);
    expect((await placeOrder(customer, [{ productId: product.id, quantity: 21 }])).status).toBe(400);
    expect((await placeOrder(customer, [{ productId: 'nope', quantity: 1 }])).status).toBe(400);
  });

  it('answers 404 for an unknown or inactive product', async () => {
    const inactive = await createProduct(admin, { active: false });
    expect((await placeOrder(customer, [{ productId: 'aaaaaaaaaaaaaaaaaaaaaaaa', quantity: 1 }])).status).toBe(404);
    expect((await placeOrder(customer, [{ productId: inactive.id, quantity: 1 }])).status).toBe(404);
  });

  it('rejects an order that asks for more than the available stock', async () => {
    const product = await createProduct(admin, { stock: 2 });
    const res = await placeOrder(customer, [{ productId: product.id, quantity: 3 }]);
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Not enough stock');
    expect((await getProduct(product.id)).stock).toBe(2);
  });

  it('rolls back earlier reservations when a later line fails', async () => {
    const plenty = await createProduct(admin, { name: 'Plenty', stock: 5 });
    const scarce = await createProduct(admin, { name: 'Scarce', stock: 1 });

    const res = await placeOrder(customer, [
      { productId: plenty.id, quantity: 2 },
      { productId: scarce.id, quantity: 2 },
    ]);

    expect(res.status).toBe(409);
    expect((await getProduct(plenty.id)).stock).toBe(5);
    expect((await getProduct(scarce.id)).stock).toBe(1);
    const mine = await request(app).get('/api/orders').set(...bearer(customer));
    expect(mine.body.total).toBe(0);
  });

  it('never oversells when many customers buy the last items at once', async () => {
    const product = await createProduct(admin, { stock: 3 });

    const responses = await Promise.all(
      Array.from({ length: 8 }, () => placeOrder(customer, [{ productId: product.id, quantity: 1 }])),
    );

    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(3);
    expect(statuses.filter((s) => s === 409)).toHaveLength(5);
    expect((await getProduct(product.id)).stock).toBe(0);
  });
});

describe('idempotency', () => {
  it('returns the same order when a request is retried with the same key', async () => {
    const product = await createProduct(admin, { stock: 10 });
    const items = [{ productId: product.id, quantity: 2 }];

    const first = await placeOrder(customer, items, 'checkout-123');
    const retry = await placeOrder(customer, items, 'checkout-123');

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.order.id).toBe(first.body.order.id);
    expect((await getProduct(product.id)).stock).toBe(8); // charged once, not twice
  });

  it('creates only one order when the same key arrives concurrently', async () => {
    const product = await createProduct(admin, { stock: 10 });
    const items = [{ productId: product.id, quantity: 1 }];

    const responses = await Promise.all(Array.from({ length: 4 }, () => placeOrder(customer, items, 'race-key')));
    const ids = new Set(responses.map((r) => r.body.order.id));

    expect(ids.size).toBe(1);
    expect((await getProduct(product.id)).stock).toBe(9);
  });

  it('does not share keys between different customers', async () => {
    const other = await registerCustomer('other@test.dev', 'Other');
    const product = await createProduct(admin, { stock: 10 });
    const items = [{ productId: product.id, quantity: 1 }];

    const a = await placeOrder(customer, items, 'same-key');
    const b = await placeOrder(other, items, 'same-key');
    expect(a.body.order.id).not.toBe(b.body.order.id);
  });
});

describe('reading orders', () => {
  it('shows customers only their own orders', async () => {
    const other = await registerCustomer('other@test.dev', 'Other');
    const product = await createProduct(admin, { stock: 10 });
    const mine = await placeOrder(customer, [{ productId: product.id, quantity: 1 }]);
    await placeOrder(other, [{ productId: product.id, quantity: 1 }]);

    const list = await request(app).get('/api/orders').set(...bearer(customer));
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].id).toBe(mine.body.order.id);

    // Someone else's order looks like it does not exist.
    const theirs = await request(app).get(`/api/orders/${mine.body.order.id}`).set(...bearer(other));
    expect(theirs.status).toBe(404);
  });

  it('lets admins see everything but not customers', async () => {
    const product = await createProduct(admin, { stock: 10 });
    await placeOrder(customer, [{ productId: product.id, quantity: 1 }]);

    const all = await request(app).get('/api/orders').query({ all: 'true' }).set(...bearer(admin));
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(1);
    expect(all.body.items[0].user).toMatchObject({ email: customer.email });

    const denied = await request(app).get('/api/orders').query({ all: 'true' }).set(...bearer(customer));
    expect(denied.status).toBe(403);
  });

  it('lets an admin open any order', async () => {
    const product = await createProduct(admin, { stock: 10 });
    const order = await placeOrder(customer, [{ productId: product.id, quantity: 1 }]);
    const res = await request(app).get(`/api/orders/${order.body.order.id}`).set(...bearer(admin));
    expect(res.status).toBe(200);
  });
});

describe('order lifecycle', () => {
  async function newOrder(quantity = 2) {
    const product = await createProduct(admin, { stock: 10 });
    const order = await placeOrder(customer, [{ productId: product.id, quantity }]);
    return { product, orderId: order.body.order.id as string };
  }

  const setStatus = (orderId: string, status: string, who: Session = admin) =>
    request(app).patch(`/api/orders/${orderId}/status`).set(...bearer(who)).send({ status });

  it('moves through pay, ship and deliver, recording history', async () => {
    const { orderId } = await newOrder();

    const paid = await request(app).post(`/api/orders/${orderId}/pay`).set(...bearer(customer));
    expect(paid.status).toBe(200);
    expect(paid.body.order.status).toBe('paid');

    expect((await setStatus(orderId, 'shipped')).status).toBe(200);
    const delivered = await setStatus(orderId, 'delivered');
    expect(delivered.body.order.status).toBe('delivered');
    expect(delivered.body.order.statusHistory.map((h: { status: string }) => h.status)).toEqual([
      'pending',
      'paid',
      'shipped',
      'delivered',
    ]);
  });

  it('rejects invalid transitions', async () => {
    const { orderId } = await newOrder();
    expect((await setStatus(orderId, 'shipped')).status).toBe(409); // pending -> shipped
    expect((await setStatus(orderId, 'bogus')).status).toBe(400);
  });

  it('keeps the status endpoint admin-only', async () => {
    const { orderId } = await newOrder();
    expect((await setStatus(orderId, 'paid', customer)).status).toBe(403);
  });

  it('stops other customers from paying for someone else', async () => {
    const other = await registerCustomer('other@test.dev', 'Other');
    const { orderId } = await newOrder();
    const res = await request(app).post(`/api/orders/${orderId}/pay`).set(...bearer(other));
    expect(res.status).toBe(404);
  });

  it('returns stock when an order is cancelled', async () => {
    const { product, orderId } = await newOrder(4);
    expect((await getProduct(product.id)).stock).toBe(6);

    const res = await request(app).post(`/api/orders/${orderId}/cancel`).set(...bearer(customer));
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('cancelled');
    expect((await getProduct(product.id)).stock).toBe(10);
  });

  it('only lets customers cancel while the order is pending', async () => {
    const { product, orderId } = await newOrder(2);
    await request(app).post(`/api/orders/${orderId}/pay`).set(...bearer(customer));

    const res = await request(app).post(`/api/orders/${orderId}/cancel`).set(...bearer(customer));
    expect(res.status).toBe(409);
    expect((await getProduct(product.id)).stock).toBe(8);
  });

  it('lets an admin cancel a paid order', async () => {
    const { product, orderId } = await newOrder(2);
    await request(app).post(`/api/orders/${orderId}/pay`).set(...bearer(customer));

    expect((await setStatus(orderId, 'cancelled')).status).toBe(200);
    expect((await getProduct(product.id)).stock).toBe(10);
  });

  it('returns stock only once when a cancellation is sent twice at the same time', async () => {
    const { product, orderId } = await newOrder(4);

    const results = await Promise.all([setStatus(orderId, 'cancelled'), setStatus(orderId, 'cancelled')]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await getProduct(product.id)).stock).toBe(10); // not 14
  });
});
