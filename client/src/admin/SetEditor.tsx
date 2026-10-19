import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { QuestionCard } from './QuestionCard';
import { QuestionPreview } from './QuestionPreview';
import {
  blankQuestion,
  emptyState,
  fromSet,
  toInput,
  validate,
  type EditQuestion,
  type EditState,
} from './editorModel';

export function SetEditor({ mode }: { mode: 'new' | 'edit' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<EditState | null>(
    mode === 'new' ? emptyState() : null,
  );
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const dragIndex = useRef<number | null>(null);

  useEffect(() => {
    if (mode === 'edit' && id) {
      api
        .getSet(id)
        .then((s) => setState(fromSet(s)))
        .catch(() => setServerError('Could not load this set'));
    }
  }, [mode, id]);

  const validation = useMemo(() => (state ? validate(state) : null), [state]);

  if (!state) {
    return <div className="p-10 text-center text-ink/50">{serverError ?? 'Loading…'}</div>;
  }

  const update = (patch: Partial<EditState>) => setState({ ...state, ...patch });
  const updateQuestion = (i: number, q: EditQuestion) =>
    update({ questions: state.questions.map((x, j) => (j === i ? q : x)) });
  const move = (from: number, to: number) => {
    if (to < 0 || to >= state.questions.length) return;
    const qs = [...state.questions];
    const [moved] = qs.splice(from, 1);
    qs.splice(to, 0, moved!);
    update({ questions: qs });
  };

  async function save(thenStart: boolean) {
    setShowErrors(true);
    const v = validate(state!);
    if (!v.ok) return;
    setSaving(true);
    setServerError(null);
    try {
      const input = toInput(state!);
      const saved =
        mode === 'new' || !id
          ? await api.createSet(input)
          : await api.updateSet(id, input);
      if (thenStart) {
        const { sessionId } = await api.startSession(saved.id);
        navigate(`/host/${sessionId}`);
      } else {
        navigate('/admin');
      }
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const previewQuestion = state.questions.find((q) => q.id === previewId) ?? null;

  return (
    <div className="mx-auto max-w-3xl p-6 pb-28">
      <header className="mb-4 flex items-center justify-between">
        <Link to="/admin" className="btn-ghost">
          ← Back
        </Link>
        <h1 className="font-display text-2xl font-bold">
          {mode === 'new' ? 'New set' : 'Edit set'}
        </h1>
        {mode === 'edit' && id ? (
          <a className="btn-ghost" href={api.exportUrl(id)}>
            Export JSON
          </a>
        ) : (
          <span className="w-20" />
        )}
      </header>

      <div className="card mb-4">
        <label className="label">Set title</label>
        <input
          className="input"
          value={state.title}
          placeholder="e.g. Friday Trivia"
          onChange={(e) => update({ title: e.target.value })}
        />
        <label className="label mt-3">Description (optional)</label>
        <input
          className="input"
          value={state.description}
          onChange={(e) => update({ description: e.target.value })}
        />
        <label className="mt-4 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            data-testid="show-voter-names"
            className="mt-1 h-5 w-5 accent-brand"
            checked={state.showVoterNames}
            onChange={(e) => update({ showVoterNames: e.target.checked })}
          />
          <span>
            <span className="font-semibold">Show voter names on results</span>
            <span className="block text-sm text-ink/50">
              After the timer, the host screen lists who chose each option. Off by
              default; the host can still flip this per session. Players are told
              their name will be shown.
            </span>
          </span>
        </label>
        <label className="mt-3 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            data-testid="show-results-summary"
            className="mt-1 h-5 w-5 accent-brand"
            checked={state.showResultsSummary}
            onChange={(e) => update({ showResultsSummary: e.target.checked })}
          />
          <span>
            <span className="font-semibold">Show results summary at the end</span>
            <span className="block text-sm text-ink/50">
              After the last question, show a recap of each poll question's top
              answer. On by default; the host can skip it during the session.
            </span>
          </span>
        </label>
      </div>

      {showErrors && validation && validation.topLevel.length > 0 && (
        <div className="mb-4 rounded-xl bg-brand-50 p-3 text-sm font-medium text-brand-700">
          {validation.topLevel.map((m, i) => (
            <p key={i}>⚠ {m}</p>
          ))}
        </div>
      )}

      <div className="grid gap-4">
        {state.questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            q={q}
            index={i}
            errors={showErrors && validation ? validation.issues : new Map()}
            onChange={(nq) => updateQuestion(i, nq)}
            onRemove={() =>
              update({ questions: state.questions.filter((_, j) => j !== i) })
            }
            onMoveUp={() => move(i, i - 1)}
            onMoveDown={() => move(i, i + 1)}
            onPreview={() => setPreviewId(q.id)}
            dragProps={{
              draggable: true,
              onDragStart: () => (dragIndex.current = i),
              onDragOver: (e) => e.preventDefault(),
              onDrop: () => {
                if (dragIndex.current !== null) move(dragIndex.current, i);
                dragIndex.current = null;
              },
            }}
          />
        ))}
      </div>

      <button
        className="btn-ghost mt-4 w-full border-2 border-dashed border-black/10 py-4"
        onClick={() =>
          update({ questions: [...state.questions, blankQuestion()] })
        }
      >
        + Add question
      </button>

      {serverError && (
        <p className="mt-4 text-sm font-medium text-brand">{serverError}</p>
      )}

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 border-t border-black/10 bg-white/90 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
          <span className="text-sm text-ink/50">
            {state.questions.length} question{state.questions.length === 1 ? '' : 's'}
          </span>
          <div className="flex gap-2">
            <button className="btn-ghost" disabled={saving} onClick={() => void save(false)}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="btn-primary" disabled={saving} onClick={() => void save(true)}>
              Save &amp; start session
            </button>
          </div>
        </div>
      </div>

      {previewQuestion && (
        <QuestionPreview question={previewQuestion} onClose={() => setPreviewId(null)} />
      )}
    </div>
  );
}
