import { useEffect } from 'react';
import { motion } from 'framer-motion';
import type { PublicQuestion, QuestionResults } from '@livevote/shared';
import { Shape, shapeColor } from '../../components/Shape';
import { sound } from '../../lib/sound';

export function Reveal({
  question,
  results,
  hideResults,
}: {
  question: PublicQuestion;
  results: QuestionResults;
  hideResults: boolean;
}) {
  useEffect(() => {
    sound.reveal();
  }, [results.questionId]);

  const correct = new Set(results.correctOptionIds);
  const isQuiz = results.mode === 'QUIZ';
  const maxCount = Math.max(1, ...results.tallies.map((t) => t.count));

  return (
    <div className="flex min-h-screen flex-col justify-center p-8">
      <h2 className="mb-8 text-center text-3xl font-bold text-white xl:text-4xl">
        {question.text}
      </h2>

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        {question.options.map((opt) => {
          const tally = results.tallies.find((t) => t.optionId === opt.id);
          const count = tally?.count ?? 0;
          const percent = tally?.percent ?? 0;
          const isCorrect = correct.has(opt.id);
          const dim = isQuiz && !isCorrect;
          return (
            <div
              key={opt.id}
              data-testid="reveal-option"
              data-correct={isQuiz && isCorrect ? 'true' : 'false'}
              data-count={count}
              className="flex items-center gap-4 transition-opacity"
              style={{ opacity: dim ? 0.5 : 1 }}
            >
              <span
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-white shadow"
                style={{ backgroundColor: shapeColor(opt.index) }}
              >
                <Shape index={opt.index} className="h-7 w-7 text-white" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2 text-white">
                  <span className="truncate text-xl font-semibold">{opt.text}</span>
                  {isQuiz && isCorrect && (
                    <span
                      data-testid="reveal-correct"
                      className="rounded-full bg-shape-green px-2 py-0.5 text-sm font-bold"
                    >
                      ✓ Correct
                    </span>
                  )}
                </div>
                <div className="h-12 overflow-hidden rounded-xl bg-white/10">
                  <motion.div
                    className="flex h-full items-center justify-end rounded-xl pr-3 text-lg font-bold text-white"
                    style={{ backgroundColor: shapeColor(opt.index) }}
                    initial={{ width: 0 }}
                    animate={{
                      width: hideResults
                        ? 0
                        : `${Math.max((count / maxCount) * 100, count > 0 ? 8 : 0)}%`,
                    }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                  >
                    {!hideResults && count > 0 && count}
                  </motion.div>
                </div>
              </div>
              <span className="w-24 shrink-0 text-right text-2xl font-black text-white">
                {hideResults ? '—' : `${percent}%`}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-center text-lg text-white/40">
        {results.totalAnswers} of {results.totalPlayers} answered
        {hideResults ? ' · results hidden (press R to show)' : ''}
      </p>
    </div>
  );
}
