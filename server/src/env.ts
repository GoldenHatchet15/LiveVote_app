import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

const isProd = process.env.NODE_ENV === 'production';

/** A hashed admin password is preferred; a plaintext one is a dev fallback. */
const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH ?? '';

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd,
  port: Number(process.env.PORT ?? 3000),
  // In production a hash OR a password must be provided (no built-in default).
  adminPassword: adminPasswordHash
    ? (process.env.ADMIN_PASSWORD ?? '')
    : required('ADMIN_PASSWORD', isProd ? undefined : 'changeme'),
  adminPasswordHash,
  sessionSecret: required(
    'SESSION_SECRET',
    isProd ? undefined : 'dev-insecure-secret-change-me',
  ),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000',
  corsOrigins: (process.env.CORS_ORIGINS ??
    'http://localhost:5173,http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  /** Trust Cloudflare's CF-Connecting-IP for the real client IP (prod behind CF). */
  trustProxy: process.env.TRUST_PROXY === 'true',
  /** Auto-delete a session's player data after this many days (privacy). */
  dataRetentionDays: Number(process.env.DATA_RETENTION_DAYS ?? 30),
  /** Abuse caps. */
  maxPlayersPerSession: Number(process.env.MAX_PLAYERS_PER_SESSION ?? 300),
  maxActiveSessions: Number(process.env.MAX_ACTIVE_SESSIONS ?? 100),
};

export type Env = typeof env;
