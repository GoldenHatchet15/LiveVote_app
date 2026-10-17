import {
  questionSetInputSchema,
  type PointsValue,
  type QuestionConfig,
  type QuestionMode,
  type QuestionSet,
  type QuestionSetInput,
  type QuestionType,
  type TimeLimitSec,
} from '@livevote/shared';

export interface EditOption {
  id: string;
  text: string;
}
export interface EditQuestion {
  id: string;
  text: string;
  imageUrl: string;
  mode: QuestionMode;
  type: QuestionType;
  config: QuestionConfig;
  options: EditOption[];
  correct: number[]; // option indices
  timeLimitSec: TimeLimitSec;
  points: PointsValue;
}
export interface EditState {
  title: string;
  description: string;
  showVoterNames: boolean;
  questions: EditQuestion[];
}

let counter = 0;
export const uid = (): string => `e${Date.now().toString(36)}_${counter++}`;

export function blankQuestion(): EditQuestion {
  return {
    id: uid(),
    text: '',
    imageUrl: '',
    mode: 'QUIZ',
    type: 'MULTIPLE_CHOICE',
    config: {},
    options: [
      { id: uid(), text: '' },
      { id: uid(), text: '' },
    ],
    correct: [],
    timeLimitSec: 20,
    points: 'STANDARD',
  };
}

export function emptyState(): EditState {
  return { title: '', description: '', showVoterNames: false, questions: [blankQuestion()] };
}

export function fromSet(set: QuestionSet): EditState {
  return {
    title: set.title,
    description: set.description ?? '',
    showVoterNames: set.showVoterNames,
    questions: set.questions.map((q) => {
      const options = q.options.map((o) => ({ id: uid(), text: o.text }));
      const correct = q.options
        .map((o, i) => (q.correctOptionIds.includes(o.id) ? i : -1))
        .filter((i) => i >= 0);
      return {
        id: uid(),
        text: q.text,
        imageUrl: q.imageUrl ?? '',
        mode: q.mode,
        type: q.type,
        config: q.config,
        options,
        correct,
        timeLimitSec: q.timeLimitSec,
        points: q.points,
      };
    }),
  };
}

export function toInput(state: EditState): QuestionSetInput {
  return {
    title: state.title.trim(),
    description: state.description.trim() ? state.description.trim() : null,
    showVoterNames: state.showVoterNames,
    questions: state.questions.map((q) => ({
      text: q.text.trim(),
      imageUrl: q.imageUrl.trim() ? q.imageUrl.trim() : null,
      mode: q.mode,
      type: q.type,
      config: q.config,
      options: q.options.map((o) => ({ text: o.text.trim() })),
      correctOptionIndices: q.mode === 'QUIZ' ? q.correct : [],
      timeLimitSec: q.timeLimitSec,
      points: q.points,
    })),
  };
}

export interface ValidationResult {
  ok: boolean;
  /** Map of "questions.<i>" or "questions.<i>.options.<j>" -> message. */
  issues: Map<string, string>;
  topLevel: string[];
}

/** Validate with the same zod schema the server uses. */
export function validate(state: EditState): ValidationResult {
  const input = toInput(state);
  const parsed = questionSetInputSchema.safeParse(input);
  const issues = new Map<string, string>();
  const topLevel: string[] = [];
  if (parsed.success) {
    if (input.questions.length === 0) {
      topLevel.push('Add at least one question before saving.');
      return { ok: false, issues, topLevel };
    }
    return { ok: true, issues, topLevel };
  }
  for (const issue of parsed.error.issues) {
    const path = issue.path;
    if (path.length === 0) {
      topLevel.push(issue.message);
      continue;
    }
    // Normalize to a question-scoped key so the UI can show it on the card.
    if (path[0] === 'questions' && typeof path[1] === 'number') {
      const qKey = `questions.${path[1]}`;
      if (path[2] === 'options' && typeof path[3] === 'number') {
        issues.set(`${qKey}.options.${path[3]}`, issue.message);
      } else {
        // Keep the first error per question for a compact display.
        if (!issues.has(qKey)) issues.set(qKey, issue.message);
      }
    } else {
      topLevel.push(issue.message);
    }
  }
  return { ok: false, issues, topLevel };
}

export const TIME_OPTIONS: { label: string; value: TimeLimitSec }[] = [
  { label: '10s', value: 10 },
  { label: '20s', value: 20 },
  { label: '30s', value: 30 },
  { label: '60s', value: 60 },
  { label: 'No limit', value: null },
];

export const POINTS_OPTIONS: { label: string; value: PointsValue }[] = [
  { label: 'Standard', value: 'STANDARD' },
  { label: 'Double', value: 'DOUBLE' },
  { label: 'No points', value: 'NONE' },
];
