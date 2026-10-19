import { describe, expect, it } from 'vitest';
import {
  questionSetExportSchema,
  questionSetInputSchema,
  type QuestionSetInput,
} from '@livevote/shared';

/**
 * Question-builder validation and JSON import/export (M2). The same zod schema
 * is the single source of truth for the Admin UI and the server, so these
 * assertions guard both.
 */

const validQuiz: QuestionSetInput = {
  title: 'Sample',
  description: 'desc',
  showVoterNames: false,
  questions: [
    {
      text: 'Capital of France?',
      imageUrl: null,
      mode: 'QUIZ',
      type: 'MULTIPLE_CHOICE',
      config: {},
      options: [{ text: 'Paris' }, { text: 'Lyon' }],
      correctOptionIndices: [0],
      timeLimitSec: 20,
      points: 'STANDARD',
    },
  ],
};

describe('questionSetInputSchema validation', () => {
  it('accepts a well-formed quiz set', () => {
    expect(questionSetInputSchema.safeParse(validQuiz).success).toBe(true);
  });

  it('rejects a QUIZ question with no correct option', () => {
    const bad = structuredClone(validQuiz);
    bad.questions[0]!.correctOptionIndices = [];
    const r = questionSetInputSchema.safeParse(bad);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => /at least one correct/i.test(i.message))).toBe(true);
    }
  });

  it('rejects duplicate option text (case-insensitive)', () => {
    const bad = structuredClone(validQuiz);
    bad.questions[0]!.options = [{ text: 'Paris' }, { text: ' paris ' }];
    const r = questionSetInputSchema.safeParse(bad);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => /unique/i.test(i.message))).toBe(true);
  });

  it('rejects an empty option', () => {
    const bad = structuredClone(validQuiz);
    bad.questions[0]!.options = [{ text: 'Paris' }, { text: '' }];
    expect(questionSetInputSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects fewer than two options', () => {
    const bad = structuredClone(validQuiz);
    bad.questions[0]!.options = [{ text: 'Only' }];
    expect(questionSetInputSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a POLL question that carries correct options', () => {
    const bad = structuredClone(validQuiz);
    bad.questions[0]!.mode = 'POLL';
    bad.questions[0]!.correctOptionIndices = [0];
    expect(questionSetInputSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a correct index that is out of range', () => {
    const bad = structuredClone(validQuiz);
    bad.questions[0]!.correctOptionIndices = [5];
    expect(questionSetInputSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a missing title', () => {
    const bad = structuredClone(validQuiz);
    (bad as { title?: string }).title = '';
    expect(questionSetInputSchema.safeParse(bad).success).toBe(false);
  });
});

describe('JSON export/import round-trip', () => {
  it('a valid export envelope re-parses to an identical set', () => {
    const parsed = questionSetInputSchema.parse(validQuiz);
    const envelope = {
      schemaVersion: 1 as const,
      exportedAt: new Date().toISOString(),
      set: parsed,
    };
    // Simulate writing to a file and reading it back.
    const roundTripped = questionSetExportSchema.parse(
      JSON.parse(JSON.stringify(envelope)),
    );
    expect(roundTripped.set).toEqual(parsed);
  });

  it('import accepts a bare set-input body too (no envelope)', () => {
    expect(questionSetInputSchema.safeParse(validQuiz).success).toBe(true);
  });
});

describe('per-type validation', () => {
  const base = (over: Record<string, unknown>) => ({
    title: 'T',
    questions: [
      {
        text: 'Q',
        mode: 'QUIZ',
        timeLimitSec: 20,
        points: 'STANDARD',
        options: [],
        correctOptionIndices: [],
        config: {},
        ...over,
      },
    ],
  });

  it('TYPE_ANSWER needs accepted answers and is quiz-only', () => {
    expect(questionSetInputSchema.safeParse(base({ type: 'TYPE_ANSWER', config: {} })).success).toBe(false);
    expect(
      questionSetInputSchema.safeParse(base({ type: 'TYPE_ANSWER', config: { acceptedAnswers: ['hi'] } })).success,
    ).toBe(true);
    expect(
      questionSetInputSchema.safeParse(base({ type: 'TYPE_ANSWER', mode: 'POLL', config: { acceptedAnswers: ['hi'] } })).success,
    ).toBe(false);
  });

  it('SLIDER needs min<max and an in-range correct value (quiz)', () => {
    expect(questionSetInputSchema.safeParse(base({ type: 'SLIDER', config: { min: 10, max: 5, correctValue: 7 } })).success).toBe(false);
    expect(questionSetInputSchema.safeParse(base({ type: 'SLIDER', config: { min: 0, max: 10, correctValue: 50 } })).success).toBe(false);
    expect(questionSetInputSchema.safeParse(base({ type: 'SLIDER', config: { min: 0, max: 10, correctValue: 5 } })).success).toBe(true);
  });

  it('ORDERING needs 3–5 items', () => {
    expect(questionSetInputSchema.safeParse(base({ type: 'ORDERING', options: [{ text: 'a' }, { text: 'b' }] })).success).toBe(false);
    expect(
      questionSetInputSchema.safeParse(base({ type: 'ORDERING', options: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] })).success,
    ).toBe(true);
  });

  it('RATING is poll-only with scale 5 or 10', () => {
    expect(questionSetInputSchema.safeParse(base({ type: 'RATING', mode: 'POLL', points: 'NONE', config: { scale: 7 } })).success).toBe(false);
    expect(questionSetInputSchema.safeParse(base({ type: 'RATING', mode: 'POLL', points: 'NONE', config: { scale: 10 } })).success).toBe(true);
  });

  it('MULTI_SELECT allows 2–6 options with multiple correct', () => {
    expect(
      questionSetInputSchema.safeParse(
        base({ type: 'MULTI_SELECT', options: [{ text: 'a' }, { text: 'b' }, { text: 'c' }], correctOptionIndices: [0, 2] }),
      ).success,
    ).toBe(true);
  });

  it('WRITE_IN is poll-only and "only suggested" needs a roster', () => {
    expect(questionSetInputSchema.safeParse(base({ type: 'WRITE_IN', mode: 'QUIZ', config: {} })).success).toBe(false);
    expect(questionSetInputSchema.safeParse(base({ type: 'WRITE_IN', mode: 'POLL', points: 'NONE', config: {} })).success).toBe(true);
    expect(
      questionSetInputSchema.safeParse(base({ type: 'WRITE_IN', mode: 'POLL', points: 'NONE', config: { onlySuggested: true, suggestedAnswers: [] } })).success,
    ).toBe(false);
    expect(
      questionSetInputSchema.safeParse(base({ type: 'WRITE_IN', mode: 'POLL', points: 'NONE', config: { onlySuggested: true, suggestedAnswers: ['Carlos'] } })).success,
    ).toBe(true);
  });

  it('export/import round-trips a WRITE_IN config (suggested answers + settings)', () => {
    const parsed = questionSetInputSchema.parse(
      base({ type: 'WRITE_IN', mode: 'POLL', points: 'NONE', config: { suggestedAnswers: ['Ana', 'Carlos'], onlySuggested: false, maxAnswerLength: 30, reviewBeforeReveal: true } }),
    );
    const envelope = { schemaVersion: 1 as const, exportedAt: new Date().toISOString(), set: parsed };
    const back = questionSetExportSchema.parse(JSON.parse(JSON.stringify(envelope)));
    expect(back.set.questions[0]!.config).toEqual(parsed.questions[0]!.config);
  });

  it('export/import round-trips a SLIDER config', () => {
    const parsed = questionSetInputSchema.parse(base({ type: 'SLIDER', config: { min: 0, max: 100, step: 5, unit: 'kg', correctValue: 40, tolerance: 3 } }));
    const envelope = { schemaVersion: 1 as const, exportedAt: new Date().toISOString(), set: parsed };
    const back = questionSetExportSchema.parse(JSON.parse(JSON.stringify(envelope)));
    expect(back.set.questions[0]!.config).toEqual(parsed.questions[0]!.config);
  });
});

describe('invalid JSON import fails gracefully', () => {
  it('rejects an envelope with the wrong schemaVersion', () => {
    const r = questionSetExportSchema.safeParse({
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      set: validQuiz,
    });
    expect(r.success).toBe(false);
  });

  it('rejects a structurally broken payload without throwing', () => {
    expect(() => questionSetExportSchema.safeParse({ nope: true })).not.toThrow();
    expect(questionSetExportSchema.safeParse({ nope: true }).success).toBe(false);
    expect(questionSetInputSchema.safeParse('not an object').success).toBe(false);
    expect(questionSetInputSchema.safeParse(null).success).toBe(false);
  });
});
