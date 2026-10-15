import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import * as cookie from 'cookie';
import { env } from './env.js';

export const ADMIN_COOKIE = 'lv_admin';

/**
 * The cookie value is `issuedAt.signature`, where signature = HMAC(secret,
 * issuedAt). It proves the holder authenticated with the admin password
 * without storing server-side session state. Rotating SESSION_SECRET
 * invalidates all existing cookies.
 */
export function signAdminToken(issuedAt: number = Date.now()): string {
  const payload = String(issuedAt);
  const sig = createHmac('sha256', env.sessionSecret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifyAdminToken(token: string | undefined): boolean {
  if (!token) return false;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', env.sessionSecret)
    .update(payload)
    .digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyAdminPassword(password: string): boolean {
  const a = Buffer.from(password);
  const b = Buffer.from(env.adminPassword);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function adminCookieOptions(): cookie.CookieSerializeOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd,
    path: '/',
    maxAge: 60 * 60 * 12, // 12 hours
  };
}

export function readAdminCookie(cookieHeader: string | undefined): boolean {
  if (!cookieHeader) return false;
  const parsed = cookie.parse(cookieHeader);
  return verifyAdminToken(parsed[ADMIN_COOKIE]);
}

/** Express middleware guarding admin/host REST endpoints. */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (readAdminCookie(req.headers.cookie)) {
    next();
    return;
  }
  res.status(401).json({ error: 'Not authenticated' });
}
