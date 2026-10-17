/**
 * Type-generic answer validation and reveal-payload building. Pure functions
 * (no engine state) so they're easy to unit-test. The engine calls these for
 * every question type.
 */
import {
  ErrorCodes,
  gradeAnswer,
  normalizeText,
  OPEN_ENDED_MAX,
  TYPE_ANSWER_MAX,
  type AnswerValue,
  type QuestionResults,
  type VoterGroup,
} from '@livevote/shared';
import { isProfane } from '../util/nickname.js';
import type { LoadedQuestion, RecordedAnswer } from './types.js';

export interface ValidationError {
  ok: false;
  code: string;
  message: string;
}
export type PreparedAnswer = { ok: true; value: AnswerValue } | ValidationError;

const err = (code: string, message: string): ValidationError => ({ ok: false, code, message });

/** Strip HTML tags / angle brackets so nothing can be injected on the host screen. */
export function sanitizeText(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Validate and canonicalize a raw answer for the question's type. Rejects
 * malformed shapes (wrong kind, unknown options, out-of-range numbers, etc.).
 */
export function prepareAnswer(q: LoadedQuestion, value: AnswerValue): PreparedAnswer {
  const optionIds = new Set(q.options.map((o) => o.id));

  switch (q.type) {
    case 'MULTIPLE_CHOICE':
    case 'TRUE_FALSE': {
      if (value.kind !== 'option' || !optionIds.has(value.optionId)) {
        return err(ErrorCodes.OPTION_INVALID, 'Unknown option');
      }
      return { ok: true, value: { kind: 'option', optionId: value.optionId } };
    }
    case 'MULTI_SELECT': {
      if (value.kind !== 'options') return err(ErrorCodes.OPTION_INVALID, 'Expected a set of options');
      const ids = [...new Set(value.optionIds)];
      if (ids.length === 0) return err(ErrorCodes.OPTION_INVALID, 'Pick at least one option');
      if (!ids.every((id) => optionIds.has(id))) return err(ErrorCodes.OPTION_INVALID, 'Unknown option');
      return { ok: true, value: { kind: 'options', optionIds: ids } };
    }
    case 'ORDERING': {
      if (value.kind !== 'order') return err(ErrorCodes.OPTION_INVALID, 'Expected an ordering');
      const ids = value.order;
      if (ids.length !== q.options.length || new Set(ids).size !== ids.length || !ids.every((id) => optionIds.has(id))) {
        return err(ErrorCodes.OPTION_INVALID, 'Ordering must be a permutation of the items');
      }
      return { ok: true, value: { kind: 'order', order: ids } };
    }
    case 'TYPE_ANSWER': {
      if (value.kind !== 'text') return err(ErrorCodes.OPTION_INVALID, 'Expected text');
      const text = sanitizeText(value.text);
      if (text.length === 0 || text.length > TYPE_ANSWER_MAX) {
        return err(ErrorCodes.OPTION_INVALID, `Answer must be 1–${TYPE_ANSWER_MAX} characters`);
      }
      return { ok: true, value: { kind: 'text', text } };
    }
    case 'OPEN_ENDED': {
      if (value.kind !== 'text') return err(ErrorCodes.OPTION_INVALID, 'Expected text');
      const text = sanitizeText(value.text);
      if (text.length === 0 || text.length > OPEN_ENDED_MAX) {
        return err(ErrorCodes.OPTION_INVALID, `Answer must be 1–${OPEN_ENDED_MAX} characters`);
      }
      // Open responses are shown on the projector — filter profanity on submit.
      if (isProfane(text)) {
        return err(ErrorCodes.NICKNAME_PROFANE, 'Please keep it friendly');
      }
      return { ok: true, value: { kind: 'text', text } };
    }
    case 'SLIDER': {
      if (value.kind !== 'number' || !Number.isFinite(value.value)) {
        return err(ErrorCodes.OPTION_INVALID, 'Expected a number');
      }
      const min = q.config.min ?? Number.NEGATIVE_INFINITY;
      const max = q.config.max ?? Number.POSITIVE_INFINITY;
      if (value.value < min || value.value > max) {
        return err(ErrorCodes.OPTION_INVALID, 'Value out of range');
      }
      return { ok: true, value: { kind: 'number', value: value.value } };
    }
    case 'RATING': {
      if (value.kind !== 'number' || !Number.isInteger(value.value)) {
        return err(ErrorCodes.OPTION_INVALID, 'Expected a rating');
      }
      const scale = q.config.scale ?? 5;
      if (value.value < 1 || value.value > scale) {
        return err(ErrorCodes.OPTION_INVALID, 'Rating out of range');
      }
      return { ok: true, value: { kind: 'number', value: value.value } };
    }
  }
}

export interface RevealEntry {
  playerId: string;
  nickname: string;
  answer: RecordedAnswer | null;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Build the full reveal payload for a question, including per-type data and
 * (host-only) voter names when `showNames` is true.
 */
export function buildResults(
  q: LoadedQuestion,
  entries: RevealEntry[],
  showNames: boolean,
): QuestionResults {
  const totalPlayers = entries.length;
  const answeredEntries = entries.filter((e) => e.answer !== null);
  const totalAnswers = answeredEntries.length;
  const correctOptionIds = q.options.filter((o) => o.isCorrect).map((o) => o.id);
  const sortedByName = [...entries].sort((a, b) => a.nickname.localeCompare(b.nickname));

  const base: QuestionResults = {
    questionId: q.id,
    mode: q.mode,
    questionType: q.type,
    correctOptionIds: q.mode === 'QUIZ' ? correctOptionIds : [],
    tallies: [],
    totalAnswers,
    totalPlayers,
  };

  // Correctness per entry (quiz types).
  const grade = (a: RecordedAnswer | null) => gradeAnswer(q.type, q.config, q.options, a?.value ?? null);
  if (q.mode === 'QUIZ') {
    const correctCount = answeredEntries.filter((e) => grade(e.answer).correct === true).length;
    base.percentCorrect = totalAnswers === 0 ? 0 : Math.round((correctCount / totalAnswers) * 100);
  }

  const pct = (count: number) => (totalAnswers === 0 ? 0 : Math.round((count / totalAnswers) * 100));
  const noAnswer = sortedByName.filter((e) => e.answer === null).map((e) => e.nickname);

  switch (q.type) {
    case 'MULTIPLE_CHOICE':
    case 'TRUE_FALSE':
    case 'MULTI_SELECT': {
      const counts = new Map<string, number>();
      const voterMap = new Map<string, string[]>();
      for (const o of q.options) {
        counts.set(o.id, 0);
        voterMap.set(o.id, []);
      }
      for (const e of sortedByName) {
        const a = e.answer;
        if (!a) continue;
        const ids = a.value.kind === 'option' ? [a.value.optionId] : a.value.kind === 'options' ? a.value.optionIds : [];
        for (const id of ids) {
          counts.set(id, (counts.get(id) ?? 0) + 1);
          voterMap.get(id)?.push(e.nickname);
        }
      }
      base.tallies = q.options.map((o) => ({ optionId: o.id, count: counts.get(o.id) ?? 0, percent: pct(counts.get(o.id) ?? 0) }));
      if (showNames) {
        base.voters = q.options.map((o) => ({ optionId: o.id, nicknames: voterMap.get(o.id) ?? [] }));
        base.noAnswer = noAnswer;
      }
      break;
    }

    case 'ORDERING': {
      const correctOrder = [...q.options].sort((a, b) => a.index - b.index).map((o) => ({ optionId: o.id, text: o.text }));
      base.ordering = { correctOrder };
      if (showNames) {
        base.voterGroups = groupCorrectIncorrect(sortedByName, grade);
        base.noAnswer = noAnswer;
      }
      break;
    }

    case 'TYPE_ANSWER': {
      const buckets = new Map<string, { display: string; count: number; correct: boolean; names: string[] }>();
      // Seed accepted answers so the correct answer always shows.
      for (const acc of q.config.acceptedAnswers ?? []) {
        const norm = normalizeText(acc);
        if (!buckets.has(norm)) buckets.set(norm, { display: acc, count: 0, correct: true, names: [] });
      }
      for (const e of sortedByName) {
        const a = e.answer;
        if (!a || a.value.kind !== 'text') continue;
        const norm = normalizeText(a.value.text);
        const correct = grade(a).correct === true;
        const bucket = buckets.get(norm) ?? { display: a.value.text, count: 0, correct, names: [] };
        bucket.count += 1;
        bucket.correct = bucket.correct || correct;
        bucket.names.push(e.nickname);
        buckets.set(norm, bucket);
      }
      const rows = [...buckets.entries()]
        .map(([normalized, b]) => ({ normalized, display: b.display, count: b.count, correct: b.correct }))
        .sort((a, b) => Number(b.correct) - Number(a.correct) || b.count - a.count);
      base.textAnswers = rows;
      if (showNames) {
        const groups: VoterGroup[] = [];
        const correctNames = sortedByName
          .filter((e) => e.answer && grade(e.answer).correct === true)
          .map((e) => e.nickname);
        groups.push({ label: 'Correct', nicknames: correctNames, correct: true });
        for (const [norm, b] of buckets) {
          if (b.correct) continue;
          groups.push({ label: b.display, nicknames: b.names, correct: false });
          void norm;
        }
        base.voterGroups = groups;
        base.noAnswer = noAnswer;
      }
      break;
    }

    case 'OPEN_ENDED': {
      const style = q.config.revealStyle ?? 'ANSWER_WALL';
      const visible = sortedByName.filter((e) => e.answer && e.answer.value.kind === 'text' && !e.answer.hidden);
      if (style === 'WORD_CLOUD') {
        const freq = new Map<string, { word: string; count: number }>();
        for (const e of visible) {
          const text = (e.answer!.value as { kind: 'text'; text: string }).text;
          const norm = normalizeText(text);
          const cur = freq.get(norm) ?? { word: text, count: 0 };
          cur.count += 1;
          freq.set(norm, cur);
        }
        base.openEnded = {
          style,
          words: [...freq.values()].sort((a, b) => b.count - a.count),
        };
      } else {
        base.openEnded = {
          style,
          cards: visible.map((e) => ({
            id: e.playerId,
            text: (e.answer!.value as { kind: 'text'; text: string }).text,
            ...(showNames ? { nickname: e.nickname } : {}),
          })),
        };
      }
      break;
    }

    case 'SLIDER': {
      const values = answeredEntries
        .map((e) => (e.answer!.value.kind === 'number' ? e.answer!.value.value : null))
        .filter((v): v is number => v !== null);
      const avg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
      base.slider = {
        min: q.config.min ?? 0,
        max: q.config.max ?? 0,
        unit: q.config.unit ?? null,
        values,
        correctValue: q.mode === 'QUIZ' ? (q.config.correctValue ?? null) : null,
        average: round1(avg),
        median: round1(median(values)),
      };
      if (showNames) {
        const groups = new Map<number, string[]>();
        for (const e of sortedByName) {
          if (!e.answer || e.answer.value.kind !== 'number') continue;
          const v = e.answer.value.value;
          if (!groups.has(v)) groups.set(v, []);
          groups.get(v)!.push(e.nickname);
        }
        base.voterGroups = [...groups.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([v, names]) => ({ label: `${v}${q.config.unit ? ' ' + q.config.unit : ''}`, nicknames: names }));
        base.noAnswer = noAnswer;
      }
      break;
    }

    case 'RATING': {
      const scale = q.config.scale ?? 5;
      const values = answeredEntries
        .map((e) => (e.answer!.value.kind === 'number' ? e.answer!.value.value : null))
        .filter((v): v is number => v !== null);
      const counts: { value: number; count: number }[] = [];
      for (let v = 1; v <= scale; v++) counts.push({ value: v, count: values.filter((x) => x === v).length });
      const avg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
      base.rating = { scale, counts, average: round1(avg) };
      if (showNames) {
        base.voterGroups = counts.map((c) => ({
          label: `${c.value}`,
          nicknames: sortedByName
            .filter((e) => e.answer && e.answer.value.kind === 'number' && e.answer.value.value === c.value)
            .map((e) => e.nickname),
        }));
        base.noAnswer = noAnswer;
      }
      break;
    }
  }

  return base;
}

function groupCorrectIncorrect(
  entries: RevealEntry[],
  grade: (a: RecordedAnswer | null) => { correct: boolean | null },
): VoterGroup[] {
  const correct: string[] = [];
  const incorrect: string[] = [];
  for (const e of entries) {
    if (!e.answer) continue;
    (grade(e.answer).correct === true ? correct : incorrect).push(e.nickname);
  }
  return [
    { label: 'Correct', nicknames: correct, correct: true },
    { label: 'Incorrect', nicknames: incorrect, correct: false },
  ];
}
