/**
 * Question-type system (shared, framework-agnostic). Defines the eight question
 * types, their per-type config, the canonical answer shapes, and the PURE
 * grading / normalization helpers used by the server (and mirrored in the
 * builder for live validation). No I/O — fully unit-testable.
 */

import type { QuestionMode } from './domain.js';

export type QuestionType =
  | 'MULTIPLE_CHOICE'
  | 'MULTI_SELECT'
  | 'TRUE_FALSE'
  | 'TYPE_ANSWER'
  | 'OPEN_ENDED'
  | 'SLIDER'
  | 'ORDERING'
  | 'RATING';

export const QUESTION_TYPES: QuestionType[] = [
  'MULTIPLE_CHOICE',
  'MULTI_SELECT',
  'TRUE_FALSE',
  'TYPE_ANSWER',
  'OPEN_ENDED',
  'SLIDER',
  'ORDERING',
  'RATING',
];

/** Which game modes each type supports. */
export const TYPE_MODES: Record<QuestionType, QuestionMode[]> = {
  MULTIPLE_CHOICE: ['POLL', 'QUIZ'],
  MULTI_SELECT: ['POLL', 'QUIZ'],
  TRUE_FALSE: ['POLL', 'QUIZ'],
  TYPE_ANSWER: ['QUIZ'],
  OPEN_ENDED: ['POLL'],
  SLIDER: ['POLL', 'QUIZ'],
  ORDERING: ['QUIZ'],
  RATING: ['POLL'],
};

/** Types whose answers reference rows in the Option table. */
export const TYPE_USES_OPTIONS: Record<QuestionType, boolean> = {
  MULTIPLE_CHOICE: true,
  MULTI_SELECT: true,
  TRUE_FALSE: true,
  ORDERING: true,
  TYPE_ANSWER: false,
  OPEN_ENDED: false,
  SLIDER: false,
  RATING: false,
};

export const TYPE_META: Record<QuestionType, { label: string; icon: string; blurb: string }> = {
  MULTIPLE_CHOICE: { label: 'Multiple choice', icon: '🔘', blurb: '2–4 options, one answer.' },
  MULTI_SELECT: { label: 'Multiple select', icon: '☑️', blurb: '2–6 options, pick several then submit.' },
  TRUE_FALSE: { label: 'True / False', icon: '✅', blurb: 'Two big buttons.' },
  TYPE_ANSWER: { label: 'Type answer', icon: '⌨️', blurb: 'Short text; accent/case-insensitive match. Quiz only.' },
  OPEN_ENDED: { label: 'Open ended', icon: '💬', blurb: 'Free text; word cloud or answer wall. Poll only.' },
  SLIDER: { label: 'Slider', icon: '🎚️', blurb: 'Guess a number on a scale.' },
  ORDERING: { label: 'Ordering', icon: '🔀', blurb: 'Drag 3–5 items into order. Quiz only.' },
  RATING: { label: 'Rating', icon: '⭐', blurb: '1–5 stars or 1–10 scale. Poll only.' },
};

// ---------------------------------------------------------------- config

export type RevealStyle = 'WORD_CLOUD' | 'ANSWER_WALL';

/**
 * Per-type config. A single flat shape (optional fields) keeps storage and
 * transport simple; only the fields relevant to a question's type are set.
 * Correct-answer-bearing fields (acceptedAnswers, correctValue) are stripped
 * from the player-facing view — see `toPublicConfig`.
 */
export interface QuestionConfig {
  // TRUE_FALSE
  trueLabel?: string;
  falseLabel?: string;
  // TYPE_ANSWER
  acceptedAnswers?: string[];
  exactMatch?: boolean;
  // OPEN_ENDED
  revealStyle?: RevealStyle;
  // SLIDER
  min?: number;
  max?: number;
  step?: number;
  unit?: string | null;
  correctValue?: number | null;
  tolerance?: number | null;
  // RATING
  scale?: 5 | 10;
  lowLabel?: string | null;
  highLabel?: string | null;
}

/** The player-safe projection of a config: no correct answers. */
export function toPublicConfig(type: QuestionType, config: QuestionConfig): QuestionConfig {
  switch (type) {
    case 'TYPE_ANSWER':
      return { exactMatch: config.exactMatch };
    case 'SLIDER':
      return {
        min: config.min,
        max: config.max,
        step: config.step,
        unit: config.unit ?? null,
      };
    case 'OPEN_ENDED':
      return { revealStyle: config.revealStyle };
    case 'RATING':
      return {
        scale: config.scale,
        lowLabel: config.lowLabel ?? null,
        highLabel: config.highLabel ?? null,
      };
    case 'TRUE_FALSE':
      return { trueLabel: config.trueLabel, falseLabel: config.falseLabel };
    default:
      return {};
  }
}

// ---------------------------------------------------------------- answers

export type AnswerValue =
  | { kind: 'option'; optionId: string }
  | { kind: 'options'; optionIds: string[] }
  | { kind: 'text'; text: string }
  | { kind: 'number'; value: number }
  | { kind: 'order'; order: string[] };

export const ANSWER_KIND: Record<QuestionType, AnswerValue['kind']> = {
  MULTIPLE_CHOICE: 'option',
  TRUE_FALSE: 'option',
  MULTI_SELECT: 'options',
  ORDERING: 'order',
  TYPE_ANSWER: 'text',
  OPEN_ENDED: 'text',
  SLIDER: 'number',
  RATING: 'number',
};

export const TYPE_ANSWER_MAX = 40;
export const OPEN_ENDED_MAX = 120;

/** Normalize text for matching / word-cloud grouping: lowercase, strip accents,
 *  collapse whitespace. "Canción " -> "cancion". */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** A minimal option view the grader needs. */
export interface GradableOption {
  id: string;
  index: number;
  isCorrect: boolean;
}

export interface Grade {
  /** null for POLL-style types (no notion of correct). */
  correct: boolean | null;
  /** 0..1 multiplier on base points (1 for binary-correct types; graded for SLIDER). */
  creditFactor: number;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * Grade a single answer. Pure: given the question's type/config/options and the
 * player's canonical answer, returns correctness and a credit factor.
 */
export function gradeAnswer(
  type: QuestionType,
  config: QuestionConfig,
  options: GradableOption[],
  answer: AnswerValue | null,
): Grade {
  const correctIds = options.filter((o) => o.isCorrect).map((o) => o.id);

  switch (type) {
    case 'OPEN_ENDED':
    case 'RATING':
      return { correct: null, creditFactor: 0 };

    case 'MULTIPLE_CHOICE':
    case 'TRUE_FALSE': {
      if (!answer || answer.kind !== 'option') return { correct: false, creditFactor: 0 };
      const ok = correctIds.includes(answer.optionId);
      return { correct: ok, creditFactor: ok ? 1 : 0 };
    }

    case 'MULTI_SELECT': {
      if (!answer || answer.kind !== 'options') return { correct: false, creditFactor: 0 };
      const ok = sameSet(answer.optionIds, correctIds);
      return { correct: ok, creditFactor: ok ? 1 : 0 };
    }

    case 'ORDERING': {
      if (!answer || answer.kind !== 'order') return { correct: false, creditFactor: 0 };
      const correctOrder = [...options].sort((a, b) => a.index - b.index).map((o) => o.id);
      const ok = sameOrder(answer.order, correctOrder);
      return { correct: ok, creditFactor: ok ? 1 : 0 };
    }

    case 'TYPE_ANSWER': {
      if (!answer || answer.kind !== 'text') return { correct: false, creditFactor: 0 };
      const accepted = config.acceptedAnswers ?? [];
      const exact = config.exactMatch === true;
      const ok = exact
        ? accepted.some((a) => a === answer.text)
        : accepted.some((a) => normalizeText(a) === normalizeText(answer.text));
      return { correct: ok, creditFactor: ok ? 1 : 0 };
    }

    case 'SLIDER': {
      if (!answer || answer.kind !== 'number') return { correct: false, creditFactor: 0 };
      const correctValue = config.correctValue;
      const tolerance = config.tolerance ?? 0;
      if (correctValue == null) return { correct: null, creditFactor: 0 }; // poll slider
      const d = Math.abs(answer.value - correctValue);
      if (d <= tolerance) return { correct: true, creditFactor: 1 };
      const outer = tolerance * 2;
      if (tolerance > 0 && d < outer) {
        // Linear falloff from 1 (at tolerance) to 0 (at 2× tolerance).
        const factor = 1 - (d - tolerance) / tolerance;
        return { correct: true, creditFactor: Math.max(0, Math.min(1, factor)) };
      }
      return { correct: false, creditFactor: 0 };
    }
  }
}
