import dotenv from 'dotenv';

dotenv.config();

const env = process.env.NODE_ENV ?? 'development';

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (env === 'production') {
    throw new Error('JWT_SECRET must be set (16+ characters) in production');
  }
  return 'dev-only-secret-do-not-use-in-production';
}

export const config = {
  env,
  isProd: env === 'production',
  isTest: env === 'test',
  port: Number(process.env.PORT ?? 4000),
  mongoUri: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/orderflow',
  jwtSecret: resolveJwtSecret(),
  accessTokenTtlSeconds: 15 * 60,
  refreshTokenTtlMs: 7 * 24 * 60 * 60 * 1000,
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
};
