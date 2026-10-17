import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import * as cookie from 'cookie';
import { env } from './env.js';

export const ADMIN_COOKIE = 'lv_admin';

/** Server-side session lifetime; a cookie older than this is rejected even if
 *  its signature is valid (H3 — the browser maxAge alone is not enforcement). */
export const ADMIN_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function constantTimeEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Verify a password against a scrypt hash of the form
 * `scrypt:<saltHex>:<hashHex>` (legacy `$` delimiters are also accepted).
 * scrypt is a strong KDF built into Node (no native dependency).
 */
export function verifyScrypt(password: string, stored: string): boolean {
  // Accept ':' (preferred — Docker-Compose-safe) or legacy '$' separators.
  const parts = stored.split(/[:$]/);
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, saltHex, hashHex] = parts;
  try {
    const salt = Buffer.from(saltHex!, 'hex');
    const expected = Buffer.from(hashHex!, 'hex');
    const actual = scryptSync(password, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

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
  if (!constantTimeEquals(sig, expected)) return false;
  // Enforce server-side expiry (H3): reject stale or malformed timestamps.
  const issuedAt = Number(payload);
  if (!Number.isFinite(issuedAt)) return false;
  const age = Date.now() - issuedAt;
  if (age < -60_000 || age > ADMIN_SESSION_MAX_AGE_MS) return false;
  return true;
}

export function verifyAdminPassword(password: string): boolean {
  if (typeof password !== 'string' || password.length === 0) return false;
  // Prefer a hashed password (M1); fall back to a constant-time plaintext compare.
  if (env.adminPasswordHash) {
    return verifyScrypt(password, env.adminPasswordHash);
  }
  return constantTimeEquals(password, env.adminPassword);
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
