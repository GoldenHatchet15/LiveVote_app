/**
 * Socket.IO event contract shared by server and client. All payloads and ack
 * shapes live here so both ends stay in lockstep and the compiler catches drift.
 *
 * Invariant: nothing in a PLAYER-facing payload ever carries correctOptionIds
 * before REVEAL. See `PublicQuestion` (no correct answers) vs `QuestionResults`
 * (sent at reveal, to everyone).
 */

import type {
  LeaderboardEntry,
  PlayerResult,
  PlayerSummary,
  PublicQuestion,
  Question,
  QuestionResults,
  SessionState,
} from './domain.js';

// ---------- Common ack ----------

export interface Ack {
  ok: boolean;
  code?: string;
  message?: string;
}

// ---------- Player join / answer ----------

export interface JoinRequest {
  pin: string;
  nickname: string;
  /** Present when rejoining after a refresh/disconnect. */
  reconnectToken?: string;
}

export interface PlayerSnapshot {
  state: SessionState;
  /** The live question, without correct answers, when state is QUESTION. */
  question: PublicQuestion | null;
  /** Server clock + deadline so the client can render a display-only timer. */
  serverNow: number;
  endsAt: number | null;
  /** Whether this player has already answered the current question. */
  hasAnswered: boolean;
  /** The option this player selected for the current question, if any. */
  selectedOptionId: string | null;
  score: number;
  streak: number;
  rank: number;
  totalPlayers: number;
  /** Populated when rejoining mid-REVEAL so the player sees their result. */
  lastResult: PlayerResult | null;
  /** Drives the "your name will be shown" transparency notice only. */
  showVoterNames: boolean;
}

export type JoinResponse =
  | {
      ok: true;
      playerId: string;
      reconnectToken: string;
      nickname: string;
      snapshot: PlayerSnapshot;
    }
  | { ok: false; code: string; message: string };

export interface AnswerRequest {
  questionId: string;
  optionId: string;
}

export interface AnswerResponse extends Ack {
  /** Echoes the locked-in option so the client can reflect it reliably. */
  acceptedOptionId?: string;
}

// ---------- Host control ----------

export type HostAction = 'START' | 'NEXT' | 'SKIP' | 'END';

export interface HostSnapshot {
  sessionId: string;
  pin: string;
  state: SessionState;
  currentQuestionIndex: number;
  totalQuestions: number;
  title: string;
  /** Full question (with correct answers) — host is admin-authenticated. */
  currentQuestion: Question | null;
  serverNow: number;
  endsAt: number | null;
  players: PlayerSummary[];
  answeredCount: number;
  /** Present when state is REVEAL. */
  results: QuestionResults | null;
  /** Present when state is LEADERBOARD or ENDED. */
  leaderboard: LeaderboardEntry[];
  /** Effective per-session value of the "show voter names" setting. */
  showVoterNames: boolean;
}

export type HostJoinResponse =
  | { ok: true; snapshot: HostSnapshot }
  | { ok: false; code: string; message: string };

// ---------- Server -> client ----------

export interface ServerToClientEvents {
  'session:state': (p: {
    state: SessionState;
    currentQuestionIndex: number;
    totalQuestions: number;
  }) => void;

  // Host lobby
  'lobby:update': (p: { players: PlayerSummary[]; count: number }) => void;
  'lobby:playerJoined': (p: { player: PlayerSummary }) => void;
  'lobby:playerLeft': (p: { playerId: string }) => void;

  // Question lifecycle (host gets full Question via snapshot; the live
  // broadcast carries only the public shape so players are always safe).
  'question:start': (p: {
    question: PublicQuestion;
    serverNow: number;
    endsAt: number | null;
  }) => void;
  'question:progress': (p: { answered: number; total: number }) => void;
  'question:end': (p: { questionId: string }) => void;

  // Reveal — includes correctOptionIds (allowed now, for everyone).
  reveal: (p: { results: QuestionResults }) => void;
  'player:result': (p: { result: PlayerResult }) => void;

  // Leaderboard / podium
  leaderboard: (p: { top: LeaderboardEntry[]; full: LeaderboardEntry[] }) => void;
  'session:ended': (p: {
    podium: LeaderboardEntry[];
    full: LeaderboardEntry[];
  }) => void;

  // Player lifecycle
  'player:kicked': (p: { reason: string }) => void;

  // Broadcast when the host toggles the "show voter names" setting mid-session,
  // so the player transparency notice and the host UI update immediately.
  'voterNames:update': (p: { enabled: boolean }) => void;

  errorMsg: (p: { code: string; message: string }) => void;
}

// ---------- Client -> server ----------

export interface ClientToServerEvents {
  'player:join': (p: JoinRequest, ack: (res: JoinResponse) => void) => void;
  'player:answer': (
    p: AnswerRequest,
    ack: (res: AnswerResponse) => void,
  ) => void;

  'host:join': (
    p: { sessionId: string },
    ack: (res: HostJoinResponse) => void,
  ) => void;
  'host:action': (
    p: { sessionId: string; action: HostAction },
    ack: (res: Ack) => void,
  ) => void;
  'host:kick': (
    p: { sessionId: string; playerId: string },
    ack: (res: Ack) => void,
  ) => void;
  /** Toggle the "show voter names" setting for this session only. */
  'host:setVoterNames': (
    p: { sessionId: string; enabled: boolean },
    ack: (res: Ack) => void,
  ) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  role?: 'host' | 'player';
  sessionId?: string;
  playerId?: string;
  isAdmin?: boolean;
}

/** Stable error codes used across the socket + REST layers. */
export const ErrorCodes = {
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_NOT_JOINABLE: 'SESSION_NOT_JOINABLE',
  NICKNAME_TAKEN: 'NICKNAME_TAKEN',
  NICKNAME_INVALID: 'NICKNAME_INVALID',
  NICKNAME_PROFANE: 'NICKNAME_PROFANE',
  PIN_INVALID: 'PIN_INVALID',
  RATE_LIMITED: 'RATE_LIMITED',
  NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  QUESTION_NOT_ACTIVE: 'QUESTION_NOT_ACTIVE',
  ALREADY_ANSWERED: 'ALREADY_ANSWERED',
  ANSWER_TOO_LATE: 'ANSWER_TOO_LATE',
  PLAYER_KICKED: 'PLAYER_KICKED',
  OPTION_INVALID: 'OPTION_INVALID',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
