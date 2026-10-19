import { useState } from 'react';
import { motion } from 'framer-motion';
import type { QuestionSummary } from '@livevote/shared';
import { Confetti } from '../../components/Confetti';
import { NameTag } from '../../components/NameTag';
import { downloadResultsImage } from './resultsImage';

const MAX_NAMES = 8;

/** End-of-session results summary: one card per poll question with its top answer(s). */
export function Summary({ summary }: { summary: QuestionSummary[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="relative flex min-h-screen flex-col p-8">
      <Confetti />
      <div className="mb-6 flex items-center justify-center gap-4">
        <h1 className="text-center font-display text-5xl font-extrabold text-white">Results</h1>
        {summary.length > 0 && (
          <button
            data-testid="download-results-image"
            className="btn-ghost text-sm"
            onClick={() => downloadResultsImage(summary)}
          >
            📸 Download image
          </button>
        )}
      </div>
      {summary.length === 0 ? (
        <p className="text-center text-white/50">No poll questions in this session.</p>
      ) : (
        <div className="mx-auto grid w-full max-w-6xl flex-1 content-start gap-4 overflow-auto sm:grid-cols-2 lg:grid-cols-3">
          {summary.map((card, i) => {
            const isOpen = expanded === card.questionId;
            return (
              <motion.div
                key={card.questionId}
                data-testid="summary-card"
                initial={{ rotateY: 90, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                transition={{ delay: i * 0.2, type: 'spring', stiffness: 220, damping: 22 }}
                onClick={() => setExpanded(isOpen ? null : card.questionId)}
                className={`cursor-pointer rounded-2xl bg-white/10 p-4 transition ${
                  isOpen ? 'ring-2 ring-shape-yellow sm:col-span-2 lg:col-span-3' : 'hover:bg-white/15'
                }`}
              >
                <p className="mb-2 font-semibold text-white">{card.text}</p>
                {card.winners.length === 0 ? (
                  <p className="text-white/40">No votes.</p>
                ) : (
                  <div className="grid gap-2">
                    {card.tie && (
                      <span data-testid="summary-tie" className="text-sm font-bold uppercase tracking-wide text-shape-yellow">
                        Tie
                      </span>
                    )}
                    {card.winners.map((w, j) => (
                      <div key={j} data-testid="summary-winner">
                        <div className="flex items-center gap-2 text-white">
                          <span className="text-lg">👑</span>
                          <span className={`min-w-0 flex-1 text-lg font-bold ${isOpen ? '' : 'truncate'}`}>{w.label}</span>
                          <span className="shrink-0 text-white/70">
                            {w.count} · {w.percent}%
                          </span>
                        </div>
                        {w.voters && w.voters.length > 0 && (
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {(isOpen ? w.voters : w.voters.slice(0, MAX_NAMES)).map((v, k) => (
                              <NameTag key={k} nickname={v.nickname} avatarEmoji={v.avatarEmoji} color={v.color} size="sm" />
                            ))}
                            {!isOpen && w.voters.length > MAX_NAMES && (
                              <span className="text-sm text-white/50">+{w.voters.length - MAX_NAMES} more</span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
