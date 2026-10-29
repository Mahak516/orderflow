import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app';
import { User } from '../src/models/user';

export const app = createApp();

const TEST_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/orderflow_test';

export const PASSWORD = 'Password123!';

export async function connectTestDb(): Promise<void> {
  // Safety net: the tests wipe every collection, so never point them at a real database.
  if (!/test/i.test(TEST_URI)) {
    throw new Error(`Refusing to run tests against "${TEST_URI}". The database name must contain "test".`);
  }
  await mongoose.connect(TEST_URI);
  // Make sure unique and partial indexes exist before any test relies on them.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
}

export async function resetDb(): Promise<void> {
  await Promise.all(Object.values(mongoose.models).map((model) => model.deleteMany({})));
}

export async function disconnectTestDb(): Promise<void> {
  await mongoose.disconnect();
}

export interface Session {
  token: string;
  userId: string;
  email: string;
}

/** Register a customer through the real API. */
export async function registerCustomer(email = 'customer@test.dev', name = 'Test Customer'): Promise<Session> {
  const res = await request(app).post('/api/auth/register').send({ name, email, password: PASSWORD });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.accessToken, userId: res.body.user.id, email };
}

/** Admins cannot self-register, so create one directly and log in through the API. */
export async function createAdmin(email = 'admin@test.dev'): Promise<Session> {
  const user = await User.create({
    name: 'Test Admin',
    email,
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    role: 'admin',
  });
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`admin login failed: ${res.status}`);
  return { token: res.body.accessToken, userId: String(user._id), email };
}

export function bearer(session: Session): [string, string] {
  return ['Authorization', `Bearer ${session.token}`];
}

export interface ProductInput {
  name?: string;
  category?: string;
  priceCents?: number;
  stock?: number;
  active?: boolean;
}

export async function createProduct(admin: Session, input: ProductInput = {}) {
  const res = await request(app)
    .post('/api/products')
    .set(...bearer(admin))
    .send({ name: 'Test Product', category: 'General', priceCents: 10000, stock: 10, ...input });
  if (res.status !== 201) throw new Error(`createProduct failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.product as { id: string; name: string; priceCents: number; stock: number };
}

export async function getProduct(id: string) {
  const res = await request(app).get(`/api/products/${id}`);
  return res.body.product as { id: string; stock: number };
}

export async function placeOrder(
  customer: Session,
  items: { productId: string; quantity: number }[],
  idempotencyKey?: string,
) {
  const req = request(app).post('/api/orders').set(...bearer(customer));
  if (idempotencyKey) req.set('Idempotency-Key', idempotencyKey);
  return req.send({ items });
}
