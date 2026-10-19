import { beforeEach, describe, expect, it } from 'vitest';
import type { PlayerResult, QuestionResults } from '@livevote/shared';
import { SessionEngine } from '../src/session/engine.js';
import {
  CapturingEmitter,
  FakeScheduler,
  makePollSet,
  makeQuizSet,
} from './helpers.js';

function newEngine(set = makeQuizSet()) {
  const emitter = new CapturingEmitter();
  const scheduler = new FakeScheduler();
  const engine = new SessionEngine({
    sessionId: 's1',
    pin: '123456',
    set,
    emitter,
    scheduler,
  });
  return { engine, emitter, scheduler };
}

function addPlayers(engine: SessionEngine, names: string[]) {
  return names.map((n, i) =>
    engine.addPlayer({ id: `p${i}`, nickname: n, reconnectToken: `t${i}` }),
  );
}

describe('state machine', () => {
  let ctx: ReturnType<typeof newEngine>;
  beforeEach(() => {
    ctx = newEngine();
  });

  it('starts in LOBBY', () => {
    expect(ctx.engine.state).toBe('LOBBY');
  });

  it('rejects answering before the game starts', () => {
    addPlayers(ctx.engine, ['Ann']);
    const r = ctx.engine.submitAnswer('p0', 'q1', { kind: 'option', optionId: 'q1a' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('QUESTION_NOT_ACTIVE');
  });

  it('rejects NEXT/SKIP from LOBBY (invalid transitions)', () => {
    expect(ctx.engine.next().ok).toBe(false);
    expect(ctx.engine.skip().ok).toBe(false);
  });

  it('START moves LOBBY -> QUESTION', () => {
    addPlayers(ctx.engine, ['Ann']);
    expect(ctx.engine.startGame().ok).toBe(true);
    expect(ctx.engine.state).toBe('QUESTION');
    expect(ctx.engine.currentQuestionIndex).toBe(0);
  });

  it('rejects a second START', () => {
    addPlayers(ctx.engine, ['Ann']);
    ctx.engine.startGame();
    expect(ctx.engine.startGame().ok).toBe(false);
  });

  it('SKIP moves QUESTION -> REVEAL', () => {
    addPlayers(ctx.engine, ['Ann']);
    ctx.engine.startGame();
    expect(ctx.engine.skip().ok).toBe(true);
    expect(ctx.engine.state).toBe('REVEAL');
  });

  it('QUIZ: REVEAL -> LEADERBOARD -> next QUESTION', () => {
    addPlayers(ctx.engine, ['Ann']);
    ctx.engine.startGame();
    ctx.engine.skip();
    expect(ctx.engine.next().ok).toBe(true);
    expect(ctx.engine.state).toBe('LEADERBOARD');
    expect(ctx.engine.next().ok).toBe(true);
    expect(ctx.engine.state).toBe('QUESTION');
    expect(ctx.engine.currentQuestionIndex).toBe(1);
  });

  it('POLL: REVEAL skips LEADERBOARD and advances/ends', () => {
    const poll = newEngine(makePollSet());
    addPlayers(poll.engine, ['Ann']);
    poll.engine.startGame();
    poll.engine.skip();
    expect(poll.engine.state).toBe('REVEAL');
    // Poll with a results summary enabled -> REVEAL -> SUMMARY -> ENDED (no leaderboard).
    expect(poll.engine.next().ok).toBe(true);
    expect(poll.engine.state).toBe('SUMMARY');
    expect(poll.engine.next().ok).toBe(true);
    expect(poll.engine.state).toBe('ENDED');
  });

  it('ENDS after the last question', () => {
    addPlayers(ctx.engine, ['Ann']);
    ctx.engine.startGame(); // q0
    ctx.engine.skip();
    ctx.engine.next(); // leaderboard
    ctx.engine.next(); // q1
    ctx.engine.skip();
    ctx.engine.next(); // leaderboard
    ctx.engine.next(); // ended
    expect(ctx.engine.state).toBe('ENDED');
  });

  it('END works from any state', () => {
    addPlayers(ctx.engine, ['Ann']);
    ctx.engine.startGame();
    expect(ctx.engine.end().ok).toBe(true);
    expect(ctx.engine.state).toBe('ENDED');
  });
});

describe('timers', () => {
  it('auto-ends the question when the timer expires', () => {
    const { engine, scheduler } = newEngine();
    addPlayers(engine, ['Ann']);
    engine.startGame();
    expect(engine.state).toBe('QUESTION');
    scheduler.advance(20_000);
    expect(engine.state).toBe('REVEAL');
  });

  it('auto-ends early when every active player has answered', () => {
    const { engine } = newEngine();
    addPlayers(engine, ['Ann', 'Bob']);
    engine.startGame();
    engine.submitAnswer('p0', 'q1', { kind: 'option', optionId: 'q1a' });
    expect(engine.state).toBe('QUESTION');
    engine.submitAnswer('p1', 'q1', { kind: 'option', optionId: 'q1b' });
    expect(engine.state).toBe('REVEAL');
  });
});

describe('answers', () => {
  it('rejects a duplicate answer', () => {
    const { engine } = newEngine();
    addPlayers(engine, ['Ann', 'Bob']);
    engine.startGame();
    expect(engine.submitAnswer('p0', 'q1', { kind: 'option', optionId: 'q1a' }).ok).toBe(true);
    const dup = engine.submitAnswer('p0', 'q1', { kind: 'option', optionId: 'q1b' });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.code).toBe('ALREADY_ANSWERED');
  });

  it('rejects a late answer past the grace window', () => {
    const { engine, scheduler } = newEngine();
    addPlayers(engine, ['Ann', 'Bob']);
    engine.startGame();
    scheduler.current = 20_000 + 800; // beyond 750ms grace
    const r = engine.submitAnswer('p0', 'q1', { kind: 'option', optionId: 'q1a' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ANSWER_TOO_LATE');
  });

  it('rejects answers from kicked players', () => {
    const { engine } = newEngine();
    addPlayers(engine, ['Ann', 'Bob']);
    engine.startGame();
    engine.kick('p0');
    const r = engine.submitAnswer('p0', 'q1', { kind: 'option', optionId: 'q1a' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('PLAYER_KICKED');
  });

  it('rejects an unknown option', () => {
    const { engine } = newEngine();
    addPlayers(engine, ['Ann']);
    engine.startGame();
    const r = engine.submitAnswer('p0', 'q1', { kind: 'option', optionId: 'nope' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('OPTION_INVALID');
  });
});

describe('reveal, scoring and leaderboard', () => {
  it('tallies answers and marks the correct option', () => {
    const { engine, emitter } = newEngine();
    addPlayers(engine, ['Ann', 'Bob', 'Cy']);
    engine.startGame();
    engine.submitAnswer('p0', 'q1', { kind: 'option', optionId: 'q1a' }); // correct
    engine.submitAnswer('p1', 'q1', { kind: 'option', optionId: 'q1a' }); // correct
    engine.submitAnswer('p2', 'q1', { kind: 'option', optionId: 'q1b' }); // wrong -> auto reveal
    expect(engine.state).toBe('REVEAL');

    const reveal = emitter.find('reveal').at(-1)!.payload as {
      results: QuestionResults;
    };
    expect(reveal.results.correctOptionIds).toEqual(['q1a']);
    const paris = reveal.results.tallies.find((t) => t.optionId === 'q1a')!;
    expect(paris.count).toBe(2);
    expect(paris.percent).toBe(67);
    expect(reveal.results.totalAnswers).toBe(3);
  });

  it('builds a leaderboard ordered by score', () => {
    const { engine } = newEngine();
    addPlayers(engine, ['Ann', 'Bob']);
    engine.startGame();
    engine.submitAnswer('p0', 'q1', { kind: 'option', optionId: 'q1a' }); // correct, fast (t=0)
    engine.submitAnswer('p1', 'q1', { kind: 'option', optionId: 'q1b' }); // wrong
    const board = engine.leaderboard();
    expect(board[0]!.nickname).toBe('Ann');
    expect(board[0]!.score).toBe(1000);
    expect(board[0]!.rank).toBe(1);
    expect(board[1]!.score).toBe(0);
  });

  it('sends each player their own result at reveal', () => {
    const { engine, emitter } = newEngine();
    addPlayers(engine, ['Ann', 'Bob']);
    engine.startGame();
    engine.submitAnswer('p0', 'q1', { kind: 'option', optionId: 'q1a' });
    engine.submitAnswer('p1', 'q1', { kind: 'option', optionId: 'q1b' });
    const results = emitter
      .find('player:result')
      .map((e) => ({ pid: e.playerId, r: (e.payload as { result: PlayerResult }).result }));
    const ann = results.find((x) => x.pid === 'p0')!;
    const bob = results.find((x) => x.pid === 'p1')!;
    expect(ann.r.correct).toBe(true);
    expect(ann.r.pointsAwarded).toBe(1000);
    expect(bob.r.correct).toBe(false);
    expect(bob.r.pointsAwarded).toBe(0);
  });

  it('POLL reveal has no correct answers and no scoring', () => {
    const poll = newEngine(makePollSet());
    addPlayers(poll.engine, ['Ann']);
    poll.engine.startGame();
    poll.engine.submitAnswer('p0', 'p1', { kind: 'option', optionId: 'p1a' });
    expect(poll.engine.state).toBe('REVEAL');
    const reveal = poll.emitter.find('reveal').at(-1)!.payload as {
      results: QuestionResults;
    };
    expect(reveal.results.correctOptionIds).toEqual([]);
    expect(poll.engine.leaderboard()[0]!.score).toBe(0);
  });
});
