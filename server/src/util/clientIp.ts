import type { IncomingHttpHeaders } from 'node:http';
import { env } from '../env.js';

/**
 * Resolve the real client IP for rate limiting. Behind Cloudflare (TRUST_PROXY=true)
 * the only trustworthy source is the `CF-Connecting-IP` header; when NOT behind a
 * known proxy we must never trust forwarding headers (they are client-spoofable),
 * so we use the direct socket address (M2).
 */
export function resolveClientIp(
  headers: IncomingHttpHeaders,
  directAddress: string | undefined,
): string {
  if (env.trustProxy) {
    const cf = headers['cf-connecting-ip'];
    if (typeof cf === 'string' && cf.trim()) return cf.trim();
  }
  return directAddress ?? 'unknown';
}
