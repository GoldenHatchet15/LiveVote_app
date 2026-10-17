import { describe, expect, it } from 'vitest';
import {
  computeScore,
  gradeAnswer,
  normalizeText,
  toPublicConfig,
  type GradableOption,
  type QuestionConfig,
} from '@livevote/shared';

const opts = (correctIdx: number[]): GradableOption[] =>
  [0, 1, 2, 3].map((i) => ({ id: `o${i}`, index: i, isCorrect: correctIdx.includes(i) }));

describe('normalizeText', () => {
  it('folds case, accents and extra spaces', () => {
    expect(normalizeText('  Canción ')).toBe('cancion');
    expect(normalizeText('CAFÉ')).toBe(normalizeText('cafe'));
    expect(normalizeText('a   b')).toBe('a b');
  });
});

describe('gradeAnswer — option types', () => {
  it('MULTIPLE_CHOICE / TRUE_FALSE: correct only for the right option', () => {
    const o = opts([1]);
    expect(gradeAnswer('MULTIPLE_CHOICE', {}, o, { kind: 'option', optionId: 'o1' })).toEqual({
      correct: true,
      creditFactor: 1,
    });
    expect(gradeAnswer('TRUE_FALSE', {}, o, { kind: 'option', optionId: 'o0' })).toEqual({
      correct: false,
      creditFactor: 0,
    });
  });

  it('MULTI_SELECT: full credit only for the exact correct set', () => {
    const o = opts([0, 2]);
    expect(gradeAnswer('MULTI_SELECT', {}, o, { kind: 'options', optionIds: ['o2', 'o0'] }).correct).toBe(true);
    expect(gradeAnswer('MULTI_SELECT', {}, o, { kind: 'options', optionIds: ['o0'] }).correct).toBe(false);
    expect(gradeAnswer('MULTI_SELECT', {}, o, { kind: 'options', optionIds: ['o0', 'o1', 'o2'] }).correct).toBe(false);
  });

  it('ORDERING: full credit only for the exact order', () => {
    const o = opts([]); // isCorrect unused; order is by index
    expect(gradeAnswer('ORDERING', {}, o, { kind: 'order', order: ['o0', 'o1', 'o2', 'o3'] }).correct).toBe(true);
    expect(gradeAnswer('ORDERING', {}, o, { kind: 'order', order: ['o1', 'o0', 'o2', 'o3'] }).correct).toBe(false);
  });
});

describe('gradeAnswer — TYPE_ANSWER', () => {
  const cfg = (over: Partial<QuestionConfig> = {}): QuestionConfig => ({
    acceptedAnswers: ['Canción', 'song'],
    exactMatch: false,
    ...over,
  });
  it('matches ignoring case, spacing and accents', () => {
    expect(gradeAnswer('TYPE_ANSWER', cfg(), [], { kind: 'text', text: ' cancion ' }).correct).toBe(true);
    expect(gradeAnswer('TYPE_ANSWER', cfg(), [], { kind: 'text', text: 'SONG' }).correct).toBe(true);
    expect(gradeAnswer('TYPE_ANSWER', cfg(), [], { kind: 'text', text: 'nope' }).correct).toBe(false);
  });
  it('exact-match toggle requires a byte-for-byte match', () => {
    const c = cfg({ exactMatch: true });
    expect(gradeAnswer('TYPE_ANSWER', c, [], { kind: 'text', text: 'cancion' }).correct).toBe(false);
    expect(gradeAnswer('TYPE_ANSWER', c, [], { kind: 'text', text: 'Canción' }).correct).toBe(true);
  });
});

describe('gradeAnswer — SLIDER partial credit', () => {
  const cfg: QuestionConfig = { min: 0, max: 100, step: 1, correctValue: 50, tolerance: 10 };
  it('full credit within tolerance', () => {
    expect(gradeAnswer('SLIDER', cfg, [], { kind: 'number', value: 50 })).toEqual({ correct: true, creditFactor: 1 });
    expect(gradeAnswer('SLIDER', cfg, [], { kind: 'number', value: 59 }).creditFactor).toBe(1);
  });
  it('scales down just outside tolerance', () => {
    // d=15, tol=10 -> factor 1 - (15-10)/10 = 0.5
    const g = gradeAnswer('SLIDER', cfg, [], { kind: 'number', value: 65 });
    expect(g.correct).toBe(true);
    expect(g.creditFactor).toBeCloseTo(0.5, 5);
  });
  it('zero beyond 2× tolerance', () => {
    const g = gradeAnswer('SLIDER', cfg, [], { kind: 'number', value: 80 }); // d=30 > 20
    expect(g.correct).toBe(false);
    expect(g.creditFactor).toBe(0);
  });
  it('a poll slider (no correct value) has no correctness', () => {
    expect(gradeAnswer('SLIDER', { min: 0, max: 10, step: 1, correctValue: null }, [], {
      kind: 'number',
      value: 5,
    }).correct).toBeNull();
  });
});

describe('gradeAnswer — poll-only types', () => {
  it('OPEN_ENDED and RATING are never scored', () => {
    expect(gradeAnswer('OPEN_ENDED', {}, [], { kind: 'text', text: 'hi' }).correct).toBeNull();
    expect(gradeAnswer('RATING', {}, [], { kind: 'number', value: 4 }).correct).toBeNull();
  });
});

describe('computeScore with creditFactor (SLIDER)', () => {
  it('scales the base by the credit factor, speed bonus included', () => {
    const r = computeScore({
      mode: 'QUIZ',
      points: 'STANDARD',
      correct: true,
      answered: true,
      responseTimeMs: 0, // base 1000
      timeLimitSec: 20,
      previousStreak: 0,
      creditFactor: 0.5,
    });
    expect(r.pointsAwarded).toBe(500); // 1000 * 0.5
  });
});

describe('toPublicConfig strips correct answers', () => {
  it('removes acceptedAnswers and slider correctValue/tolerance', () => {
    expect(toPublicConfig('TYPE_ANSWER', { acceptedAnswers: ['x'], exactMatch: true })).toEqual({
      exactMatch: true,
    });
    const slider = toPublicConfig('SLIDER', {
      min: 0,
      max: 10,
      step: 1,
      unit: 'kg',
      correctValue: 7,
      tolerance: 1,
    });
    expect(slider).toEqual({ min: 0, max: 10, step: 1, unit: 'kg' });
    expect(slider).not.toHaveProperty('correctValue');
  });
});
