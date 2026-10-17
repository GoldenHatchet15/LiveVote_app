import { motion } from 'framer-motion';
import type { LeaderboardEntry } from '@livevote/shared';
import { Emoji } from '../../components/Emoji';

export function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  const top = entries.slice(0, 5);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="mb-10 font-display text-6xl font-extrabold text-white">
        Leaderboard
      </h1>
      <div className="flex w-full max-w-3xl flex-col gap-3">
        {top.map((e, i) => (
          <motion.div
            key={e.playerId}
            data-testid="lb-row"
            data-rank={e.rank}
            layout
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08, type: 'spring', stiffness: 400, damping: 28 }}
            className="flex items-center gap-4 rounded-2xl bg-white/10 px-6 py-4"
          >
            <span className="w-10 font-display text-3xl font-black text-brand">
              {e.rank}
            </span>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: e.color }}>
              <Emoji emoji={e.avatarEmoji} className="h-7 w-7" />
            </span>
            <span
              data-testid="lb-name"
              className="flex-1 truncate text-2xl font-bold text-white"
            >
              {e.nickname}
            </span>
            {e.lastGain > 0 && (
              <span className="rounded-full bg-shape-green/90 px-3 py-1 text-lg font-bold text-white">
                +{e.lastGain}
              </span>
            )}
            <span className="w-28 text-right font-display text-3xl font-black text-white">
              {e.score}
            </span>
          </motion.div>
        ))}
        {top.length === 0 && (
          <p className="text-center text-xl text-white/50">No scores yet.</p>
        )}
      </div>
    </div>
  );
}
