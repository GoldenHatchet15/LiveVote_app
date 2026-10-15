import { randomBytes } from 'node:crypto';

/** URL-safe random token for player reconnection. */
export function reconnectToken(): string {
  return randomBytes(24).toString('base64url');
}
