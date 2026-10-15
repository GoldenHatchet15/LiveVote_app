import {
  computeScore,
  ErrorCodes,
  LATE_ANSWER_GRACE_MS,
  type HostSnapshot,
  type LeaderboardEntry,
  type PlayerResult,
  type PlayerSnapshot,
  type PlayerSummary,
  type PublicQuestion,
  type Question,
  type QuestionResults,
  type SessionState,
} from '@livevote/shared';
import {
  nullEmitter,
  realScheduler,
  type AnswerEffect,
  type EngineHooks,
  type EngineResult,
  type LoadedQuestion,
  type LoadedSet,
  type RevealEffect,
  type RuntimePlayer,
  type Scheduler,
  type SessionEmitter,
} from './types.js';

export interface EngineOptions {
  sessionId: string;
  pin: string;
  set: LoadedSet;
  emitter?: SessionEmitter;
  scheduler?: Scheduler;
  hooks?: EngineHooks;
}

function toPublicQuestion(q: LoadedQuestion, total: number): PublicQuestion {
  return {
    id: q.id,
    index: q.order,
    total,
    text: q.text,
    imageUrl: q.imageUrl,
    mode: q.mode,
    options: q.options.map((o) => ({ id: o.id, text: o.text, index: o.index })),
    timeLimitSec: q.timeLimitSec,
    points: q.points,
  };
}

function toFullQuestion(q: LoadedQuestion): Question {
  return {
    id: q.id,
    text: q.text,
    imageUrl: q.imageUrl,
    mode: q.mode,
    options: q.options.map((o) => ({ id: o.id, text: o.text, index: o.index })),
    correctOptionIds: q.options.filter((o) => o.isCorrect).map((o) => o.id),
    timeLimitSec: q.timeLimitSec,
    points: q.points,
    order: q.order,
  };
}

/**
 * Authoritative, in-memory game session. Single source of truth for state,
 * timers and scoring. All game logic lives here and is synchronous so it can be
 * unit-tested without a database or sockets. Mutating methods broadcast via the
 * injected emitter and return "effects" the manager persists to SQLite.
 */
export class SessionEngine {
  readonly sessionId: string;
  readonly pin: string;
  private readonly set: LoadedSet;
  private readonly emitter: SessionEmitter;
  private readonly scheduler: Scheduler;
  private readonly hooks: EngineHooks;

  state: SessionState = 'LOBBY';
  currentQuestionIndex = 0;
  questionStartedAt: number | null = null;
  questionEndsAt: number | null = null;

  readonly players = new Map<string, RuntimePlayer>();
  private timerHandle: unknown = null;
  /** Points each player gained on the most recently revealed question. */
  private lastGain = new Map<string, number>();

  constructor(opts: EngineOptions) {
    this.sessionId = opts.sessionId;
    this.pin = opts.pin;
    this.set = opts.set;
    this.emitter = opts.emitter ?? nullEmitter;
    this.scheduler = opts.scheduler ?? realScheduler;
    this.hooks = opts.hooks ?? {};
  }

  private safeHook(fn: (() => void) | undefined): void {
    if (!fn) return;
    try {
      fn();
    } catch {
      // Persistence is best-effort; in-memory state remains authoritative.
    }
  }

  // ---------------------------------------------------------------- helpers

  get totalQuestions(): number {
    return this.set.questions.length;
  }

  get title(): string {
    return this.set.title;
  }

  private currentLoaded(): LoadedQuestion | null {
    return this.set.questions[this.currentQuestionIndex] ?? null;
  }

  /** Non-kicked players — the population that "all answered" is measured against. */
  private activePlayers(): RuntimePlayer[] {
    return [...this.players.values()].filter((p) => !p.kicked);
  }

  private answeredCount(questionId: string): number {
    return this.activePlayers().filter((p) => p.answers.has(questionId)).length;
  }

  private clearTimer(): void {
    if (this.timerHandle !== null) {
      this.scheduler.clearTimer(this.timerHandle);
      this.timerHandle = null;
    }
  }

  // ---------------------------------------------------------------- players

  addPlayer(p: {
    id: string;
    nickname: string;
    reconnectToken: string;
    score?: number;
    streak?: number;
    kicked?: boolean;
  }): RuntimePlayer {
    const existing = this.players.get(p.id);
    if (existing) {
      existing.connected = true;
      return existing;
    }
    const player: RuntimePlayer = {
      id: p.id,
      nickname: p.nickname,
      reconnectToken: p.reconnectToken,
      score: p.score ?? 0,
      streak: p.streak ?? 0,
      kicked: p.kicked ?? false,
      connected: true,
      joinedAt: this.scheduler.now(),
      answers: new Map(),
    };
    this.players.set(player.id, player);
    return player;
  }

  findByToken(token: string): RuntimePlayer | undefined {
    for (const p of this.players.values()) {
      if (p.reconnectToken === token) return p;
    }
    return undefined;
  }

  findByNickname(nickname: string): RuntimePlayer | undefined {
    const key = nickname.toLowerCase();
    for (const p of this.players.values()) {
      if (p.nickname.toLowerCase() === key) return p;
    }
    return undefined;
  }

  setConnected(playerId: string, connected: boolean): void {
    const p = this.players.get(playerId);
    if (p) p.connected = connected;
  }

  playerSummaries(): PlayerSummary[] {
    return [...this.players.values()]
      .filter((p) => !p.kicked)
      .map((p) => ({
        id: p.id,
        nickname: p.nickname,
        score: p.score,
        streak: p.streak,
        kicked: p.kicked,
        connected: p.connected,
      }));
  }

  kick(playerId: string): EngineResult {
    const p = this.players.get(playerId);
    if (!p) {
      return { ok: false, code: ErrorCodes.INTERNAL, message: 'No such player' };
    }
    p.kicked = true;
    p.connected = false;
    this.emitter.toPlayer(playerId, 'player:kicked', {
      reason: 'Removed by the host',
    });
    this.emitter.toHost('lobby:playerLeft', { playerId });
    this.broadcastLobby();
    this.maybeAutoEnd();
    return { ok: true };
  }

  // ---------------------------------------------------------------- transitions

  startGame(): EngineResult {
    if (this.state !== 'LOBBY') {
      return invalid('Game can only start from the lobby');
    }
    if (this.totalQuestions === 0) {
      return invalid('This set has no questions');
    }
    this.currentQuestionIndex = 0;
    this.beginQuestion();
    return { ok: true };
  }

  /** Host "Skip": force the current question to end now. */
  skip(): EngineResult {
    if (this.state !== 'QUESTION') {
      return invalid('Nothing to skip');
    }
    this.reveal();
    return { ok: true };
  }

  /** Host "Next": advance from REVEAL/LEADERBOARD to the next screen. */
  next(): EngineResult {
    if (this.state === 'REVEAL') {
      const q = this.currentLoaded();
      // QUIZ questions show a leaderboard between questions; POLL skips it.
      if (q && q.mode === 'QUIZ') {
        this.showLeaderboard();
        return { ok: true };
      }
      return this.advanceOrEnd();
    }
    if (this.state === 'LEADERBOARD') {
      return this.advanceOrEnd();
    }
    return invalid('Nothing to advance');
  }

  end(): EngineResult {
    if (this.state === 'ENDED') return { ok: true };
    this.clearTimer();
    this.state = 'ENDED';
    this.questionStartedAt = null;
    this.questionEndsAt = null;
    const full = this.leaderboard();
    this.emitState();
    this.emitter.toAll('session:ended', { podium: full.slice(0, 3), full });
    return { ok: true };
  }

  private advanceOrEnd(): EngineResult {
    if (this.currentQuestionIndex >= this.totalQuestions - 1) {
      return this.end();
    }
    this.currentQuestionIndex += 1;
    this.beginQuestion();
    return { ok: true };
  }

  private beginQuestion(): void {
    const q = this.currentLoaded();
    if (!q) {
      this.end();
      return;
    }
    this.clearTimer();
    this.state = 'QUESTION';
    this.questionStartedAt = this.scheduler.now();
    this.questionEndsAt =
      q.timeLimitSec === null
        ? null
        : this.questionStartedAt + q.timeLimitSec * 1000;

    this.emitState();
    this.emitter.toAll('question:start', {
      question: toPublicQuestion(q, this.totalQuestions),
      serverNow: this.questionStartedAt,
      endsAt: this.questionEndsAt,
    });
    this.emitProgress();

    if (q.timeLimitSec !== null) {
      this.timerHandle = this.scheduler.setTimer(q.timeLimitSec * 1000, () => {
        this.timerHandle = null;
        if (this.state === 'QUESTION') this.reveal();
      });
    }
  }

  private showLeaderboard(): void {
    this.state = 'LEADERBOARD';
    this.emitState();
    const full = this.leaderboard();
    this.emitter.toHost('leaderboard', { top: full.slice(0, 5), full });
  }

  // ---------------------------------------------------------------- answers

  submitAnswer(
    playerId: string,
    questionId: string,
    optionId: string,
  ): EngineResult<AnswerEffect> {
    const player = this.players.get(playerId);
    if (!player) return invalidTyped(ErrorCodes.INTERNAL, 'Unknown player');
    if (player.kicked) {
      return invalidTyped(ErrorCodes.PLAYER_KICKED, 'You have been removed');
    }
    if (this.state !== 'QUESTION') {
      return invalidTyped(ErrorCodes.QUESTION_NOT_ACTIVE, 'No active question');
    }
    const q = this.currentLoaded();
    if (!q || q.id !== questionId) {
      return invalidTyped(ErrorCodes.QUESTION_NOT_ACTIVE, 'Question changed');
    }
    if (player.answers.has(questionId)) {
      return invalidTyped(ErrorCodes.ALREADY_ANSWERED, 'Already answered');
    }
    if (!q.options.some((o) => o.id === optionId)) {
      return invalidTyped(ErrorCodes.OPTION_INVALID, 'Unknown option');
    }
    const now = this.scheduler.now();
    if (this.questionEndsAt !== null && now > this.questionEndsAt + LATE_ANSWER_GRACE_MS) {
      return invalidTyped(ErrorCodes.ANSWER_TOO_LATE, 'Time is up');
    }

    const responseMs = Math.max(0, now - (this.questionStartedAt ?? now));
    player.answers.set(questionId, {
      optionId,
      responseMs,
      pointsAwarded: 0,
      correct: null,
    });

    const effect: AnswerEffect = { playerId, questionId, optionId, responseMs };
    this.safeHook(() => this.hooks.onAnswer?.(effect));

    this.emitProgress();
    // When every active player has answered, end the question immediately.
    this.maybeAutoEnd();

    return { ok: true, value: effect };
  }

  private maybeAutoEnd(): void {
    if (this.state !== 'QUESTION') return;
    const q = this.currentLoaded();
    if (!q) return;
    const active = this.activePlayers();
    if (active.length > 0 && this.answeredCount(q.id) >= active.length) {
      this.reveal();
    }
  }

  // ---------------------------------------------------------------- reveal / scoring

  /** Transition QUESTION -> REVEAL, scoring every player's answer. */
  private reveal(): RevealEffect | null {
    const q = this.currentLoaded();
    if (!q || this.state !== 'QUESTION') return null;
    this.clearTimer();
    this.state = 'REVEAL';
    this.questionEndsAt = null;

    const correctOptionIds = q.options.filter((o) => o.isCorrect).map((o) => o.id);
    const correctSet = new Set(correctOptionIds);

    const counts = new Map<string, number>();
    for (const o of q.options) counts.set(o.id, 0);

    this.lastGain.clear();
    const perPlayer: RevealEffect['perPlayer'] = [];

    for (const player of this.players.values()) {
      if (player.kicked) continue;
      const answer = player.answers.get(q.id) ?? null;
      const answered = answer !== null;
      if (answer) counts.set(answer.optionId, (counts.get(answer.optionId) ?? 0) + 1);

      const correct =
        q.mode === 'POLL'
          ? null
          : answered
            ? correctSet.has(answer!.optionId)
            : false;

      const { pointsAwarded, newStreak } = computeScore({
        mode: q.mode,
        points: q.points,
        correct: correct === true,
        answered,
        responseTimeMs: answer?.responseMs ?? 0,
        timeLimitSec: q.timeLimitSec,
        previousStreak: player.streak,
      });

      player.score += pointsAwarded;
      player.streak = newStreak;
      this.lastGain.set(player.id, pointsAwarded);

      if (answer) {
        answer.pointsAwarded = pointsAwarded;
        answer.correct = correct;
      }

      perPlayer.push({
        playerId: player.id,
        optionId: answer?.optionId ?? null,
        responseMs: answer?.responseMs ?? 0,
        correct,
        pointsAwarded,
        newScore: player.score,
        newStreak: player.streak,
      });
    }

    const totalPlayers = this.activePlayers().length;
    const totalAnswers = this.answeredCount(q.id);
    const tallies = q.options.map((o) => {
      const count = counts.get(o.id) ?? 0;
      return {
        optionId: o.id,
        count,
        percent: totalAnswers === 0 ? 0 : Math.round((count / totalAnswers) * 100),
      };
    });

    const results: QuestionResults = {
      questionId: q.id,
      mode: q.mode,
      correctOptionIds: q.mode === 'QUIZ' ? correctOptionIds : [],
      tallies,
      totalAnswers,
      totalPlayers,
    };

    // Broadcast: host gets the chart; each player gets only their own result.
    this.emitState();
    this.emitter.toAll('question:end', { questionId: q.id });
    this.emitter.toHost('reveal', { results });

    const leaderboard = this.leaderboard();
    const rankById = new Map(leaderboard.map((e) => [e.playerId, e.rank]));
    for (const row of perPlayer) {
      const player = this.players.get(row.playerId)!;
      const result: PlayerResult = {
        questionId: q.id,
        mode: q.mode,
        answered: row.optionId !== null,
        correct: row.correct,
        selectedOptionId: row.optionId,
        pointsAwarded: row.pointsAwarded,
        totalScore: player.score,
        streak: player.streak,
        rank: rankById.get(row.playerId) ?? 0,
        totalPlayers,
      };
      this.emitter.toPlayer(row.playerId, 'player:result', { result });
    }

    const effect: RevealEffect = { questionId: q.id, results, perPlayer };
    this.safeHook(() => this.hooks.onReveal?.(effect));
    return effect;
  }

  /** Expose a manual reveal that also returns the effect (used by host skip path). */
  revealNow(): RevealEffect | null {
    return this.reveal();
  }

  // ---------------------------------------------------------------- leaderboard

  leaderboard(): LeaderboardEntry[] {
    const sorted = this.activePlayers().sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.nickname.localeCompare(b.nickname);
    });
    return sorted.map((p, i) => ({
      playerId: p.id,
      nickname: p.nickname,
      score: p.score,
      rank: i + 1,
      lastGain: this.lastGain.get(p.id) ?? 0,
    }));
  }

  // ---------------------------------------------------------------- broadcasts

  private emitState(): void {
    this.emitter.toAll('session:state', {
      state: this.state,
      currentQuestionIndex: this.currentQuestionIndex,
      totalQuestions: this.totalQuestions,
    });
    this.safeHook(() =>
      this.hooks.onStateChange?.({
        state: this.state,
        currentQuestionIndex: this.currentQuestionIndex,
        questionStartedAt: this.questionStartedAt,
        endedAt: this.state === 'ENDED' ? this.scheduler.now() : null,
      }),
    );
  }

  broadcastLobby(): void {
    const players = this.playerSummaries();
    this.emitter.toHost('lobby:update', { players, count: players.length });
  }

  private emitProgress(): void {
    const q = this.currentLoaded();
    if (!q) return;
    this.emitter.toHost('question:progress', {
      answered: this.answeredCount(q.id),
      total: this.activePlayers().length,
    });
  }

  announcePlayerJoined(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p || p.kicked) return;
    this.emitter.toHost('lobby:playerJoined', {
      player: {
        id: p.id,
        nickname: p.nickname,
        score: p.score,
        streak: p.streak,
        kicked: p.kicked,
        connected: p.connected,
      },
    });
    this.broadcastLobby();
  }

  // ---------------------------------------------------------------- snapshots

  publicCurrentQuestion(): PublicQuestion | null {
    const q = this.currentLoaded();
    return q ? toPublicQuestion(q, this.totalQuestions) : null;
  }

  private currentResults(): QuestionResults | null {
    const q = this.currentLoaded();
    if (!q || this.state !== 'REVEAL') return null;
    const totalAnswers = this.answeredCount(q.id);
    const counts = new Map<string, number>();
    for (const o of q.options) counts.set(o.id, 0);
    for (const p of this.activePlayers()) {
      const a = p.answers.get(q.id);
      if (a) counts.set(a.optionId, (counts.get(a.optionId) ?? 0) + 1);
    }
    return {
      questionId: q.id,
      mode: q.mode,
      correctOptionIds:
        q.mode === 'QUIZ' ? q.options.filter((o) => o.isCorrect).map((o) => o.id) : [],
      tallies: q.options.map((o) => {
        const count = counts.get(o.id) ?? 0;
        return {
          optionId: o.id,
          count,
          percent: totalAnswers === 0 ? 0 : Math.round((count / totalAnswers) * 100),
        };
      }),
      totalAnswers,
      totalPlayers: this.activePlayers().length,
    };
  }

  hostSnapshot(): HostSnapshot {
    const q = this.currentLoaded();
    return {
      sessionId: this.sessionId,
      pin: this.pin,
      state: this.state,
      currentQuestionIndex: this.currentQuestionIndex,
      totalQuestions: this.totalQuestions,
      title: this.set.title,
      currentQuestion:
        q && this.state !== 'LOBBY' ? toFullQuestion(q) : null,
      serverNow: this.scheduler.now(),
      endsAt: this.questionEndsAt,
      players: this.playerSummaries(),
      answeredCount: q ? this.answeredCount(q.id) : 0,
      results: this.currentResults(),
      leaderboard:
        this.state === 'LEADERBOARD' || this.state === 'ENDED'
          ? this.leaderboard()
          : [],
    };
  }

  playerSnapshot(playerId: string): PlayerSnapshot {
    const p = this.players.get(playerId);
    const q = this.currentLoaded();
    const answer = q && p ? p.answers.get(q.id) : undefined;
    const leaderboard = this.leaderboard();
    const rank = leaderboard.find((e) => e.playerId === playerId)?.rank ?? 0;

    let lastResult: PlayerResult | null = null;
    if (this.state === 'REVEAL' && q && p) {
      lastResult = {
        questionId: q.id,
        mode: q.mode,
        answered: !!answer,
        correct: answer?.correct ?? (q.mode === 'POLL' ? null : false),
        selectedOptionId: answer?.optionId ?? null,
        pointsAwarded: answer?.pointsAwarded ?? 0,
        totalScore: p.score,
        streak: p.streak,
        rank,
        totalPlayers: this.activePlayers().length,
      };
    }

    return {
      state: this.state,
      question:
        this.state === 'QUESTION' && q ? toPublicQuestion(q, this.totalQuestions) : null,
      serverNow: this.scheduler.now(),
      endsAt: this.questionEndsAt,
      hasAnswered: !!answer,
      selectedOptionId: answer?.optionId ?? null,
      score: p?.score ?? 0,
      streak: p?.streak ?? 0,
      rank,
      totalPlayers: this.activePlayers().length,
      lastResult,
    };
  }
}

function invalid(message: string): EngineResult {
  return { ok: false, code: ErrorCodes.INVALID_TRANSITION, message };
}
function invalidTyped<T>(code: string, message: string): EngineResult<T> {
  return { ok: false, code, message };
}
