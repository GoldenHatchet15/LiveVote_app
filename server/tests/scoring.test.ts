import { describe, expect, it } from 'vitest';
import {
  basePoints,
  computeScore,
  streakBonus,
  type ScoreInput,
} from '@livevote/shared';

const quiz = (over: Partial<ScoreInput>): ScoreInput => ({
  mode: 'QUIZ',
  points: 'STANDARD',
  correct: true,
  answered: true,
  responseTimeMs: 0,
  timeLimitSec: 20,
  previousStreak: 0,
  ...over,
});

describe('basePoints', () => {
  it('awards the full 1000 at t=0', () => {
    expect(basePoints(0, 20)).toBe(1000);
  });

  it('awards 500 when the full time is used', () => {
    expect(basePoints(20_000, 20)).toBe(500);
  });

  it('awards 750 at the halfway mark', () => {
    expect(basePoints(10_000, 20)).toBe(750);
  });

  it('awards a flat 1000 for untimed questions regardless of time', () => {
    expect(basePoints(999_999, null)).toBe(1000);
  });

  it('clamps negative or overlong response times into [500, 1000]', () => {
    expect(basePoints(-500, 20)).toBe(1000);
    expect(basePoints(999_999, 20)).toBe(500);
  });
});

describe('streakBonus', () => {
  it('gives no bonus for the first correct answer', () => {
    expect(streakBonus(1)).toBe(0);
  });
  it('adds 100 per consecutive answer beyond the first', () => {
    expect(streakBonus(2)).toBe(100);
    expect(streakBonus(3)).toBe(200);
    expect(streakBonus(6)).toBe(500);
  });
  it('caps the bonus at 500', () => {
    expect(streakBonus(7)).toBe(500);
    expect(streakBonus(50)).toBe(500);
  });
});

describe('computeScore', () => {
  it('scores a correct STANDARD answer and advances the streak', () => {
    const r = computeScore(quiz({ responseTimeMs: 0 }));
    expect(r.pointsAwarded).toBe(1000);
    expect(r.newStreak).toBe(1);
  });

  it('doubles the BASE for DOUBLE questions but not the streak bonus', () => {
    // previousStreak 2 -> newStreak 3 -> bonus 200. base at t=0 is 1000.
    const r = computeScore(
      quiz({ points: 'DOUBLE', responseTimeMs: 0, previousStreak: 2 }),
    );
    expect(r.newStreak).toBe(3);
    expect(r.pointsAwarded).toBe(1000 * 2 + 200);
  });

  it('awards 0 for NONE questions but still advances the streak', () => {
    const r = computeScore(quiz({ points: 'NONE', previousStreak: 3 }));
    expect(r.pointsAwarded).toBe(0);
    expect(r.newStreak).toBe(4);
  });

  it('adds the streak bonus to a correct STANDARD answer', () => {
    // previousStreak 1 -> newStreak 2 -> bonus 100. base 500 (full time used).
    const r = computeScore(
      quiz({ responseTimeMs: 20_000, previousStreak: 1 }),
    );
    expect(r.newStreak).toBe(2);
    expect(r.pointsAwarded).toBe(500 + 100);
  });

  it('resets the streak and awards 0 for a wrong answer', () => {
    const r = computeScore(quiz({ correct: false, previousStreak: 4 }));
    expect(r.pointsAwarded).toBe(0);
    expect(r.newStreak).toBe(0);
  });

  it('resets the streak and awards 0 for no answer', () => {
    const r = computeScore(
      quiz({ answered: false, correct: false, previousStreak: 4 }),
    );
    expect(r.pointsAwarded).toBe(0);
    expect(r.newStreak).toBe(0);
  });

  it('never changes the score or streak for POLL questions', () => {
    const r = computeScore(quiz({ mode: 'POLL', points: 'NONE', previousStreak: 2 }));
    expect(r.pointsAwarded).toBe(0);
    expect(r.newStreak).toBe(2);
  });
});
