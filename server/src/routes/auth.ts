import bcrypt from 'bcryptjs';
import { Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { RefreshToken } from '../models/refreshToken';
import { User } from '../models/user';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpError } from '../utils/httpError';
import { Role, generateRefreshToken, hashToken, signAccessToken } from '../utils/tokens';

export const REFRESH_COOKIE = 'refreshToken';
/** A just-rotated token may be replayed briefly (two tabs, a retry) without being treated as theft. */
const REUSE_GRACE_MS = 10_000;

const cookieOptions = {
  httpOnly: true, // JavaScript in the page can never read the refresh token
  secure: config.isProd,
  sameSite: 'lax' as const,
  path: '/api/auth', // only sent to the auth endpoints
};

// Slow down password guessing. Disabled in tests.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.isTest,
  message: { error: 'Too many attempts, please try again later' },
});

const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

async function startSession(req: Request, res: Response, userId: string, role: Role): Promise<string> {
  const { token, hash } = generateRefreshToken();
  await RefreshToken.create({
    user: userId,
    tokenHash: hash,
    expiresAt: new Date(Date.now() + config.refreshTokenTtlMs),
    userAgent: req.headers['user-agent']?.slice(0, 300),
  });
  res.cookie(REFRESH_COOKIE, token, { ...cookieOptions, maxAge: config.refreshTokenTtlMs });
  return signAccessToken(userId, role);
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
}

export const authRouter = Router();

authRouter.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body as z.infer<typeof registerSchema>;
    if (await User.exists({ email })) throw new HttpError(409, 'An account with this email already exists');

    const passwordHash = await bcrypt.hash(password, 12);
    // Self-registration always creates a customer. Admins are created out-of-band (seed script).
    const user = await User.create({ name, email, passwordHash, role: 'customer' });

    const accessToken = await startSession(req, res, String(user._id), 'customer');
    res.status(201).json({ user, accessToken });
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const user = await User.findOne({ email }).select('+passwordHash');

    // Same message for "no such user" and "wrong password" so accounts cannot be enumerated.
    const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !valid) throw new HttpError(401, 'Invalid email or password');

    const accessToken = await startSession(req, res, String(user._id), user.role as Role);
    res.json({ user, accessToken });
  }),
);

/**
 * Refresh-token rotation: every refresh revokes the old token and issues a new one.
 * If an already-rotated token shows up again (outside the grace window) it was probably
 * stolen, so every session of that user is revoked.
 */
authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const raw: unknown = req.cookies?.[REFRESH_COOKIE];
    if (typeof raw !== 'string' || !raw) throw new HttpError(401, 'No refresh token');

    const record = await RefreshToken.findOne({ tokenHash: hashToken(raw) });
    if (!record) {
      clearRefreshCookie(res);
      throw new HttpError(401, 'Invalid refresh token');
    }

    if (record.revokedAt) {
      if (Date.now() - record.revokedAt.getTime() > REUSE_GRACE_MS) {
        await RefreshToken.updateMany(
          { user: record.user, revokedAt: { $exists: false } },
          { $set: { revokedAt: new Date() } },
        );
      }
      clearRefreshCookie(res);
      throw new HttpError(401, 'Refresh token already used');
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      clearRefreshCookie(res);
      throw new HttpError(401, 'Refresh token expired');
    }

    const user = await User.findById(record.user);
    if (!user) {
      clearRefreshCookie(res);
      throw new HttpError(401, 'Account no longer exists');
    }

    // Atomic: only one request can rotate a given token.
    const rotated = await RefreshToken.findOneAndUpdate(
      { _id: record._id, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
    if (!rotated) throw new HttpError(401, 'Refresh token already used');

    const accessToken = await startSession(req, res, String(user._id), user.role as Role);
    res.json({ user, accessToken });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const raw: unknown = req.cookies?.[REFRESH_COOKIE];
    if (typeof raw === 'string' && raw) {
      await RefreshToken.updateOne(
        { tokenHash: hashToken(raw), revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date() } },
      );
    }
    clearRefreshCookie(res);
    res.status(204).end();
  }),
);

authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user!.id);
    if (!user) throw new HttpError(401, 'Account no longer exists');
    res.json({ user });
  }),
);
