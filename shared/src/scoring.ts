/**
 * Pure scoring logic. No I/O, no dates, no randomness — fully deterministic so
 * it can be unit-tested in isolation (M3 acceptance). The server is the sole
 * caller; clients never compute scores.
 *
 * Rules (QUIZ mode):
 *  - Correct, timed:   base = round(1000 * (1 - (responseTime / timeLimit) / 2))
 *                      => 1000 at t=0, 500 at t=timeLimit. responseTime is
 *                      clamped to [0, timeLimit].
 *  - Correct, untimed: base = 1000 (flat).
 *  - DOUBLE multiplies the BASE by 2 (streak bonus is not doubled).
 *  - NONE awards 0 points for that question (no base, no streak bonus), but a
 *    correct answer still advances the streak for later questions.
 *  - Streak bonus: +100 per consecutive correct answer beyond the first,
 *    capped at +500 (i.e. streaks of 2..6+ give 100..500).
 *  - Wrong or missing answer: 0 points, streak resets to 0.
 *  - POLL questions never affect score or streak.
 */

import type { PointsValue, QuestionMode, TimeLimitSec } from './domain.js';

export const STREAK_BONUS_PER_STEP = 100;
export const STREAK_BONUS_CAP = 500;
export const MIN_TIMED_BASE = 500;
export const MAX_BASE = 1000;

export interface ScoreInput {
  mode: QuestionMode;
  points: PointsValue;
  /** Whether the player's answer was correct (ignored for POLL). */
  correct: boolean;
  /** Whether the player answered at all. A missing answer is never correct. */
  answered: boolean;
  /** Time from question start to answer, in milliseconds. */
  responseTimeMs: number;
  /** The question's time limit in seconds, or null for untimed. */
  timeLimitSec: TimeLimitSec;
  /** The player's streak BEFORE this question. */
  previousStreak: number;
  /**
   * 0..1 multiplier on the base points, for graded types (SLIDER partial
   * credit). Defaults to 1 for binary-correct types. Never affects the streak
   * bonus. A correct answer always has creditFactor > 0.
   */
  creditFactor?: number;
}

export interface ScoreResult {
  pointsAwarded: number;
  /** The player's streak AFTER this question. */
  newStreak: number;
}

/** Base points before the DOUBLE/NONE multiplier and streak bonus. */
export function basePoints(
  responseTimeMs: number,
  timeLimitSec: TimeLimitSec,
): number {
  if (timeLimitSec === null) return MAX_BASE;
  const limitMs = timeLimitSec * 1000;
  const clamped = Math.min(Math.max(responseTimeMs, 0), limitMs);
  const value = MAX_BASE * (1 - clamped / limitMs / 2);
  return Math.round(value);
}

/** Streak bonus for a given post-answer streak length. */
export function streakBonus(newStreak: number): number {
  const stepsBeyondFirst = Math.max(newStreak - 1, 0);
  return Math.min(stepsBeyondFirst, STREAK_BONUS_CAP / STREAK_BONUS_PER_STEP) *
    STREAK_BONUS_PER_STEP;
}

function pointsMultiplier(points: PointsValue): number {
  switch (points) {
    case 'DOUBLE':
      return 2;
    case 'STANDARD':
      return 1;
    case 'NONE':
      return 0;
  }
}

export function computeScore(input: ScoreInput): ScoreResult {
  // POLL questions never touch the score or streak.
  if (input.mode === 'POLL') {
    return { pointsAwarded: 0, newStreak: input.previousStreak };
  }

  const isCorrect = input.answered && input.correct;

  if (!isCorrect) {
    return { pointsAwarded: 0, newStreak: 0 };
  }

  const newStreak = input.previousStreak + 1;
  const multiplier = pointsMultiplier(input.points);

  // NONE: correct answer advances the streak but awards zero points.
  if (multiplier === 0) {
    return { pointsAwarded: 0, newStreak };
  }

  const factor = input.creditFactor ?? 1;
  const base = Math.round(basePoints(input.responseTimeMs, input.timeLimitSec) * factor);
  const pointsAwarded = base * multiplier + streakBonus(newStreak);
  return { pointsAwarded, newStreak };
}
