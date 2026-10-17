/**
 * Core domain types shared between server and client.
 *
 * These mirror the Prisma models but are transport-friendly (dates as ISO
 * strings, no Prisma-specific fields). The server is the single source of
 * truth; these types describe what crosses the wire.
 */

export type QuestionMode = 'POLL' | 'QUIZ';
export type PointsValue = 'STANDARD' | 'DOUBLE' | 'NONE';
export type SessionState =
  | 'LOBBY'
  | 'QUESTION'
  | 'REVEAL'
  | 'LEADERBOARD'
  | 'ENDED';

/** Allowed per-question time limits, in seconds. `null` means no limit. */
export type TimeLimitSec = 10 | 20 | 30 | 60 | null;

export interface Option {
  id: string;
  text: string;
  /** 0-based position of the option within the question (0..3). */
  index: number;
}

/**
 * A question as stored/edited in the Admin builder. Contains the correct
 * answers — this shape is ONLY ever sent to admin/host clients, never players.
 */
export interface Question {
  id: string;
  text: string;
  imageUrl: string | null;
  mode: QuestionMode;
  options: Option[];
  /** QUIZ only; references Option.id values. Empty for POLL questions. */
  correctOptionIds: string[];
  timeLimitSec: TimeLimitSec;
  points: PointsValue;
  /** 0-based ordering within the question set. */
  order: number;
}

export interface QuestionSet {
  id: string;
  title: string;
  description: string | null;
  /**
   * When true, the host REVEAL screen shows which players chose each option.
   * OFF by default; overridable per session without changing the saved set.
   */
  showVoterNames: boolean;
  createdAt: string;
  updatedAt: string;
  questions: Question[];
}

/**
 * The player-safe view of a question while it is live. Crucially this has NO
 * `correctOptionIds` — correct answers are never sent to players before
 * REVEAL.
 */
export interface PublicQuestion {
  id: string;
  index: number;
  total: number;
  text: string;
  imageUrl: string | null;
  mode: QuestionMode;
  options: Option[];
  timeLimitSec: TimeLimitSec;
  points: PointsValue;
  /**
   * Whether voter names will be shown on the host results screen. Players use
   * this only to display the "your name will be shown" transparency notice —
   * it never carries any other player's identity or answer.
   */
  showVoterNames: boolean;
}

export interface PlayerSummary {
  id: string;
  nickname: string;
  score: number;
  streak: number;
  kicked: boolean;
  connected: boolean;
}

export interface LeaderboardEntry {
  playerId: string;
  nickname: string;
  score: number;
  rank: number;
  /** Points gained on the most recently revealed question. */
  lastGain: number;
}

/** Per-option tally used by the host REVEAL chart. */
export interface OptionTally {
  optionId: string;
  count: number;
  percent: number;
}

/**
 * Nicknames of the players who chose a given option. Populated ONLY when the
 * "show voter names" setting is on, and ONLY on host-facing payloads — this is
 * never sent to player clients.
 */
export interface OptionVoters {
  optionId: string;
  nicknames: string[];
}

export interface QuestionResults {
  questionId: string;
  mode: QuestionMode;
  /** Present for QUIZ questions only; empty array for POLL. */
  correctOptionIds: string[];
  tallies: OptionTally[];
  totalAnswers: number;
  totalPlayers: number;
  /**
   * Per-option voter nicknames (host-only). Present only when "show voter
   * names" is enabled for the session; omitted entirely when off.
   */
  voters?: OptionVoters[];
  /** Nicknames of active players who did not answer. Present only when on. */
  noAnswer?: string[];
}

/** Personal result sent to a single player at REVEAL. */
export interface PlayerResult {
  questionId: string;
  mode: QuestionMode;
  answered: boolean;
  correct: boolean | null; // null for POLL (no notion of correct)
  selectedOptionId: string | null;
  pointsAwarded: number;
  totalScore: number;
  streak: number;
  rank: number;
  totalPlayers: number;
}
