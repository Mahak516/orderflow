import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RefreshToken } from '../src/models/refreshToken';
import { PASSWORD, app, connectTestDb, disconnectTestDb, resetDb } from './helpers';

beforeAll(connectTestDb);
beforeEach(resetDb);
afterAll(disconnectTestDb);

const newUser = { name: 'Asha', email: 'asha@test.dev', password: PASSWORD };

/** "refreshToken=abc; Path=/api/auth; HttpOnly" -> "refreshToken=abc" */
function cookieFrom(res: request.Response): string {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((c) => c.startsWith('refreshToken='));
  if (!cookie) throw new Error('No refresh cookie in response');
  return cookie.split(';')[0];
}

describe('registration and login', () => {
  it('registers a customer, returns a token and sets an httpOnly refresh cookie', async () => {
    const res = await request(app).post('/api/auth/register').send(newUser);

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ name: 'Asha', email: 'asha@test.dev', role: 'customer' });
    expect(res.body.user.passwordHash).toBeUndefined();

    const rawCookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('refreshToken='))!;
    expect(rawCookie).toContain('HttpOnly');
    expect(rawCookie).toContain('Path=/api/auth');
  });

  it('never lets a client choose its own role', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...newUser, role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('customer');
  });

  it('rejects a duplicate email', async () => {
    await request(app).post('/api/auth/register').send(newUser);
    const res = await request(app).post('/api/auth/register').send(newUser);
    expect(res.status).toBe(409);
  });

  it('rejects weak input with field-level details', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: '', email: 'not-an-email', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.details.map((d: { path: string }) => d.path).sort()).toEqual(['email', 'name', 'password']);
  });

  it('logs in with the right password', async () => {
    await request(app).post('/api/auth/register').send(newUser);
    const res = await request(app).post('/api/auth/login').send({ email: newUser.email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    await request(app).post('/api/auth/register').send(newUser);
    const wrongPassword = await request(app).post('/api/auth/login').send({ email: newUser.email, password: 'WrongPass1!' });
    const unknownEmail = await request(app).post('/api/auth/login').send({ email: 'nobody@test.dev', password: PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error).toBe(unknownEmail.body.error);
  });

  it('protects /me', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer garbage')).status).toBe(401);

    const reg = await request(app).post('/api/auth/register').send(newUser);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${reg.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(newUser.email);
  });
});

describe('refresh token rotation', () => {
  it('issues a new access token and a different refresh token', async () => {
    const reg = await request(app).post('/api/auth/register').send(newUser);
    const first = cookieFrom(reg);

    const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', first);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toEqual(expect.any(String));
    expect(cookieFrom(refreshed)).not.toBe(first);
  });

  it('rejects a request without a refresh cookie', async () => {
    expect((await request(app).post('/api/auth/refresh')).status).toBe(401);
  });

  it('treats a quick replay of a rotated token as harmless', async () => {
    const reg = await request(app).post('/api/auth/register').send(newUser);
    const first = cookieFrom(reg);
    const second = cookieFrom(await request(app).post('/api/auth/refresh').set('Cookie', first));

    // Replaying the old token inside the grace window fails, but does not revoke the new session.
    expect((await request(app).post('/api/auth/refresh').set('Cookie', first)).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', second)).status).toBe(200);
  });

  it('revokes every session when an old token is reused later (theft detection)', async () => {
    const reg = await request(app).post('/api/auth/register').send(newUser);
    const first = cookieFrom(reg);
    const second = cookieFrom(await request(app).post('/api/auth/refresh').set('Cookie', first));

    // Pretend the first token was rotated a minute ago.
    await RefreshToken.updateMany({ revokedAt: { $exists: true } }, { $set: { revokedAt: new Date(Date.now() - 60_000) } });

    expect((await request(app).post('/api/auth/refresh').set('Cookie', first)).status).toBe(401);
    // The legitimate newest token is now dead too.
    expect((await request(app).post('/api/auth/refresh').set('Cookie', second)).status).toBe(401);
  });

  it('logout revokes the refresh token', async () => {
    const reg = await request(app).post('/api/auth/register').send(newUser);
    const cookie = cookieFrom(reg);

    expect((await request(app).post('/api/auth/logout').set('Cookie', cookie)).status).toBe(204);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookie)).status).toBe(401);
  });
});
