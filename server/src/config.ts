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
  // Optional AI assistant. Without any key it answers 503 and the rest of the app is unaffected.
  // Getters, so tests (and a restart-free .env edit) always see the current value.
  get anthropicApiKey(): string | undefined {
    return process.env.ANTHROPIC_API_KEY || undefined;
  },
  get geminiApiKey(): string | undefined {
    return process.env.GEMINI_API_KEY || undefined;
  },
  /** Which AI provider to use: ASSISTANT_PROVIDER wins, otherwise whichever key is set. */
  get assistantProvider(): 'anthropic' | 'gemini' | null {
    const wanted = process.env.ASSISTANT_PROVIDER;
    if (wanted === 'gemini' && this.geminiApiKey) return 'gemini';
    if (wanted === 'anthropic' && this.anthropicApiKey) return 'anthropic';
    if (this.anthropicApiKey) return 'anthropic';
    if (this.geminiApiKey) return 'gemini';
    return null;
  },
  get assistantModel(): string {
    const fallback = this.assistantProvider === 'gemini' ? 'gemini-2.5-flash' : 'claude-haiku-5-5';
    return process.env.ASSISTANT_MODEL || fallback;
  },
};
