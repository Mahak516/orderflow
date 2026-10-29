import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import morgan from 'morgan';
import { config } from './config';
import { errorHandler, notFound } from './middleware/error';
import { analyticsRouter } from './routes/analytics';
import { assistantRouter, assistantStatusRouter } from './routes/assistant';
import { authRouter } from './routes/auth';
import { ordersRouter } from './routes/orders';
import { productsRouter } from './routes/products';

/** Builds the Express app. Kept separate from `server.ts` so tests can import it. */
export function createApp() {
  const app = express();

  // Behind nginx/a load balancer, trust one proxy hop so rate limiting sees real client IPs.
  if (config.isProd) app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  if (!config.isTest) app.use(morgan(config.isProd ? 'combined' : 'dev'));

  app.get('/api/health', (_req, res) => {
    const dbConnected = mongoose.connection.readyState === 1;
    res.status(dbConnected ? 200 : 503).json({ status: dbConnected ? 'ok' : 'degraded', db: dbConnected });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/assistant/status', assistantStatusRouter);
  app.use('/api/assistant', assistantRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
