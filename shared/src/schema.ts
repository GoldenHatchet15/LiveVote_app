/**
 * Zod schemas for question-set CRUD and JSON import/export (M2). These are the
 * single validation source for both the Admin UI and the server API, so a set
 * that imports in the browser is guaranteed to save on the server.
 */

import { z } from 'zod';
import {
  OPTION_TEXT_MAX,
  OPTIONS_MAX,
  OPTIONS_MIN,
  QUESTION_TEXT_MAX,
  SET_TITLE_MAX,
} from './constants.js';

export const questionModeSchema = z.enum(['POLL', 'QUIZ']);
export const pointsValueSchema = z.enum(['STANDARD', 'DOUBLE', 'NONE']);
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
    options: z.array(optionInputSchema).min(OPTIONS_MIN).max(OPTIONS_MAX),
    /** Indices (0-based) into `options` that are correct. QUIZ only. */
    correctOptionIndices: z.array(z.number().int().nonnegative()).default([]),
    timeLimitSec: timeLimitSchema,
    points: pointsValueSchema,
  })
  .superRefine((q, ctx) => {
    // Options must be unique (case-insensitive, trimmed).
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

    // Correct indices must reference real options.
    for (const idx of q.correctOptionIndices) {
      if (idx >= q.options.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Correct option index ${idx} is out of range`,
          path: ['correctOptionIndices'],
        });
      }
    }

    if (q.mode === 'QUIZ') {
      if (q.correctOptionIndices.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'A QUIZ question needs at least one correct option',
          path: ['correctOptionIndices'],
        });
      }
    } else {
      // POLL questions carry no correct answers and no scoring weight.
      if (q.correctOptionIndices.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'POLL questions cannot have correct options',
          path: ['correctOptionIndices'],
        });
      }
    }
  });

export const questionSetInputSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(SET_TITLE_MAX),
  description: z.string().trim().max(1000).nullable().optional().default(null),
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
