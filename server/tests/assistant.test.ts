import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
  process.env.ANTHROPIC_API_KEY = 'test-key-not-real';
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.ASSISTANT_PROVIDER;
});
afterAll(disconnectTestDb);

function mockModel(text: string, status = 200) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const ask = (session: Session, content = 'a gift under 5000') =>
  request(app)
    .post('/api/assistant')
    .set(...bearer(session))
    .send({ messages: [{ role: 'user', content }] });

describe('AI assistant', () => {
  it('requires a login', async () => {
    const res = await request(app).post('/api/assistant').send({ messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(401);
  });

  it('answers 503 and never calls the provider when no API key is set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const fetchMock = mockModel('{}');
    const res = await ask(customer);
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports whether the assistant is enabled', async () => {
    expect((await request(app).get('/api/assistant/status')).body).toEqual({ enabled: true });
    delete process.env.ANTHROPIC_API_KEY;
    expect((await request(app).get('/api/assistant/status')).body).toEqual({ enabled: false });
  });

  it('returns only real products and sends only sellable products to the model', async () => {
    const mug = await createProduct(admin, { name: 'Travel Mug', stock: 5 });
    const soldOut = await createProduct(admin, { name: 'Sold Out Lamp', stock: 0 });
    const hidden = await createProduct(admin, { name: 'Hidden Gadget', stock: 5, active: false });

    const fetchMock = mockModel(
      JSON.stringify({ reply: 'Try the mug.', productIds: [mug.id, '507f1f77bcf86cd799439011', mug.id] }),
    );
    const res = await ask(customer);

    expect(res.status).toBe(200);
    expect(res.body.reply).toBe('Try the mug.');
    // The invented id is dropped and the duplicate is removed.
    expect(res.body.products.map((p: { id: string }) => p.id)).toEqual([mug.id]);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(init.headers['x-api-key']).toBe('test-key-not-real');
    const sent = JSON.parse(init.body) as { system: string };
    expect(sent.system).toContain('Travel Mug');
    expect(sent.system).not.toContain(soldOut.id);
    expect(sent.system).not.toContain(hidden.id);
  });

  it('tolerates JSON wrapped in a code fence', async () => {
    const mug = await createProduct(admin, { name: 'Travel Mug' });
    mockModel('```json\n' + JSON.stringify({ reply: 'Mug!', productIds: [mug.id] }) + '\n```');
    const res = await ask(customer);
    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(1);
  });

  it('falls back to plain text when the model does not return JSON', async () => {
    mockModel('Sorry, no JSON here.');
    const res = await ask(customer);
    expect(res.status).toBe(200);
    expect(res.body.reply).toBe('Sorry, no JSON here.');
    expect(res.body.products).toEqual([]);
  });

  it('hides provider details when the provider fails', async () => {
    mockModel('{"error":"invalid x-api-key sk-secret"}', 401);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await ask(customer);
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain('sk-secret');
  });

  it('rejects a conversation that does not end with a user message', async () => {
    const res = await request(app)
      .post('/api/assistant')
      .set(...bearer(customer))
      .send({ messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }] });
    expect(res.status).toBe(400);
  });

  it('accepts a follow-up that includes a long earlier assistant answer', async () => {
    mockModel(JSON.stringify({ reply: 'ok', productIds: [] }));
    const res = await request(app)
      .post('/api/assistant')
      .set(...bearer(customer))
      .send({
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'x'.repeat(600) },
          { role: 'user', content: 'and cheaper?' },
        ],
      });
    expect(res.status).toBe(200);
  });

  it('works with a Gemini key instead, sending the key in a header', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.GEMINI_API_KEY = 'gemini-test-key';
    const mug = await createProduct(admin, { name: 'Travel Mug' });
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify({ reply: 'Mug!', productIds: [mug.id] }) }] } }],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await ask(customer);

    expect(res.status).toBe(200);
    expect(res.body.products.map((p: { id: string }) => p.id)).toEqual([mug.id]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).not.toContain('gemini-test-key');
    expect(init.headers['x-goog-api-key']).toBe('gemini-test-key');
  });
});
