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

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Password required' });
    return;
  }
  if (!verifyAdminPassword(parsed.data.password)) {
    res.status(401).json({ error: 'Incorrect password' });
    return;
  }
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
