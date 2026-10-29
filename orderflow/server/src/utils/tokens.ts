import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export type Role = 'customer' | 'admin';

export interface AuthUser {
  id: string;
  role: Role;
}

/** Short-lived JWT sent in the Authorization header and kept in memory by the client. */
export function signAccessToken(userId: string, role: Role): string {
  return jwt.sign({ role }, config.jwtSecret, {
    subject: userId,
    expiresIn: config.accessTokenTtlSeconds,
  });
}

export function verifyAccessToken(token: string): AuthUser {
  const decoded = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
  if (!decoded.sub || (decoded.role !== 'customer' && decoded.role !== 'admin')) {
    throw new Error('Malformed token payload');
  }
  return { id: String(decoded.sub), role: decoded.role };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Refresh tokens are random opaque strings. Only the SHA-256 hash is stored, so a
 * database leak does not expose usable tokens.
 */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(48).toString('hex');
  return { token, hash: hashToken(token) };
}
