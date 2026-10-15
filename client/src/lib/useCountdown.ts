import { useEffect, useRef, useState } from 'react';

/**
 * Display-only countdown. The server is authoritative for when a question ends;
 * this hook just renders a smooth clock based on the server's `endsAt` and an
 * estimated clock offset so late-joining clients still show the right time.
 *
 * @param endsAt    server timestamp (ms) when the question ends, or null
 * @param serverNow the server's clock when it sent endsAt (for offset estimate)
 * @param totalMs   full duration, used for the progress fraction (0..1)
 */
export function useCountdown(
  endsAt: number | null,
  serverNow: number | null,
  totalMs: number | null,
): { remainingMs: number; remainingSec: number; fraction: number } {
  const offsetRef = useRef(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (serverNow != null) offsetRef.current = serverNow - Date.now();
  }, [serverNow, endsAt]);

  useEffect(() => {
    if (endsAt == null) return;
    let raf = 0;
    const tick = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [endsAt]);

  if (endsAt == null) {
    return { remainingMs: Infinity, remainingSec: Infinity, fraction: 1 };
  }
  const estimatedNow = now + offsetRef.current;
  const remainingMs = Math.max(0, endsAt - estimatedNow);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const fraction = totalMs && totalMs > 0 ? Math.min(1, remainingMs / totalMs) : 0;
  return { remainingMs, remainingSec, fraction };
}
