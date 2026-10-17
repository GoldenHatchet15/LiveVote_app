import { createServer, type Server as HttpServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { Server as IOServer } from 'socket.io';
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@livevote/shared';
import { env } from './env.js';
import { apiRouter } from './routes/index.js';
import { registerSocketHandlers } from './socket/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const clientDist = join(here, '../../client/dist');

function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (origin && env.corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
}

export interface BuiltApp {
  app: Express;
  server: HttpServer;
  io: IOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >;
}

export function buildApp(): BuiltApp {
  const app = express();

  // Behind Cloudflare in production we read the real client IP from
  // CF-Connecting-IP (see socket clientIp); trust exactly one proxy hop.
  if (env.trustProxy) app.set('trust proxy', 1);

  // Security headers (H1). CSP is tuned for the bundled app + Google Fonts +
  // same-origin Socket.IO (ws/wss is covered by 'self').
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          ...(env.isProd ? { upgradeInsecureRequests: [] } : {}),
        },
      },
      // Allow the bundled emoji SVGs / fonts to load without COEP friction.
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(corsMiddleware);
  app.use(express.json({ limit: '256kb' }));

  app.use('/api', apiRouter);

  // Serve the built client (production) with an SPA fallback.
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(join(clientDist, 'index.html'));
    });
  }

  // JSON error handler.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // eslint-disable-next-line no-console
    console.error('[api error]', err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error' });
  });

  const server = createServer(app);
  const io = new IOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(server, {
    cors: { origin: env.corsOrigins, credentials: true },
    // Answers are tiny; cap the per-message size to blunt abuse (M3).
    maxHttpBufferSize: 16 * 1024,
    pingTimeout: 20_000,
  });

  registerSocketHandlers(io);

  return { app, server, io };
}
