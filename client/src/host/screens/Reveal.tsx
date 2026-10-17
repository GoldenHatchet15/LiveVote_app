import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { PublicQuestion, QuestionResults } from '@livevote/shared';
import { Shape, shapeColor } from '../../components/Shape';
import { sound } from '../../lib/sound';

/** How many voter names to show per option before collapsing into "+N more". */
const MAX_NAMES = 10;

function VoterNames({
  nicknames,
  tone,
}: {
  nicknames: string[];
  tone: 'correct' | 'neutral';
}) {
  const [expanded, setExpanded] = useState(false);
  if (nicknames.length === 0) {
    return <p className="mt-1 text-sm italic text-white/30">No one</p>;
  }
  const shown = expanded ? nicknames : nicknames.slice(0, MAX_NAMES);
  const hidden = nicknames.length - shown.length;
  const chip =
    tone === 'correct'
      ? 'bg-shape-green/25 text-white'
      : 'bg-white/10 text-white/80';
  return (
    <div
      data-testid="voter-names"
      className={`mt-1 flex max-h-28 flex-wrap gap-1.5 overflow-auto ${
        expanded ? 'pr-1' : ''
      }`}
    >
      {shown.map((n, i) => (
        <span key={`${n}-${i}`} className={`rounded-lg px-2 py-0.5 text-sm font-medium ${chip}`}>
          {n}
        </span>
      ))}
      {hidden > 0 && (
        <button
          data-testid="voter-more"
          className="rounded-lg bg-white/5 px-2 py-0.5 text-sm font-semibold text-white/60 hover:bg-white/15"
          onClick={() => setExpanded(true)}
        >
          +{hidden} more
        </button>
      )}
      {expanded && nicknames.length > MAX_NAMES && (
        <button
          className="rounded-lg bg-white/5 px-2 py-0.5 text-sm font-semibold text-white/60 hover:bg-white/15"
          onClick={() => setExpanded(false)}
        >
          Show fewer
        </button>
      )}
    </div>
  );
}

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
  const showNames = results.voters !== undefined && !hideResults;
  const votersByOption = new Map((results.voters ?? []).map((v) => [v.optionId, v.nicknames]));

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
              className="transition-opacity"
              style={{ opacity: dim ? 0.5 : 1 }}
            >
              <div className="flex items-center gap-4">
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
              {showNames && (
                <div className="pl-[4.5rem] pr-24">
                  <VoterNames
                    nicknames={votersByOption.get(opt.id) ?? []}
                    tone={isQuiz && isCorrect ? 'correct' : 'neutral'}
                  />
                </div>
              )}
            </div>
          );
        })}

        {showNames && results.noAnswer && results.noAnswer.length > 0 && (
          <div data-testid="reveal-no-answer" className="pl-[4.5rem] pr-24 text-white/50">
            <span className="text-sm font-semibold uppercase tracking-wide">No answer</span>
            <VoterNames nicknames={results.noAnswer} tone="neutral" />
          </div>
        )}
      </div>

      <p className="mt-8 text-center text-lg text-white/40">
        {results.totalAnswers} of {results.totalPlayers} answered
        {hideResults ? ' · results hidden (press R to show)' : ''}
      </p>
    </div>
  );
}
