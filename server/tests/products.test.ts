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

describe('product permissions', () => {
  it('lets an admin create a product', async () => {
    const res = await request(app)
      .post('/api/products')
      .set(...bearer(admin))
      .send({ name: 'Desk', category: 'Furniture', priceCents: 499900, stock: 4 });
    expect(res.status).toBe(201);
    expect(res.body.product).toMatchObject({ name: 'Desk', priceCents: 499900, stock: 4, active: true });
  });

  it('forbids customers from creating, editing or deleting products', async () => {
    const product = await createProduct(admin);
    const body = { name: 'Hack', category: 'X', priceCents: 1, stock: 1 };

    expect((await request(app).post('/api/products').set(...bearer(customer)).send(body)).status).toBe(403);
    expect((await request(app).patch(`/api/products/${product.id}`).set(...bearer(customer)).send({ stock: 999 })).status).toBe(403);
    expect((await request(app).delete(`/api/products/${product.id}`).set(...bearer(customer))).status).toBe(403);
  });

  it('requires a login to create a product', async () => {
    const res = await request(app).post('/api/products').send({ name: 'X', category: 'X', priceCents: 1, stock: 1 });
    expect(res.status).toBe(401);
  });

  it('validates input', async () => {
    const res = await request(app)
      .post('/api/products')
      .set(...bearer(admin))
      .send({ name: 'Bad', category: 'X', priceCents: -5, stock: 1.5 });
    expect(res.status).toBe(400);
  });
});

describe('listing products', () => {
  beforeEach(async () => {
    await createProduct(admin, { name: 'Blue Keyboard', category: 'Accessories', priceCents: 300000, stock: 5 });
    await createProduct(admin, { name: 'Red Keyboard', category: 'Accessories', priceCents: 200000, stock: 0 });
    await createProduct(admin, { name: 'Gaming Monitor', category: 'Displays', priceCents: 900000, stock: 2 });
    await createProduct(admin, { name: 'Hidden Item', category: 'Displays', priceCents: 100, stock: 1, active: false });
  });

  it('is public and hides inactive products', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.items.map((p: { name: string }) => p.name)).not.toContain('Hidden Item');
  });

  it('searches by name, case-insensitively', async () => {
    const res = await request(app).get('/api/products').query({ q: 'keyboard' });
    expect(res.body.items.map((p: { name: string }) => p.name).sort()).toEqual(['Blue Keyboard', 'Red Keyboard']);
  });

  it('treats the search text as plain text, not a regular expression', async () => {
    const res = await request(app).get('/api/products').query({ q: '.*' });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it('filters by category, stock and price range', async () => {
    expect((await request(app).get('/api/products').query({ category: 'Displays' })).body.total).toBe(1);
    expect((await request(app).get('/api/products').query({ inStock: 'true' })).body.total).toBe(2);
    expect((await request(app).get('/api/products').query({ minPrice: 250000, maxPrice: 400000 })).body.total).toBe(1);
  });

  it('sorts by price', async () => {
    const asc = await request(app).get('/api/products').query({ sort: 'price_asc' });
    expect(asc.body.items.map((p: { priceCents: number }) => p.priceCents)).toEqual([200000, 300000, 900000]);
    const desc = await request(app).get('/api/products').query({ sort: 'price_desc' });
    expect(desc.body.items[0].priceCents).toBe(900000);
  });

  it('paginates', async () => {
    const res = await request(app).get('/api/products').query({ limit: 2, page: 2 });
    expect(res.body).toMatchObject({ page: 2, limit: 2, total: 3, totalPages: 2 });
    expect(res.body.items).toHaveLength(1);
  });

  it('lets only admins see inactive products', async () => {
    const asCustomer = await request(app).get('/api/products').query({ includeInactive: 'true' }).set(...bearer(customer));
    expect(asCustomer.status).toBe(403);

    const asAdmin = await request(app).get('/api/products').query({ includeInactive: 'true' }).set(...bearer(admin));
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.total).toBe(4);
  });

  it('lists categories', async () => {
    const res = await request(app).get('/api/products/categories');
    expect(res.body.categories).toEqual(['Accessories', 'Displays']);
  });
});

describe('updating products', () => {
  it('lets an admin edit a product', async () => {
    const product = await createProduct(admin);
    const res = await request(app)
      .patch(`/api/products/${product.id}`)
      .set(...bearer(admin))
      .send({ priceCents: 55500 });
    expect(res.status).toBe(200);
    expect(res.body.product.priceCents).toBe(55500);
    expect(res.body.product.name).toBe('Test Product');
  });

  it('soft-deletes a product', async () => {
    const product = await createProduct(admin);
    expect((await request(app).delete(`/api/products/${product.id}`).set(...bearer(admin))).status).toBe(204);
    expect((await request(app).get(`/api/products/${product.id}`)).status).toBe(404);
  });

  it('answers 400 for a malformed id and 404 for an unknown one', async () => {
    expect((await request(app).get('/api/products/not-an-id')).status).toBe(400);
    expect((await request(app).get('/api/products/aaaaaaaaaaaaaaaaaaaaaaaa')).status).toBe(404);
  });
});
