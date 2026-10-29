import http from 'http';
import mongoose from 'mongoose';
import { createApp } from './app';
import { config } from './config';
import { closeRealtime, initRealtime } from './realtime';

async function main(): Promise<void> {
  await mongoose.connect(config.mongoUri);
  console.log('MongoDB connected');

  const server = http.createServer(createApp());
  initRealtime(server);

  server.listen(config.port, () => {
    console.log(`OrderFlow API listening on http://localhost:${config.port} (${config.env})`);
  });

  // Finish in-flight requests, then close connections cleanly (Docker/Kubernetes send SIGTERM).
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down`);
    await closeRealtime();
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
