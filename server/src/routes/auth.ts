import { Router } from 'express';
import * as cookie from 'cookie';
import { loginSchema } from '@livevote/shared';
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  readAdminCookie,
  signAdminToken,
  verifyAdminPassword,
} from '../auth.js';
import { RateLimiter } from '../util/rateLimiter.js';
import { resolveClientIp } from '../util/clientIp.js';

export const authRouter = Router();

// Brute-force protection (H2): ~10 attempts then one more every ~10s, per IP.
export const loginLimiter = new RateLimiter(10, 0.1);

authRouter.post('/login', (req, res) => {
  const ip = resolveClientIp(req.headers, req.socket.remoteAddress ?? undefined);
  if (!loginLimiter.take(ip)) {
    res.status(429).json({ error: 'Too many attempts — wait a moment and try again' });
    return;
  }
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Password required' });
    return;
  }
  if (!verifyAdminPassword(parsed.data.password)) {
    res.status(401).json({ error: 'Incorrect password' });
    return;
  }
  // A correct password clears the attempt counter for this IP.
  loginLimiter.reset(ip);
  res.setHeader(
    'Set-Cookie',
    cookie.serialize(ADMIN_COOKIE, signAdminToken(), adminCookieOptions()),
  );
  res.json({ ok: true });
});

authRouter.post('/logout', (_req, res) => {
  res.setHeader(
    'Set-Cookie',
    cookie.serialize(ADMIN_COOKIE, '', { ...adminCookieOptions(), maxAge: 0 }),
  );
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  res.json({ authenticated: readAdminCookie(req.headers.cookie) });
});
