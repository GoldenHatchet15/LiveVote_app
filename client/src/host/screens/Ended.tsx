import { useEffect } from 'react';
import { motion } from 'framer-motion';
import type { LeaderboardEntry } from '@livevote/shared';
import { Confetti } from '../../components/Confetti';
import { sound } from '../../lib/sound';

const PODIUM = [
  { place: 1, h: 'h-56', color: '#f2b705', label: '1st' },
  { place: 2, h: 'h-44', color: '#9ca3af', label: '2nd' },
  { place: 3, h: 'h-36', color: '#b45309', label: '3rd' },
];

export function Ended({
  podium,
  full,
  csvUrl,
}: {
  podium: LeaderboardEntry[];
  full: LeaderboardEntry[];
  csvUrl: string;
}) {
  const scored = full.some((e) => e.score > 0);
  useEffect(() => {
    if (scored) sound.podium();
  }, [scored]);

  if (!scored) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
        <h1 className="font-display text-6xl font-extrabold text-white">
          Thanks for playing!
        </h1>
        <p className="text-2xl text-white/60">{full.length} people took part.</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <a className="btn-ghost" href={csvUrl}>
            Download results (CSV)
          </a>
          <a className="btn-ghost" href="/admin">
            Back to dashboard
          </a>
        </div>
      </div>
    );
  }

  // Order podium as 2nd, 1st, 3rd for the classic stage layout.
  const byPlace = new Map(podium.map((p, i) => [i + 1, p]));
  const stage = [2, 1, 3];

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-10 p-8">
      <Confetti />
      <h1 className="font-display text-6xl font-extrabold text-white">Final results</h1>

      <div data-testid="podium" className="flex items-end justify-center gap-4">
        {stage.map((place) => {
          const entry = byPlace.get(place);
          const meta = PODIUM.find((p) => p.place === place)!;
          if (!entry) return <div key={place} className="w-40" />;
          return (
            <motion.div
              key={place}
              initial={{ y: 120, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: (3 - place) * 0.25, type: 'spring', stiffness: 300, damping: 26 }}
              className="flex w-40 flex-col items-center"
            >
              <span className="mb-2 max-w-full truncate text-2xl font-bold text-white">
                {entry.nickname}
              </span>
              <span className="mb-2 font-display text-3xl font-black text-white">
                {entry.score}
              </span>
              <div
                className={`flex w-full items-start justify-center rounded-t-2xl pt-3 ${meta.h}`}
                style={{ backgroundColor: meta.color }}
              >
                <span className="font-display text-4xl font-black text-white/90">
                  {meta.label}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="w-full max-w-xl">
        <div className="mb-3 flex flex-wrap justify-center gap-3">
          <a className="btn-ghost" href={csvUrl}>
            Download results (CSV)
          </a>
          <a className="btn-ghost" href="/admin">
            Back to dashboard
          </a>
        </div>
        <div className="max-h-[22vh] overflow-auto rounded-2xl bg-white/5">
          {full.map((e) => (
            <div
              key={e.playerId}
              className="flex items-center gap-3 border-b border-white/5 px-4 py-2 text-white/80 last:border-0"
            >
              <span className="w-8 font-bold text-white/50">{e.rank}</span>
              <span className="flex-1 truncate">{e.nickname}</span>
              <span className="font-bold">{e.score}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
