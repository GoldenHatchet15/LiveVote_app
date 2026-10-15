import {
  OPTIONS_MAX,
  OPTIONS_MIN,
  type PointsValue,
  type QuestionMode,
  type TimeLimitSec,
} from '@livevote/shared';
import { Shape, shapeColor } from '../components/Shape';
import {
  POINTS_OPTIONS,
  TIME_OPTIONS,
  uid,
  type EditQuestion,
} from './editorModel';

export function QuestionCard({
  q,
  index,
  errors,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  onPreview,
  dragProps,
}: {
  q: EditQuestion;
  index: number;
  errors: Map<string, string>;
  onChange: (q: EditQuestion) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onPreview: () => void;
  dragProps: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
}) {
  const qKey = `questions.${index}`;
  const qError = errors.get(qKey);

  const set = (patch: Partial<EditQuestion>) => onChange({ ...q, ...patch });

  function setOptionText(i: number, text: string) {
    const options = q.options.map((o, j) => (j === i ? { ...o, text } : o));
    set({ options });
  }
  function toggleCorrect(i: number) {
    const correct = q.correct.includes(i)
      ? q.correct.filter((c) => c !== i)
      : [...q.correct, i];
    set({ correct });
  }
  function addOption() {
    if (q.options.length >= OPTIONS_MAX) return;
    set({ options: [...q.options, { id: uid(), text: '' }] });
  }
  function removeOption(i: number) {
    if (q.options.length <= OPTIONS_MIN) return;
    const options = q.options.filter((_, j) => j !== i);
    // Remap correct indices after removal.
    const correct = q.correct
      .filter((c) => c !== i)
      .map((c) => (c > i ? c - 1 : c));
    set({ options, correct });
  }
  function setMode(mode: QuestionMode) {
    set({ mode, correct: mode === 'POLL' ? [] : q.correct });
  }

  return (
    <div className="card" {...dragProps}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="flex h-8 w-8 cursor-grab items-center justify-center rounded-lg bg-black/5 text-ink/50"
            title="Drag to reorder"
          >
            ⠿
          </span>
          <span className="font-display text-lg font-bold">Question {index + 1}</span>
        </div>
        <div className="flex gap-1">
          <button className="btn-ghost px-2" onClick={onMoveUp} title="Move up">
            ↑
          </button>
          <button className="btn-ghost px-2" onClick={onMoveDown} title="Move down">
            ↓
          </button>
          <button className="btn-ghost" onClick={onPreview}>
            Preview
          </button>
          <button className="btn-ghost text-brand" onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>

      <label className="label">Question text</label>
      <textarea
        className="input"
        rows={2}
        value={q.text}
        placeholder="e.g. What is the capital of France?"
        onChange={(e) => set({ text: e.target.value })}
      />

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Mode</label>
          <div className="flex gap-1">
            {(['QUIZ', 'POLL'] as QuestionMode[]).map((m) => (
              <button
                key={m}
                className={`btn flex-1 ${q.mode === m ? 'bg-ink text-white' : 'bg-black/5 text-ink'}`}
                onClick={() => setMode(m)}
              >
                {m === 'QUIZ' ? 'Quiz' : 'Poll'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Time limit</label>
          <select
            className="input"
            value={String(q.timeLimitSec)}
            onChange={(e) =>
              set({
                timeLimitSec: (e.target.value === 'null'
                  ? null
                  : Number(e.target.value)) as TimeLimitSec,
              })
            }
          >
            {TIME_OPTIONS.map((t) => (
              <option key={String(t.value)} value={String(t.value)}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Points</label>
          <select
            className="input"
            value={q.points}
            disabled={q.mode === 'POLL'}
            onChange={(e) => set({ points: e.target.value as PointsValue })}
          >
            {POINTS_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="label mt-3">Image URL (optional)</label>
      <input
        className="input"
        value={q.imageUrl}
        placeholder="https://…"
        onChange={(e) => set({ imageUrl: e.target.value })}
      />

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between">
          <label className="label mb-0">
            Options{' '}
            {q.mode === 'QUIZ' && (
              <span className="font-normal text-ink/40">· tick the correct one(s)</span>
            )}
          </label>
          {q.options.length < OPTIONS_MAX && (
            <button className="btn-ghost px-2 py-1 text-sm" onClick={addOption}>
              + Add option
            </button>
          )}
        </div>
        <div className="grid gap-2">
          {q.options.map((o, i) => {
            const oErr = errors.get(`${qKey}.options.${i}`);
            return (
              <div key={o.id} className="flex items-center gap-2">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
                  style={{ backgroundColor: shapeColor(i) }}
                >
                  <Shape index={i} className="h-5 w-5 text-white" />
                </span>
                <input
                  className={`input ${oErr ? 'ring-2 ring-brand' : ''}`}
                  value={o.text}
                  placeholder={`Option ${i + 1}`}
                  onChange={(e) => setOptionText(i, e.target.value)}
                />
                {q.mode === 'QUIZ' && (
                  <label
                    className={`btn shrink-0 cursor-pointer ${
                      q.correct.includes(i)
                        ? 'bg-shape-green text-white'
                        : 'bg-black/5 text-ink/60'
                    }`}
                    title="Mark correct"
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={q.correct.includes(i)}
                      onChange={() => toggleCorrect(i)}
                    />
                    {q.correct.includes(i) ? '✓ Correct' : 'Mark'}
                  </label>
                )}
                {q.options.length > OPTIONS_MIN && (
                  <button
                    className="btn-ghost shrink-0 px-2 text-brand"
                    onClick={() => removeOption(i)}
                    title="Remove option"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {qError && <p className="mt-3 text-sm font-medium text-brand">⚠ {qError}</p>}
    </div>
  );
}
