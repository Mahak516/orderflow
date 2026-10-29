import http from 'http';
import type { AddressInfo } from 'net';
import request from 'supertest';
import { Socket, io as connectClient } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeRealtime, initRealtime } from '../src/realtime';
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

let server: http.Server;
let baseUrl: string;
let sockets: Socket[] = [];
let admin: Session;
let customer: Session;

function connect(token?: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connectClient(baseUrl, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(socket);
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err) => reject(err));
  });
}

function waitFor<T = unknown>(socket: Socket, event: string, timeoutMs = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for "${event}"`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

beforeAll(async () => {
  await connectTestDb();
  server = http.createServer(app);
  initRealtime(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

beforeEach(async () => {
  await resetDb();
  admin = await createAdmin();
  customer = await registerCustomer();
});

afterEach(() => {
  sockets.forEach((socket) => socket.disconnect());
  sockets = [];
});

afterAll(async () => {
  await closeRealtime(); // also closes the HTTP server
  await disconnectTestDb();
});

describe('socket authentication', () => {
  it('refuses connections without a valid token', async () => {
    await expect(connect()).rejects.toThrow('unauthorized');
    await expect(connect('not-a-real-token')).rejects.toThrow('unauthorized');
  });

  it('accepts a valid access token', async () => {
    const socket = await connect(customer.token);
    expect(socket.connected).toBe(true);
  });
});

describe('live order events', () => {
  it('tells admins when a customer places an order', async () => {
    const adminSocket = await connect(admin.token);
    const product = await createProduct(admin, { stock: 5 });

    const received = waitFor<{ id: string; totalCents: number }>(adminSocket, 'order:created');
    const order = await placeOrder(customer, [{ productId: product.id, quantity: 2 }]);

    const event = await received;
    expect(event.id).toBe(order.body.order.id);
    expect(event.totalCents).toBe(20000);
  });

  it('tells the customer, and only that customer, when an admin updates their order', async () => {
    const other = await registerCustomer('other@test.dev', 'Other');
    const customerSocket = await connect(customer.token);
    const otherSocket = await connect(other.token);
    const product = await createProduct(admin, { stock: 5 });
    const order = await placeOrder(customer, [{ productId: product.id, quantity: 1 }]);

    let otherReceived = false;
    otherSocket.on('order:updated', () => {
      otherReceived = true;
    });

    const received = waitFor<{ id: string; status: string }>(customerSocket, 'order:updated');
    await request(app)
      .patch(`/api/orders/${order.body.order.id}/status`)
      .set(...bearer(admin))
      .send({ status: 'paid' });

    const event = await received;
    expect(event).toMatchObject({ id: order.body.order.id, status: 'paid' });

    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(otherReceived).toBe(false);
  });
});
