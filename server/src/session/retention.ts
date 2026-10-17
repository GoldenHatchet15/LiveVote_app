import { prisma } from '../db.js';
import { env } from '../env.js';

/**
 * Privacy / data retention (M6): delete player data for sessions older than the
 * retention window. Deleting the Session row cascades to its players and their
 * answers. Returns the number of sessions removed.
 */
export async function purgeExpiredSessions(days: number = env.dataRetentionDays): Promise<number> {
  if (!Number.isFinite(days) || days <= 0) return 0;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await prisma.session.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return result.count;
}

/** Run the purge now and then once a day. Returns the interval handle. */
export function startRetentionSweep(): NodeJS.Timeout {
  void purgeExpiredSessions().catch(() => {});
  const handle = setInterval(() => void purgeExpiredSessions().catch(() => {}), 24 * 60 * 60 * 1000);
  handle.unref(); // don't keep the process alive just for the sweep
  return handle;
}
