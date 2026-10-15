import { useEffect, useRef } from 'react';
import type { PublicQuestion } from '@livevote/shared';
import { QuestionStage } from '../../components/QuestionStage';
import { useCountdown } from '../../lib/useCountdown';
import { sound } from '../../lib/sound';

export function Question({
  question,
  serverNow,
  endsAt,
  answered,
  total,
}: {
  question: PublicQuestion;
  serverNow: number | null;
  endsAt: number | null;
  answered: number;
  total: number;
}) {
  const totalMs = question.timeLimitSec ? question.timeLimitSec * 1000 : null;
  const { remainingSec, fraction } = useCountdown(endsAt, serverNow, totalMs);
  const lastTick = useRef<number>(Infinity);

  useEffect(() => {
    if (!Number.isFinite(remainingSec)) return;
    if (remainingSec <= 5 && remainingSec >= 1 && remainingSec < lastTick.current) {
      sound.tick();
    }
    if (remainingSec === 0 && lastTick.current > 0) sound.timesUp();
    lastTick.current = remainingSec;
  }, [remainingSec]);

  const R = 52;
  const C = 2 * Math.PI * R;

  return (
    <div className="flex min-h-screen flex-col p-8 pb-20">
      <div className="mb-4 flex items-center justify-between">
        {/* Countdown ring */}
        {totalMs ? (
          <div className="relative h-32 w-32">
            <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90">
              <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="12" />
              <circle
                cx="60"
                cy="60"
                r={R}
                fill="none"
                stroke="#e4002b"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - fraction)}
                style={{ transition: 'stroke-dashoffset 0.1s linear' }}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center font-display text-4xl font-black text-white">
              {Number.isFinite(remainingSec) ? remainingSec : ''}
            </span>
          </div>
        ) : (
          <span className="rounded-full bg-white/10 px-5 py-2 text-xl font-semibold text-white/70">
            No time limit
          </span>
        )}

        <div className="text-right">
          <p className="font-display text-5xl font-black text-white">
            {answered}
            <span className="text-white/40">/{total}</span>
          </p>
          <p className="text-lg font-semibold uppercase tracking-wide text-white/50">
            answers in
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-5xl">
          <QuestionStage
            text={question.text}
            imageUrl={question.imageUrl}
            options={question.options.map((o) => ({ index: o.index, text: o.text }))}
          />
        </div>
      </div>

      <p className="mt-4 text-center text-lg text-white/40">
        Question {question.index + 1} of {question.total} · Answer on your phone
      </p>
    </div>
  );
}
