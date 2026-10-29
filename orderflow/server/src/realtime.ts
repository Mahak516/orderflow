import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { config } from './config';
import { AuthUser, verifyAccessToken } from './utils/tokens';

let io: Server | null = null;

/**
 * Real-time updates over Socket.IO.
 * - Every connection must present a valid access token.
 * - Each user joins a private room `user:<id>`; admins also join `admins`.
 *   Events are sent to rooms, so users only ever receive their own orders.
 */
export function initRealtime(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: config.clientOrigin, credentials: true },
  });

  io.use((socket, next) => {
    const token: unknown = socket.handshake.auth?.token;
    if (typeof token !== 'string') return next(new Error('unauthorized'));
    try {
      socket.data.user = verifyAccessToken(token);
      return next();
    } catch {
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as AuthUser;
    socket.join(`user:${user.id}`);
    if (user.role === 'admin') socket.join('admins');
  });

  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function emitToAdmins(event: string, payload: unknown): void {
  io?.to('admins').emit(event, payload);
}

export function closeRealtime(): Promise<void> {
  return new Promise((resolve) => {
    if (!io) return resolve();
    const server = io;
    io = null;
    server.close(() => resolve());
  });
}
