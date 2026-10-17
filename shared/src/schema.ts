/**
 * Zod schemas for question-set CRUD and JSON import/export (M2). These are the
 * single validation source for both the Admin UI and the server API, so a set
 * that imports in the browser is guaranteed to save on the server.
 */

import { z } from 'zod';
import {
  OPTION_TEXT_MAX,
  QUESTION_TEXT_MAX,
  SET_TITLE_MAX,
} from './constants.js';
import {
  QUESTION_TYPES,
  TYPE_ANSWER_MAX,
  TYPE_MODES,
  TYPE_USES_OPTIONS,
  type QuestionType,
} from './questionTypes.js';

export const questionModeSchema = z.enum(['POLL', 'QUIZ']);
export const pointsValueSchema = z.enum(['STANDARD', 'DOUBLE', 'NONE']);
export const questionTypeSchema = z.enum(
  QUESTION_TYPES as [QuestionType, ...QuestionType[]],
);

/** Per-type option-count bounds. */
const OPTION_BOUNDS: Record<QuestionType, { min: number; max: number }> = {
  MULTIPLE_CHOICE: { min: 2, max: 4 },
  MULTI_SELECT: { min: 2, max: 6 },
  TRUE_FALSE: { min: 2, max: 2 },
  ORDERING: { min: 3, max: 5 },
  TYPE_ANSWER: { min: 0, max: 0 },
  OPEN_ENDED: { min: 0, max: 0 },
  SLIDER: { min: 0, max: 0 },
  RATING: { min: 0, max: 0 },
};

export const configSchema = z
  .object({
    trueLabel: z.string().trim().min(1).max(40).optional(),
    falseLabel: z.string().trim().min(1).max(40).optional(),
    acceptedAnswers: z.array(z.string().trim().min(1).max(TYPE_ANSWER_MAX)).optional(),
    exactMatch: z.boolean().optional(),
    revealStyle: z.enum(['WORD_CLOUD', 'ANSWER_WALL']).optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    step: z.number().finite().positive().optional(),
    unit: z.string().trim().max(20).nullable().optional(),
    correctValue: z.number().finite().nullable().optional(),
    tolerance: z.number().finite().nonnegative().nullable().optional(),
    scale: z.union([z.literal(5), z.literal(10)]).optional(),
    lowLabel: z.string().trim().max(40).nullable().optional(),
    highLabel: z.string().trim().max(40).nullable().optional(),
  })
  .default({});
export const timeLimitSchema = z.union([
  z.literal(10),
  z.literal(20),
  z.literal(30),
  z.literal(60),
  z.null(),
]);

export const optionInputSchema = z.object({
  text: z.string().trim().min(1, 'Option text is required').max(OPTION_TEXT_MAX),
});

export const questionInputSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, 'Question text is required')
      .max(QUESTION_TEXT_MAX),
    imageUrl: z.string().trim().url().max(2000).nullable().optional().default(null),
    mode: questionModeSchema,
    type: questionTypeSchema.optional().default('MULTIPLE_CHOICE'),
    config: configSchema,
    options: z.array(optionInputSchema).max(6).optional().default([]),
    /** Indices (0-based) into `options` that are correct. QUIZ option-types only. */
    correctOptionIndices: z.array(z.number().int().nonnegative()).default([]),
    timeLimitSec: timeLimitSchema,
    points: pointsValueSchema,
  })
  .superRefine((q, ctx) => {
    const type = q.type;

    // Mode must be supported by the type.
    if (!TYPE_MODES[type].includes(q.mode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${type} does not support ${q.mode} mode`,
        path: ['mode'],
      });
    }

    const usesOptions = TYPE_USES_OPTIONS[type];
    const bounds = OPTION_BOUNDS[type];

    if (usesOptions) {
      if (q.options.length < bounds.min || q.options.length > bounds.max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${type} needs ${bounds.min}–${bounds.max} options`,
          path: ['options'],
        });
      }
      // Options must be unique (case-insensitive, trimmed) and non-empty.
      const seen = new Set<string>();
      q.options.forEach((o, i) => {
        const key = o.text.trim().toLowerCase();
        if (seen.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Options must be unique',
            path: ['options', i, 'text'],
          });
        }
        seen.add(key);
      });
    }

    // Correct indices only apply to pickable option types (not ORDERING).
    const picksCorrect = type === 'MULTIPLE_CHOICE' || type === 'MULTI_SELECT' || type === 'TRUE_FALSE';
    for (const idx of q.correctOptionIndices) {
      if (idx >= q.options.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Correct option index ${idx} is out of range`,
          path: ['correctOptionIndices'],
        });
      }
    }

    if (picksCorrect) {
      if (q.mode === 'QUIZ') {
        if (q.correctOptionIndices.length < 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'A QUIZ question needs at least one correct option',
            path: ['correctOptionIndices'],
          });
        }
        if (type === 'MULTIPLE_CHOICE' && q.correctOptionIndices.length > 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Multiple choice allows only one correct option',
            path: ['correctOptionIndices'],
          });
        }
      } else if (q.correctOptionIndices.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'POLL questions cannot have correct options',
          path: ['correctOptionIndices'],
        });
      }
    }

    // Per-type config validation.
    const c = q.config;
    if (type === 'TYPE_ANSWER') {
      const accepted = (c.acceptedAnswers ?? []).filter((a) => a.trim().length > 0);
      if (accepted.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Type-answer questions need at least one accepted answer',
          path: ['config', 'acceptedAnswers'],
        });
      }
    }
    if (type === 'OPEN_ENDED') {
      if (c.revealStyle !== 'WORD_CLOUD' && c.revealStyle !== 'ANSWER_WALL') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Choose a reveal style (word cloud or answer wall)',
          path: ['config', 'revealStyle'],
        });
      }
    }
    if (type === 'SLIDER') {
      if (c.min == null || c.max == null || c.min >= c.max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Slider needs min < max',
          path: ['config', 'max'],
        });
      }
      if (q.mode === 'QUIZ') {
        if (c.correctValue == null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'A quiz slider needs a correct value',
            path: ['config', 'correctValue'],
          });
        } else if (c.min != null && c.max != null && (c.correctValue < c.min || c.correctValue > c.max)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Correct value must be within [min, max]',
            path: ['config', 'correctValue'],
          });
        }
      }
    }
    if (type === 'RATING') {
      if (c.scale !== 5 && c.scale !== 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Rating scale must be 5 or 10',
          path: ['config', 'scale'],
        });
      }
    }
  });

export const questionSetInputSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(SET_TITLE_MAX),
  description: z.string().trim().max(1000).nullable().optional().default(null),
  /** Show which players chose each option on the host results screen. */
  showVoterNames: z.boolean().optional().default(false),
  questions: z.array(questionInputSchema).default([]),
});

/** Full export envelope (versioned so future formats can migrate). */
export const questionSetExportSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  set: questionSetInputSchema,
});

export type OptionInput = z.infer<typeof optionInputSchema>;
export type QuestionInput = z.infer<typeof questionInputSchema>;
export type QuestionSetInput = z.infer<typeof questionSetInputSchema>;
export type QuestionSetExport = z.infer<typeof questionSetExportSchema>;

export const loginSchema = z.object({
  password: z.string().min(1),
});
