import { TYPE_META, toPublicConfig, type PublicQuestion } from '@livevote/shared';
import { QuestionInput } from '../play/QuestionInput';
import type { EditQuestion } from './editorModel';

/** Preview rendered exactly like the player input screen for the question's type. */
export function QuestionPreview({
  question,
  onClose,
}: {
  question: EditQuestion;
  onClose: () => void;
}) {
  const pub: PublicQuestion = {
    id: question.id,
    index: 0,
    total: 1,
    text: question.text || '(question text)',
    imageUrl: question.imageUrl || null,
    mode: question.mode,
    type: question.type,
    config: toPublicConfig(question.type, question.config),
    options: question.options.map((o, i) => ({ id: o.id, text: o.text || `Option ${i + 1}`, index: i })),
    timeLimitSec: question.timeLimitSec,
    points: question.points,
    showVoterNames: false,
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70 p-4" onClick={onClose}>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between text-white">
          <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">
            {TYPE_META[question.type].icon} {TYPE_META[question.type].label} ·{' '}
            {question.mode === 'QUIZ' ? 'Quiz' : 'Poll'}
          </span>
          <button className="btn-ghost text-white" onClick={onClose}>Close preview</button>
        </div>
        <div className="flex flex-1 flex-col overflow-auto rounded-3xl bg-white">
          <QuestionInput question={pub} onAnswer={() => {}} />
        </div>
        <p className="mt-2 text-center text-sm text-white/60">
          This is the player view. Correct answers are never shown before the reveal.
        </p>
      </div>
    </div>
  );
}
