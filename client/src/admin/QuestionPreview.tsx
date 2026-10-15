import { QuestionStage } from '../components/QuestionStage';
import type { EditQuestion } from './editorModel';

/** Full-screen-ish preview rendered like the host question screen. */
export function QuestionPreview({
  question,
  onClose,
}: {
  question: EditQuestion;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70 p-4" onClick={onClose}>
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between text-white">
          <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">
            {question.mode === 'QUIZ' ? 'Quiz' : 'Poll'} ·{' '}
            {question.timeLimitSec === null ? 'No time limit' : `${question.timeLimitSec}s`} ·{' '}
            {question.points === 'STANDARD'
              ? 'Standard'
              : question.points === 'DOUBLE'
                ? 'Double points'
                : 'No points'}
          </span>
          <button className="btn-ghost" onClick={onClose}>
            Close preview
          </button>
        </div>
        <div className="host-screen flex flex-1 items-center justify-center rounded-3xl p-8">
          <QuestionStage
            text={question.text}
            imageUrl={question.imageUrl || null}
            options={question.options.map((o, i) => ({ index: i, text: o.text }))}
            markCorrect={question.mode === 'QUIZ' ? question.correct : undefined}
          />
        </div>
        <p className="mt-2 text-center text-sm text-white/60">
          Correct answers are highlighted here for you; players never see them before the reveal.
        </p>
      </div>
    </div>
  );
}
