import type { RequestHandler } from 'express';
import { HttpError } from '../utils/httpError';
import { Role, verifyAccessToken } from '../utils/tokens';

function readBearer(header: string | undefined): string | null {
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

/** Requires a valid access token and attaches `req.user`. */
export const authenticate: RequestHandler = (req, _res, next) => {
  const token = readBearer(req.headers.authorization);
  if (!token) return next(new HttpError(401, 'Missing access token'));
  try {
    req.user = verifyAccessToken(token);
    return next();
  } catch {
    return next(new HttpError(401, 'Invalid or expired access token'));
  }
};

/** Attaches `req.user` when a valid token is present, but never rejects the request. */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const token = readBearer(req.headers.authorization);
  if (token) {
    try {
      req.user = verifyAccessToken(token);
    } catch {
      // An invalid token on a public route is treated like no token.
    }
  }
  next();
};

/** Role-based access control. Use after `authenticate`. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, 'Authentication required'));
    if (!roles.includes(req.user.role)) return next(new HttpError(403, 'You do not have permission to do this'));
    return next();
  };
}
