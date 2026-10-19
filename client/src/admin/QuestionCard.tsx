import {
  QUESTION_TYPES,
  TYPE_META,
  TYPE_MODES,
  TYPE_USES_OPTIONS,
  type PointsValue,
  type QuestionConfig,
  type QuestionMode,
  type QuestionType,
  type TimeLimitSec,
} from '@livevote/shared';
import { Shape, shapeColor } from '../components/Shape';
import { POINTS_OPTIONS, TIME_OPTIONS, uid, type EditQuestion } from './editorModel';

/** Per-type option-count bounds (mirrors the server schema). */
const OPTION_BOUNDS: Record<QuestionType, { min: number; max: number }> = {
  MULTIPLE_CHOICE: { min: 2, max: 4 },
  MULTI_SELECT: { min: 2, max: 6 },
  TRUE_FALSE: { min: 2, max: 2 },
  ORDERING: { min: 3, max: 5 },
  TYPE_ANSWER: { min: 0, max: 0 },
  OPEN_ENDED: { min: 0, max: 0 },
  SLIDER: { min: 0, max: 0 },
  RATING: { min: 0, max: 0 },
  WRITE_IN: { min: 0, max: 0 },
};

/** Fresh options/config/correct when switching to a type. */
function defaultsForType(type: QuestionType): Pick<EditQuestion, 'options' | 'config' | 'correct'> {
  const opt = (text = '') => ({ id: uid(), text });
  switch (type) {
    case 'MULTIPLE_CHOICE':
    case 'MULTI_SELECT':
      return { options: [opt(), opt()], config: {}, correct: [] };
    case 'TRUE_FALSE':
      return { options: [opt('True'), opt('False')], config: { trueLabel: 'True', falseLabel: 'False' }, correct: [] };
    case 'ORDERING':
      return { options: [opt(), opt(), opt()], config: {}, correct: [] };
    case 'TYPE_ANSWER':
      return { options: [], config: { acceptedAnswers: [''], exactMatch: false }, correct: [] };
    case 'OPEN_ENDED':
      return { options: [], config: { revealStyle: 'WORD_CLOUD' }, correct: [] };
    case 'SLIDER':
      return { options: [], config: { min: 0, max: 100, step: 1, unit: '', correctValue: 50, tolerance: 5 }, correct: [] };
    case 'RATING':
      return { options: [], config: { scale: 5, lowLabel: '', highLabel: '' }, correct: [] };
    case 'WRITE_IN':
      return {
        options: [],
        config: { suggestedAnswers: [], onlySuggested: false, maxAnswerLength: 40, reviewBeforeReveal: false },
        correct: [],
      };
  }
}

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
  const bounds = OPTION_BOUNDS[q.type];
  const usesOptions = TYPE_USES_OPTIONS[q.type];
  const single = q.type === 'MULTIPLE_CHOICE' || q.type === 'TRUE_FALSE';

  const set = (patch: Partial<EditQuestion>) => onChange({ ...q, ...patch });
  const setConfig = (patch: Partial<QuestionConfig>) => set({ config: { ...q.config, ...patch } });

  function changeType(type: QuestionType) {
    if (type === q.type) return;
    const hadContent = q.options.some((o) => o.text.trim()) || Object.keys(q.config).length > 0;
    if (hadContent && !confirm('Changing the question type will clear its options and settings. Continue?')) {
      return;
    }
    const d = defaultsForType(type);
    const mode = TYPE_MODES[type].includes(q.mode) ? q.mode : TYPE_MODES[type][0]!;
    onChange({ ...q, type, mode, ...d });
  }

  function setOptionText(i: number, text: string) {
    set({ options: q.options.map((o, j) => (j === i ? { ...o, text } : o)) });
  }
  function toggleCorrect(i: number) {
    if (single) {
      set({ correct: [i] });
      return;
    }
    const correct = q.correct.includes(i) ? q.correct.filter((c) => c !== i) : [...q.correct, i];
    set({ correct });
  }
  function addOption() {
    if (q.options.length >= bounds.max) return;
    set({ options: [...q.options, { id: uid(), text: '' }] });
  }
  function removeOption(i: number) {
    if (q.options.length <= bounds.min) return;
    const options = q.options.filter((_, j) => j !== i);
    const correct = q.correct.filter((c) => c !== i).map((c) => (c > i ? c - 1 : c));
    set({ options, correct });
  }
  function setMode(mode: QuestionMode) {
    set({ mode, correct: mode === 'POLL' ? [] : q.correct });
  }

  const optionLabel =
    q.type === 'ORDERING'
      ? 'Items in the correct order (players see them shuffled)'
      : q.type === 'TRUE_FALSE'
        ? 'Labels'
        : q.mode === 'QUIZ'
          ? `Options · ${single ? 'pick the correct one' : 'tick the correct one(s)'}`
          : 'Options';

  return (
    <div className="card" {...dragProps}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 cursor-grab items-center justify-center rounded-lg bg-black/5 text-ink/50" title="Drag to reorder">
            ⠿
          </span>
          <span className="font-display text-lg font-bold">Question {index + 1}</span>
        </div>
        <div className="flex gap-1">
          <button className="btn-ghost px-2" onClick={onMoveUp} title="Move up">↑</button>
          <button className="btn-ghost px-2" onClick={onMoveDown} title="Move down">↓</button>
          <button className="btn-ghost" onClick={onPreview}>Preview</button>
          <button className="btn-ghost text-brand" onClick={onRemove}>Remove</button>
        </div>
      </div>

      <label className="label">Question type</label>
      <select
        className="input"
        data-testid="type-picker"
        value={q.type}
        onChange={(e) => changeType(e.target.value as QuestionType)}
      >
        {QUESTION_TYPES.map((t) => (
          <option key={t} value={t}>
            {TYPE_META[t].icon} {TYPE_META[t].label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-sm text-ink/50">{TYPE_META[q.type].blurb}</p>

      <label className="label mt-3">Question text</label>
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
            {TYPE_MODES[q.type].map((m) => (
              <button
                key={m}
                className={`btn flex-1 ${q.mode === m ? 'bg-ink text-white' : 'bg-black/5 text-ink'}`}
                onClick={() => setMode(m)}
              >
                {m === 'QUIZ' ? 'Quiz' : 'Poll'}
              </button>
            ))}
            {TYPE_MODES[q.type].length === 1 && (
              <span className="flex flex-1 items-center justify-center rounded-lg bg-black/5 text-sm text-ink/40">
                only
              </span>
            )}
          </div>
        </div>
        <div>
          <label className="label">Time limit</label>
          <select
            className="input"
            value={String(q.timeLimitSec)}
            onChange={(e) =>
              set({ timeLimitSec: (e.target.value === 'null' ? null : Number(e.target.value)) as TimeLimitSec })
            }
          >
            {TIME_OPTIONS.map((t) => (
              <option key={String(t.value)} value={String(t.value)}>{t.label}</option>
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
              <option key={p.value} value={p.value}>{p.label}</option>
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

      {/* Options editor (option-based types) */}
      {usesOptions && (
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between">
            <label className="label mb-0">{optionLabel}</label>
            {q.options.length < bounds.max && q.type !== 'TRUE_FALSE' && (
              <button className="btn-ghost px-2 py-1 text-sm" onClick={addOption}>+ Add option</button>
            )}
          </div>
          <div className="grid gap-2">
            {q.options.map((o, i) => {
              const oErr = errors.get(`${qKey}.options.${i}`);
              const showCorrect = q.mode === 'QUIZ' && (q.type === 'MULTIPLE_CHOICE' || q.type === 'MULTI_SELECT' || q.type === 'TRUE_FALSE');
              return (
                <div key={o.id} className="flex items-center gap-2">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
                    style={{ backgroundColor: shapeColor(q.type === 'TRUE_FALSE' ? (i === 0 ? 0 : 3) : i) }}
                  >
                    {q.type === 'ORDERING' ? <span className="font-black">{i + 1}</span> : <Shape index={i} className="h-5 w-5 text-white" />}
                  </span>
                  <input
                    className={`input ${oErr ? 'ring-2 ring-brand' : ''}`}
                    value={o.text}
                    placeholder={q.type === 'TRUE_FALSE' ? (i === 0 ? 'True label' : 'False label') : `Option ${i + 1}`}
                    onChange={(e) => {
                      setOptionText(i, e.target.value);
                      if (q.type === 'TRUE_FALSE') setConfig(i === 0 ? { trueLabel: e.target.value } : { falseLabel: e.target.value });
                    }}
                  />
                  {showCorrect && (
                    <label
                      className={`btn shrink-0 cursor-pointer ${q.correct.includes(i) ? 'bg-shape-green text-white' : 'bg-black/5 text-ink/60'}`}
                      title="Mark correct"
                    >
                      <input
                        type={single ? 'radio' : 'checkbox'}
                        name={single ? `correct-${q.id}` : undefined}
                        className="sr-only"
                        checked={q.correct.includes(i)}
                        onChange={() => toggleCorrect(i)}
                      />
                      {q.correct.includes(i) ? '✓ Correct' : 'Mark'}
                    </label>
                  )}
                  {q.options.length > bounds.min && q.type !== 'TRUE_FALSE' && (
                    <button className="btn-ghost shrink-0 px-2 text-brand" onClick={() => removeOption(i)} title="Remove option">
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-type config */}
      <TypeConfig q={q} setConfig={setConfig} />

      {qError && <p className="mt-3 text-sm font-medium text-brand">⚠ {qError}</p>}
    </div>
  );
}

function TypeConfig({
  q,
  setConfig,
}: {
  q: EditQuestion;
  setConfig: (p: Partial<QuestionConfig>) => void;
}) {
  if (q.type === 'TYPE_ANSWER') {
    const answers = q.config.acceptedAnswers ?? [''];
    const setAnswers = (next: string[]) => setConfig({ acceptedAnswers: next });
    return (
      <div className="mt-4">
        <label className="label">Accepted answers</label>
        <div className="grid gap-2">
          {answers.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className="input"
                data-testid={`accepted-${i}`}
                value={a}
                placeholder={`Accepted answer ${i + 1}`}
                onChange={(e) => setAnswers(answers.map((x, j) => (j === i ? e.target.value : x)))}
              />
              {answers.length > 1 && (
                <button className="btn-ghost px-2 text-brand" onClick={() => setAnswers(answers.filter((_, j) => j !== i))}>✕</button>
              )}
            </div>
          ))}
        </div>
        <button className="btn-ghost mt-2 px-2 py-1 text-sm" onClick={() => setAnswers([...answers, ''])}>+ Add accepted answer</button>
        <label className="mt-3 flex cursor-pointer items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-brand" checked={q.config.exactMatch ?? false} onChange={(e) => setConfig({ exactMatch: e.target.checked })} />
          <span className="text-sm">Exact match (case/accents/spaces matter)</span>
        </label>
      </div>
    );
  }

  if (q.type === 'OPEN_ENDED') {
    return (
      <div className="mt-4">
        <label className="label">Reveal style</label>
        <div className="flex gap-2">
          {(['WORD_CLOUD', 'ANSWER_WALL'] as const).map((style) => (
            <button
              key={style}
              data-testid={`reveal-${style}`}
              className={`btn flex-1 ${q.config.revealStyle === style ? 'bg-ink text-white' : 'bg-black/5 text-ink'}`}
              onClick={() => setConfig({ revealStyle: style })}
            >
              {style === 'WORD_CLOUD' ? 'Word cloud' : 'Answer wall'}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (q.type === 'SLIDER') {
    const num = (v: string) => (v === '' ? undefined : Number(v));
    return (
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Min</label>
          <input className="input" type="number" data-testid="slider-min" value={q.config.min ?? ''} onChange={(e) => setConfig({ min: num(e.target.value) })} />
        </div>
        <div>
          <label className="label">Max</label>
          <input className="input" type="number" data-testid="slider-max" value={q.config.max ?? ''} onChange={(e) => setConfig({ max: num(e.target.value) })} />
        </div>
        <div>
          <label className="label">Step</label>
          <input className="input" type="number" value={q.config.step ?? ''} onChange={(e) => setConfig({ step: num(e.target.value) })} />
        </div>
        <div>
          <label className="label">Unit (optional)</label>
          <input className="input" value={q.config.unit ?? ''} placeholder="kg, %, …" onChange={(e) => setConfig({ unit: e.target.value || null })} />
        </div>
        {q.mode === 'QUIZ' && (
          <>
            <div>
              <label className="label">Correct value</label>
              <input className="input" type="number" data-testid="slider-correct" value={q.config.correctValue ?? ''} onChange={(e) => setConfig({ correctValue: num(e.target.value) ?? null })} />
            </div>
            <div>
              <label className="label">Tolerance (±)</label>
              <input className="input" type="number" value={q.config.tolerance ?? ''} onChange={(e) => setConfig({ tolerance: num(e.target.value) ?? null })} />
            </div>
          </>
        )}
      </div>
    );
  }

  if (q.type === 'RATING') {
    return (
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Scale</label>
          <div className="flex gap-1">
            {([5, 10] as const).map((s) => (
              <button
                key={s}
                className={`btn flex-1 ${(q.config.scale ?? 5) === s ? 'bg-ink text-white' : 'bg-black/5 text-ink'}`}
                onClick={() => setConfig({ scale: s })}
              >
                {s === 5 ? '1–5 ★' : '1–10'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Low label (optional)</label>
          <input className="input" value={q.config.lowLabel ?? ''} placeholder="Not at all" onChange={(e) => setConfig({ lowLabel: e.target.value || null })} />
        </div>
        <div>
          <label className="label">High label (optional)</label>
          <input className="input" value={q.config.highLabel ?? ''} placeholder="Totally" onChange={(e) => setConfig({ highLabel: e.target.value || null })} />
        </div>
      </div>
    );
  }

  if (q.type === 'WRITE_IN') {
    const suggestions = q.config.suggestedAnswers ?? [];
    const setSuggestions = (next: string[]) => setConfig({ suggestedAnswers: next });
    return (
      <div className="mt-4">
        <label className="label">Suggested answers (optional — e.g. a class roster)</label>
        <p className="mb-2 text-sm text-ink/50">Players get autocomplete; a matching answer uses the suggested spelling as its label.</p>
        <div className="grid gap-2">
          {suggestions.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className="input"
                data-testid={`suggested-${i}`}
                value={a}
                placeholder={`Suggested answer ${i + 1}`}
                onChange={(e) => setSuggestions(suggestions.map((x, j) => (j === i ? e.target.value : x)))}
              />
              <button className="btn-ghost px-2 text-brand" onClick={() => setSuggestions(suggestions.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
        </div>
        <button className="btn-ghost mt-2 px-2 py-1 text-sm" onClick={() => setSuggestions([...suggestions, ''])}>+ Add suggested answer</button>

        <div className="mt-3 grid gap-2">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-brand" checked={q.config.onlySuggested ?? false} onChange={(e) => setConfig({ onlySuggested: e.target.checked })} />
            <span className="text-sm">Allow only suggested answers (pick from the list)</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-brand" checked={q.config.reviewBeforeReveal ?? false} onChange={(e) => setConfig({ reviewBeforeReveal: e.target.checked })} />
            <span className="text-sm">Review answers before showing the reveal</span>
          </label>
          <div>
            <label className="label">Max answer length</label>
            <input
              className="input w-28"
              type="number"
              min={1}
              max={120}
              value={q.config.maxAnswerLength ?? 40}
              onChange={(e) => setConfig({ maxAnswerLength: e.target.value === '' ? undefined : Number(e.target.value) })}
            />
          </div>
        </div>
      </div>
    );
  }

  return null;
}
