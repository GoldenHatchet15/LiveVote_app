import { useMemo, useState } from 'react';
import {
  normalizeWriteIn,
  OPEN_ENDED_MAX,
  TYPE_ANSWER_MAX,
  WRITE_IN_MAX,
  type AnswerValue,
  type Option,
  type PublicQuestion,
} from '@livevote/shared';
import { Shape, shapeColor } from '../components/Shape';

/** Dispatches to the right input UI for the question's type. */
export function QuestionInput({
  question,
  onAnswer,
}: {
  question: PublicQuestion;
  onAnswer: (value: AnswerValue) => void;
}) {
  return (
    <div className="flex flex-1 flex-col p-3">
      <p className="px-2 py-3 text-center text-lg font-semibold text-ink">{question.text}</p>
      <div className="flex flex-1 flex-col">
        {question.type === 'MULTIPLE_CHOICE' && <OptionButtons q={question} onAnswer={onAnswer} />}
        {question.type === 'TRUE_FALSE' && <TrueFalse q={question} onAnswer={onAnswer} />}
        {question.type === 'MULTI_SELECT' && <MultiSelect q={question} onAnswer={onAnswer} />}
        {question.type === 'ORDERING' && <Ordering q={question} onAnswer={onAnswer} />}
        {question.type === 'SLIDER' && <Slider q={question} onAnswer={onAnswer} />}
        {question.type === 'RATING' && <Rating q={question} onAnswer={onAnswer} />}
        {(question.type === 'TYPE_ANSWER' || question.type === 'OPEN_ENDED') && (
          <TextEntry q={question} onAnswer={onAnswer} />
        )}
        {question.type === 'WRITE_IN' && <WriteIn q={question} onAnswer={onAnswer} />}
      </div>
    </div>
  );
}

function SubmitButton({ disabled, onClick }: { disabled?: boolean; onClick: () => void }) {
  return (
    <button
      data-testid="answer-submit"
      className="btn-primary mt-3 w-full py-4 text-xl"
      disabled={disabled}
      onClick={onClick}
    >
      Submit
    </button>
  );
}

function AnswerTile({
  index,
  text,
  onClick,
  selected,
}: {
  index: number;
  text: string;
  onClick: () => void;
  selected?: boolean;
}) {
  return (
    <button
      data-testid={`answer-${index}`}
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl px-5 py-4 text-left text-white shadow-lg transition active:scale-95"
      style={{
        backgroundColor: shapeColor(index),
        outline: selected ? '4px solid white' : 'none',
        opacity: selected === false ? 0.6 : 1,
      }}
    >
      <Shape index={index} className="h-9 w-9 shrink-0 text-white" />
      <span className="text-xl font-bold leading-tight">{text}</span>
    </button>
  );
}

function OptionButtons({ q, onAnswer }: { q: PublicQuestion; onAnswer: (v: AnswerValue) => void }) {
  return (
    <div className="grid flex-1 grid-cols-1 gap-3">
      {q.options.map((o) => (
        <AnswerTile
          key={o.id}
          index={o.index}
          text={o.text}
          onClick={() => onAnswer({ kind: 'option', optionId: o.id })}
        />
      ))}
    </div>
  );
}

function TrueFalse({ q, onAnswer }: { q: PublicQuestion; onAnswer: (v: AnswerValue) => void }) {
  // Options are stored index 0 = True, 1 = False; labels may be localized.
  const [t, f] = q.options;
  const trueLabel = q.config.trueLabel ?? t?.text ?? 'True';
  const falseLabel = q.config.falseLabel ?? f?.text ?? 'False';
  return (
    <div className="grid flex-1 grid-cols-1 gap-4">
      {t && (
        <AnswerTile index={0} text={trueLabel} onClick={() => onAnswer({ kind: 'option', optionId: t.id })} />
      )}
      {f && (
        <AnswerTile index={3} text={falseLabel} onClick={() => onAnswer({ kind: 'option', optionId: f.id })} />
      )}
    </div>
  );
}

function MultiSelect({ q, onAnswer }: { q: PublicQuestion; onAnswer: (v: AnswerValue) => void }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  return (
    <>
      <div className="grid flex-1 grid-cols-1 gap-3">
        {q.options.map((o) => (
          <AnswerTile
            key={o.id}
            index={o.index}
            text={o.text}
            selected={picked.has(o.id)}
            onClick={() => toggle(o.id)}
          />
        ))}
      </div>
      <SubmitButton disabled={picked.size === 0} onClick={() => onAnswer({ kind: 'options', optionIds: [...picked] })} />
    </>
  );
}

function Ordering({ q, onAnswer }: { q: PublicQuestion; onAnswer: (v: AnswerValue) => void }) {
  const [items, setItems] = useState<Option[]>(() => [...q.options]);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setItems(next);
  };
  return (
    <>
      <p className="mb-2 text-center text-sm text-ink/60">Arrange into the correct order (top = first)</p>
      <ul className="flex flex-1 flex-col gap-2">
        {items.map((o, i) => (
          <li
            key={o.id}
            data-testid={`order-item-${i}`}
            className="flex items-center gap-2 rounded-xl bg-ink px-3 py-3 text-white"
          >
            <span className="w-6 text-center font-black text-white/50">{i + 1}</span>
            <span className="flex-1 truncate font-semibold">{o.text}</span>
            <button
              data-testid={`order-up-${i}`}
              className="rounded-lg bg-white/15 px-3 py-1 text-lg disabled:opacity-30"
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              ↑
            </button>
            <button
              data-testid={`order-down-${i}`}
              className="rounded-lg bg-white/15 px-3 py-1 text-lg disabled:opacity-30"
              disabled={i === items.length - 1}
              onClick={() => move(i, 1)}
            >
              ↓
            </button>
          </li>
        ))}
      </ul>
      <SubmitButton onClick={() => onAnswer({ kind: 'order', order: items.map((o) => o.id) })} />
    </>
  );
}

function Slider({ q, onAnswer }: { q: PublicQuestion; onAnswer: (v: AnswerValue) => void }) {
  const min = q.config.min ?? 0;
  const max = q.config.max ?? 100;
  const step = q.config.step ?? 1;
  const unit = q.config.unit ?? '';
  const [value, setValue] = useState<number>(Math.round((min + max) / 2));
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <div data-testid="slider-value" className="font-display text-6xl font-black text-ink">
        {value}
        {unit ? <span className="ml-1 text-2xl text-ink/50">{unit}</span> : null}
      </div>
      <input
        data-testid="slider-input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="h-3 w-full appearance-none rounded-full bg-black/10 accent-brand"
      />
      <div className="flex w-full justify-between text-sm text-ink/50">
        <span>{min}</span>
        <span>{max}</span>
      </div>
      <SubmitButton onClick={() => onAnswer({ kind: 'number', value })} />
    </div>
  );
}

function Rating({ q, onAnswer }: { q: PublicQuestion; onAnswer: (v: AnswerValue) => void }) {
  const scale = q.config.scale ?? 5;
  const [value, setValue] = useState<number | null>(null);
  const isStars = scale === 5;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      {(q.config.lowLabel || q.config.highLabel) && (
        <div className="flex w-full justify-between text-sm font-semibold text-ink/60">
          <span>{q.config.lowLabel}</span>
          <span>{q.config.highLabel}</span>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {Array.from({ length: scale }, (_, i) => i + 1).map((v) => (
          <button
            key={v}
            data-testid={`rating-${v}`}
            onClick={() => setValue(v)}
            className={`flex h-14 w-14 items-center justify-center rounded-xl text-2xl font-black ${
              value !== null && v <= value && isStars
                ? 'bg-shape-yellow text-white'
                : value === v
                  ? 'bg-brand text-white'
                  : 'bg-black/5 text-ink'
            }`}
          >
            {isStars ? '★' : v}
          </button>
        ))}
      </div>
      <SubmitButton disabled={value === null} onClick={() => onAnswer({ kind: 'number', value: value! })} />
    </div>
  );
}

function TextEntry({ q, onAnswer }: { q: PublicQuestion; onAnswer: (v: AnswerValue) => void }) {
  const max = q.type === 'TYPE_ANSWER' ? TYPE_ANSWER_MAX : OPEN_ENDED_MAX;
  const [text, setText] = useState('');
  const trimmed = useMemo(() => text.trim(), [text]);
  return (
    <div className="flex flex-1 flex-col justify-center gap-3">
      <textarea
        data-testid="text-input"
        className="input min-h-28 w-full resize-none text-lg"
        placeholder={q.type === 'TYPE_ANSWER' ? 'Your answer' : 'Share your thoughts'}
        maxLength={max}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="text-right text-xs text-ink/40">
        {text.length}/{max}
      </div>
      <SubmitButton disabled={trimmed.length === 0} onClick={() => onAnswer({ kind: 'text', text: trimmed })} />
    </div>
  );
}

function WriteIn({ q, onAnswer }: { q: PublicQuestion; onAnswer: (v: AnswerValue) => void }) {
  const max = q.config.maxAnswerLength ?? WRITE_IN_MAX;
  const suggestions = q.config.suggestedAnswers ?? [];
  const onlySuggested = q.config.onlySuggested === true;
  const [text, setText] = useState('');
  const trimmed = text.trim();
  const filtered = useMemo(() => {
    const n = normalizeWriteIn(text);
    const list = n ? suggestions.filter((s) => normalizeWriteIn(s).includes(n)) : suggestions;
    return list.slice(0, 8);
  }, [text, suggestions]);
  const matches = suggestions.some((s) => normalizeWriteIn(s) === normalizeWriteIn(text));
  const canSubmit = trimmed.length > 0 && (!onlySuggested || matches);
  return (
    <div className="flex flex-1 flex-col justify-center gap-3">
      <input
        data-testid="text-input"
        className="input w-full text-lg"
        placeholder={onlySuggested ? 'Search the list…' : 'Type an answer'}
        maxLength={max}
        value={text}
        autoComplete="off"
        list={suggestions.length ? `wi-${q.id}` : undefined}
        onChange={(e) => setText(e.target.value)}
      />
      {suggestions.length > 0 && (
        <datalist id={`wi-${q.id}`}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      {suggestions.length > 0 && filtered.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              data-testid="wi-suggestion"
              className="rounded-full bg-black/5 px-3 py-1 text-sm text-ink"
              onClick={() => setText(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="text-right text-xs text-ink/40">
        {text.length}/{max}
      </div>
      <SubmitButton disabled={!canSubmit} onClick={() => onAnswer({ kind: 'text', text: trimmed })} />
    </div>
  );
}
