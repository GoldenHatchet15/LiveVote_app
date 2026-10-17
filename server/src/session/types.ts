import type {
  AnswerValue,
  PointsValue,
  PublicQuestion,
  Question,
  QuestionConfig,
  QuestionMode,
  QuestionResults,
  QuestionType,
  ServerToClientEvents,
  TimeLimitSec,
} from '@livevote/shared';

/** A fully-loaded option, including whether it is correct (server-only). */
export interface LoadedOption {
  id: string;
  text: string;
  index: number;
  isCorrect: boolean;
}

export interface LoadedQuestion {
  id: string;
  text: string;
  imageUrl: string | null;
  mode: QuestionMode;
  type: QuestionType;
  config: QuestionConfig;
  options: LoadedOption[];
  timeLimitSec: TimeLimitSec;
  points: PointsValue;
  order: number;
}

export interface LoadedSet {
  id: string;
  title: string;
  description: string | null;
  showVoterNames: boolean;
  questions: LoadedQuestion[];
}

/** Per-question answer recorded for a player. */
export interface RecordedAnswer {
  /** Canonical, type-specific answer value. */
  value: AnswerValue;
  responseMs: number;
  /** Computed at reveal; 0 until then. */
  pointsAwarded: number;
  /** Computed at reveal; null for POLL / until reveal. */
  correct: boolean | null;
  /** Host can hide an OPEN_ENDED response from the screen + word cloud. */
  hidden?: boolean;
}

export interface RuntimePlayer {
  id: string;
  nickname: string;
  reconnectToken: string;
  score: number;
  streak: number;
  kicked: boolean;
  connected: boolean;
  joinedAt: number;
  answers: Map<string, RecordedAnswer>; // keyed by questionId
}

/** Abstraction over Date.now + timers so tests can drive time deterministically. */
export interface Scheduler {
  now(): number;
  setTimer(ms: number, cb: () => void): unknown;
  clearTimer(handle: unknown): void;
}

export const realScheduler: Scheduler = {
  now: () => Date.now(),
  setTimer: (ms, cb) => setTimeout(cb, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** How the engine talks to the outside world (socket rooms). */
export interface SessionEmitter {
  toAll<E extends keyof ServerToClientEvents>(
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void;
  toHost<E extends keyof ServerToClientEvents>(
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void;
  toPlayer<E extends keyof ServerToClientEvents>(
    playerId: string,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void;
}

/** A no-op emitter, handy for unit tests that only assert on engine state. */
export const nullEmitter: SessionEmitter = {
  toAll: () => {},
  toHost: () => {},
  toPlayer: () => {},
};

// Effects returned by mutating engine methods, for the manager to persist.
export interface RevealEffect {
  questionId: string;
  results: QuestionResults;
  perPlayer: Array<{
    playerId: string;
    value: AnswerValue | null;
    responseMs: number;
    correct: boolean | null;
    pointsAwarded: number;
    newScore: number;
    newStreak: number;
  }>;
}

export interface AnswerEffect {
  playerId: string;
  questionId: string;
  value: AnswerValue;
  responseMs: number;
}

/** Persistence hooks the manager supplies; the engine calls them fire-and-forget. */
export interface EngineHooks {
  onAnswer?(effect: AnswerEffect): void;
  onReveal?(effect: RevealEffect): void;
  onStateChange?(meta: {
    state: string;
    currentQuestionIndex: number;
    questionStartedAt: number | null;
    endedAt: number | null;
  }): void;
}

export type EngineResult<T = void> =
  | ({ ok: true } & (T extends void ? Record<never, never> : { value: T }))
  | { ok: false; code: string; message: string };

// Re-exports used by callers for convenience.
export type { PublicQuestion, Question };
