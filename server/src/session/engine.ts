import {
  AVATAR_EMOJIS,
  computeScore,
  ErrorCodes,
  gradeAnswer,
  isValidAvatar,
  LATE_ANSWER_GRACE_MS,
  normalizeText,
  normalizeWriteIn,
  PLAYER_COLORS,
  resolveMergeKey,
  toPublicConfig,
  type AnswerValue,
  type HostSnapshot,
  type LeaderboardEntry,
  type Option,
  type PlayerQuestionSummary,
  type PlayerResult,
  type PlayerSnapshot,
  type PlayerSummary,
  type PublicQuestion,
  type Question,
  type QuestionResults,
  type QuestionSummary,
  type SessionState,
  type SummaryWinner,
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
import { buildResults, prepareAnswer, type RevealEntry } from './answers.js';

/** Stable per-question shuffle (deterministic across snapshots). */
function shuffledOptions(q: LoadedQuestion): Option[] {
  const hash = (s: string): number => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  return [...q.options]
    .sort((a, b) => hash(q.id + a.id) - hash(q.id + b.id))
    .map((o) => ({ id: o.id, text: o.text, index: o.index }));
}

export interface EngineOptions {
  sessionId: string;
  pin: string;
  set: LoadedSet;
  emitter?: SessionEmitter;
  scheduler?: Scheduler;
  hooks?: EngineHooks;
}

function toPublicQuestion(
  q: LoadedQuestion,
  total: number,
  showVoterNames: boolean,
): PublicQuestion {
  // ORDERING players see the items shuffled; other option types keep order.
  const options =
    q.type === 'ORDERING'
      ? shuffledOptions(q)
      : q.options.map((o) => ({ id: o.id, text: o.text, index: o.index }));
  return {
    id: q.id,
    index: q.order,
    total,
    text: q.text,
    imageUrl: q.imageUrl,
    mode: q.mode,
    type: q.type,
    config: toPublicConfig(q.type, q.config),
    options,
    timeLimitSec: q.timeLimitSec,
    points: q.points,
    showVoterNames,
  };
}

function toFullQuestion(q: LoadedQuestion): Question {
  return {
    id: q.id,
    text: q.text,
    imageUrl: q.imageUrl,
    mode: q.mode,
    type: q.type,
    config: q.config,
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
  /** Per-session override of the set's "show voter names" setting. */
  showVoterNames: boolean;
  /** Per-session override of the set's "show results summary" setting. */
  showResultsSummary: boolean;

  readonly players = new Map<string, RuntimePlayer>();
  private timerHandle: unknown = null;
  /** Points each player gained on the most recently revealed question. */
  private lastGain = new Map<string, number>();
  /** Monotonic cursor so colours are assigned round-robin as players join. */
  private colorCursor = 0;
  /** WRITE_IN host moderation, per question id. */
  private writeInMerges = new Map<string, Record<string, string>>();
  private writeInHiddenGroups = new Map<string, Set<string>>();

  constructor(opts: EngineOptions) {
    this.sessionId = opts.sessionId;
    this.pin = opts.pin;
    this.set = opts.set;
    this.emitter = opts.emitter ?? nullEmitter;
    this.scheduler = opts.scheduler ?? realScheduler;
    this.hooks = opts.hooks ?? {};
    this.showVoterNames = opts.set.showVoterNames;
    this.showResultsSummary = opts.set.showResultsSummary;
  }

  /** Toggle the end-of-session summary for this session (host skip). */
  setShowSummary(enabled: boolean): EngineResult {
    this.showResultsSummary = enabled;
    return { ok: true };
  }

  /**
   * Toggle voter-name visibility for this session only (never persisted to the
   * saved set). Takes effect from the next reveal, or immediately if the host
   * is already on a reveal screen (the chart is re-sent with/without names).
   */
  setShowVoterNames(enabled: boolean): EngineResult {
    this.showVoterNames = enabled;
    this.emitter.toAll('voterNames:update', { enabled });
    if (this.state === 'REVEAL') {
      const results = this.currentResults();
      if (results) this.emitter.toHost('reveal', { results });
    }
    return { ok: true };
  }

  /** Active players' answers for a question, as reveal-building entries. */
  private entriesFor(q: LoadedQuestion): RevealEntry[] {
    return this.activePlayers().map((p) => ({
      playerId: p.id,
      nickname: p.nickname,
      avatarEmoji: p.avatarEmoji,
      color: p.color,
      answer: p.answers.get(q.id) ?? null,
    }));
  }

  /**
   * Host moderation for OPEN_ENDED: hide/unhide a player's response from the
   * screen and the word cloud. Re-sends the reveal to the host if live.
   */
  setHiddenResponse(playerId: string, hidden: boolean): EngineResult {
    const q = this.currentLoaded();
    const p = this.players.get(playerId);
    const answer = q && p ? p.answers.get(q.id) : undefined;
    if (!answer) return { ok: false, code: ErrorCodes.INTERNAL, message: 'No response to hide' };
    answer.hidden = hidden;
    this.reEmitRevealToHost();
    return { ok: true };
  }

  /** Re-send the reveal chart to the host after a moderation change. */
  private reEmitRevealToHost(): void {
    if (this.state !== 'REVEAL') return;
    const results = this.currentResults();
    if (results) this.emitter.toHost('reveal', { results });
  }

  // ---- WRITE_IN host moderation (merge / undo / hide group) ----

  mergeWriteIn(sourceKey: string, targetKey: string): EngineResult {
    const q = this.currentLoaded();
    if (!q || q.type !== 'WRITE_IN') return { ok: false, code: ErrorCodes.INTERNAL, message: 'Not a write-in question' };
    if (!sourceKey || !targetKey || sourceKey === targetKey) {
      return { ok: false, code: ErrorCodes.OPTION_INVALID, message: 'Invalid merge' };
    }
    const merges = this.writeInMerges.get(q.id) ?? {};
    merges[sourceKey] = targetKey;
    this.writeInMerges.set(q.id, merges);
    this.reEmitRevealToHost();
    return { ok: true };
  }

  undoMergeWriteIn(sourceKey: string): EngineResult {
    const q = this.currentLoaded();
    if (!q) return { ok: false, code: ErrorCodes.INTERNAL, message: 'No question' };
    const merges = this.writeInMerges.get(q.id);
    if (merges) delete merges[sourceKey];
    this.reEmitRevealToHost();
    return { ok: true };
  }

  hideWriteInGroup(key: string, hidden: boolean): EngineResult {
    const q = this.currentLoaded();
    if (!q) return { ok: false, code: ErrorCodes.INTERNAL, message: 'No question' };
    const set = this.writeInHiddenGroups.get(q.id) ?? new Set<string>();
    if (hidden) set.add(key);
    else set.delete(key);
    this.writeInHiddenGroups.set(q.id, set);
    this.reEmitRevealToHost();
    return { ok: true };
  }

  private writeInStateFor(q: LoadedQuestion): { merges?: Record<string, string>; hiddenGroups?: Set<string> } {
    return {
      merges: this.writeInMerges.get(q.id),
      hiddenGroups: this.writeInHiddenGroups.get(q.id),
    };
  }

  /** Host merge map for a WRITE_IN question (for CSV export). */
  writeInMergesOf(questionId: string): Record<string, string> {
    return this.writeInMerges.get(questionId) ?? {};
  }
  writeInHiddenGroupsOf(questionId: string): Set<string> {
    return this.writeInHiddenGroups.get(questionId) ?? new Set<string>();
  }

  // ---------------------------------------------------------------- results summary

  private pollQuestions(): LoadedQuestion[] {
    return this.set.questions.filter((q) => q.mode === 'POLL');
  }

  /** Human-readable rendering of an answer value (for the player summary). */
  private renderAnswerText(q: LoadedQuestion, value: AnswerValue): string {
    const textOf = (id: string) => q.options.find((o) => o.id === id)?.text ?? id;
    switch (value.kind) {
      case 'option':
        return textOf(value.optionId);
      case 'options':
        return value.optionIds.map(textOf).join(', ');
      case 'order':
        return value.order.map(textOf).join(' > ');
      case 'text':
        return value.text;
      case 'number':
        return String(value.value);
    }
  }

  /** Winner cards for a poll question's results. */
  private summaryWinners(q: LoadedQuestion, results: QuestionResults, withVoters: boolean): SummaryWinner[] {
    const w = results.winners;
    if (!w) return [];
    const percent = results.totalAnswers === 0 ? 0 : Math.round((w.count / results.totalAnswers) * 100);
    return w.keys.map((key) => {
      let label = key;
      let voters;
      if (q.type === 'MULTIPLE_CHOICE' || q.type === 'MULTI_SELECT' || q.type === 'TRUE_FALSE') {
        label = q.options.find((o) => o.id === key)?.text ?? key;
        voters = withVoters ? results.voters?.find((v) => v.optionId === key)?.voters : undefined;
      } else if (q.type === 'RATING') {
        voters = withVoters ? results.voterGroups?.find((g) => g.label === key)?.voters : undefined;
      } else if (q.type === 'WRITE_IN') {
        const g = results.writeIn?.groups.find((gg) => gg.key === key);
        label = g?.label ?? key;
        voters = withVoters ? g?.voters : undefined;
      }
      return { label, count: w.count, percent, ...(voters ? { voters } : {}) };
    });
  }

  /** Did this player's answer match a top answer (post-moderation)? */
  private matchesTop(q: LoadedQuestion, value: AnswerValue, keys: Set<string>): boolean {
    if (value.kind === 'option') return keys.has(value.optionId);
    if (value.kind === 'options') return value.optionIds.some((id) => keys.has(id));
    if (value.kind === 'number') return keys.has(String(value.value));
    if (value.kind === 'text') {
      if (q.type === 'WRITE_IN') {
        return keys.has(resolveMergeKey(normalizeWriteIn(value.text), this.writeInMerges.get(q.id) ?? {}));
      }
      return [...keys].some((k) => normalizeText(k) === normalizeText(value.text));
    }
    return false;
  }

  buildHostSummary(): QuestionSummary[] {
    return this.pollQuestions().map((q) => {
      const results = buildResults(q, this.entriesFor(q), this.showVoterNames, this.writeInStateFor(q));
      return {
        questionId: q.id,
        index: q.order,
        text: q.text,
        type: q.type,
        winners: this.summaryWinners(q, results, this.showVoterNames),
        tie: results.winners?.tie ?? false,
        totalAnswers: results.totalAnswers,
      };
    });
  }

  buildPlayerSummary(playerId: string): PlayerQuestionSummary[] {
    const player = this.players.get(playerId);
    return this.pollQuestions().map((q) => {
      const results = buildResults(q, this.entriesFor(q), false, this.writeInStateFor(q));
      const winnerKeys = new Set(results.winners?.keys ?? []);
      const answer = player?.answers.get(q.id);
      const visible = answer && !answer.hidden ? answer : undefined;
      return {
        questionId: q.id,
        index: q.order,
        text: q.text,
        winners: this.summaryWinners(q, results, false).map(({ label, count, percent }) => ({ label, count, percent })),
        tie: results.winners?.tie ?? false,
        yourAnswer: visible ? this.renderAnswerText(q, visible.value) : null,
        youMatchedTop: !!visible && this.matchesTop(q, visible.value, winnerKeys),
      };
    });
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
    avatarEmoji?: string;
    color?: string;
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
      avatarEmoji: p.avatarEmoji ?? AVATAR_EMOJIS[0]!,
      color: p.color ?? PLAYER_COLORS[0]!,
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

  /** Round-robin colour so players who join near each other look different. */
  assignColor(): string {
    const color = PLAYER_COLORS[this.colorCursor % PLAYER_COLORS.length]!;
    this.colorCursor += 1;
    return color;
  }

  /**
   * Resolve an avatar: keep the requested one if it's valid and still free;
   * otherwise give an unused one; once all are taken, allow duplicates.
   */
  resolveAvatar(requested?: string): string {
    const taken = new Set(
      [...this.players.values()].filter((p) => !p.kicked).map((p) => p.avatarEmoji),
    );
    if (requested && isValidAvatar(requested) && !taken.has(requested)) return requested;
    const free = AVATAR_EMOJIS.filter((e) => !taken.has(e));
    if (free.length > 0) return free[Math.floor(Math.random() * free.length)]!;
    return requested && isValidAvatar(requested) ? requested : AVATAR_EMOJIS[0]!;
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
        avatarEmoji: p.avatarEmoji,
        color: p.color,
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
    if (this.state === 'SUMMARY') {
      return this.end();
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
      return this.endOrSummary();
    }
    this.currentQuestionIndex += 1;
    this.beginQuestion();
    return { ok: true };
  }

  /** After the last question: show the poll results summary first (if enabled
   *  and there are poll questions), otherwise go straight to the end. */
  private endOrSummary(): EngineResult {
    const hasPoll = this.set.questions.some((q) => q.mode === 'POLL');
    if (this.showResultsSummary && hasPoll) {
      this.clearTimer();
      this.state = 'SUMMARY';
      this.questionStartedAt = null;
      this.questionEndsAt = null;
      this.emitState();
      this.emitter.toHost('session:summary', { questions: this.buildHostSummary() });
      for (const p of this.activePlayers()) {
        this.emitter.toPlayer(p.id, 'player:summary', { questions: this.buildPlayerSummary(p.id) });
      }
      return { ok: true };
    }
    return this.end();
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
      question: toPublicQuestion(q, this.totalQuestions, this.showVoterNames),
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
    value: AnswerValue,
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
    const prepared = prepareAnswer(q, value);
    if (!prepared.ok) {
      return invalidTyped(prepared.code, prepared.message);
    }
    const now = this.scheduler.now();
    if (this.questionEndsAt !== null && now > this.questionEndsAt + LATE_ANSWER_GRACE_MS) {
      return invalidTyped(ErrorCodes.ANSWER_TOO_LATE, 'Time is up');
    }

    const responseMs = Math.max(0, now - (this.questionStartedAt ?? now));
    player.answers.set(questionId, {
      value: prepared.value,
      responseMs,
      pointsAwarded: 0,
      correct: null,
    });

    const effect: AnswerEffect = { playerId, questionId, value: prepared.value, responseMs };
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

    this.lastGain.clear();
    const perPlayer: RevealEffect['perPlayer'] = [];

    for (const player of this.players.values()) {
      if (player.kicked) continue;
      const answer = player.answers.get(q.id) ?? null;
      const answered = answer !== null;

      const { correct, creditFactor } = gradeAnswer(q.type, q.config, q.options, answer?.value ?? null);

      const { pointsAwarded, newStreak } = computeScore({
        mode: q.mode,
        points: q.points,
        correct: correct === true,
        answered,
        responseTimeMs: answer?.responseMs ?? 0,
        timeLimitSec: q.timeLimitSec,
        previousStreak: player.streak,
        creditFactor,
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
        value: answer?.value ?? null,
        responseMs: answer?.responseMs ?? 0,
        correct,
        pointsAwarded,
        newScore: player.score,
        newStreak: player.streak,
      });
    }

    const totalPlayers = this.activePlayers().length;
    const results = buildResults(q, this.entriesFor(q), this.showVoterNames, this.writeInStateFor(q));

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
        answered: row.value !== null,
        correct: row.correct,
        selectedValue: row.value,
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
      avatarEmoji: p.avatarEmoji,
      color: p.color,
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
        avatarEmoji: p.avatarEmoji,
        color: p.color,
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
    return q ? toPublicQuestion(q, this.totalQuestions, this.showVoterNames) : null;
  }

  private currentResults(): QuestionResults | null {
    const q = this.currentLoaded();
    if (!q || this.state !== 'REVEAL') return null;
    return buildResults(q, this.entriesFor(q), this.showVoterNames, this.writeInStateFor(q));
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
      showVoterNames: this.showVoterNames,
      showResultsSummary: this.showResultsSummary,
      summary: this.state === 'SUMMARY' ? this.buildHostSummary() : null,
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
        selectedValue: answer?.value ?? null,
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
        this.state === 'QUESTION' && q
          ? toPublicQuestion(q, this.totalQuestions, this.showVoterNames)
          : null,
      serverNow: this.scheduler.now(),
      endsAt: this.questionEndsAt,
      hasAnswered: !!answer,
      selectedValue: answer?.value ?? null,
      score: p?.score ?? 0,
      streak: p?.streak ?? 0,
      rank,
      totalPlayers: this.activePlayers().length,
      lastResult,
      showVoterNames: this.showVoterNames,
      summary: this.state === 'SUMMARY' ? this.buildPlayerSummary(playerId) : null,
      avatarEmoji: p?.avatarEmoji ?? AVATAR_EMOJIS[0]!,
      color: p?.color ?? PLAYER_COLORS[0]!,
    };
  }
}

function invalid(message: string): EngineResult {
  return { ok: false, code: ErrorCodes.INVALID_TRANSITION, message };
}
function invalidTyped<T>(code: string, message: string): EngineResult<T> {
  return { ok: false, code, message };
}
