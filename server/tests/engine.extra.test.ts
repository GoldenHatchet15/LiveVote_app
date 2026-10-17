import { describe, expect, it } from 'vitest';
import { SessionEngine } from '../src/session/engine.js';
import { CapturingEmitter, FakeScheduler, makeQuizSet } from './helpers.js';
import type { LoadedSet } from '../src/session/types.js';

function newEngine(set: LoadedSet = makeQuizSet()) {
  const emitter = new CapturingEmitter();
  const scheduler = new FakeScheduler();
  const engine = new SessionEngine({ sessionId: 's1', pin: '123456', set, emitter, scheduler });
  return { engine, emitter, scheduler };
}

/** A three-question all-QUIZ set for streak testing. */
function threeQuizSet(): LoadedSet {
  const q = (id: string) => ({
    id,
    text: `Q ${id}`,
    imageUrl: null,
    mode: 'QUIZ' as const,
    timeLimitSec: 20 as const,
    points: 'STANDARD' as const,
    order: Number(id.slice(1)) - 1,
    options: [
      { id: `${id}a`, text: 'right', index: 0, isCorrect: true },
      { id: `${id}b`, text: 'wrong', index: 1, isCorrect: false },
    ],
  });
  return {
    id: 'three',
    title: 'Three',
    description: null,
    showVoterNames: false,
    questions: [q('q1'), q('q2'), q('q3')],
  };
}

describe('invalid transitions are rejected', () => {
  it('SKIP is invalid outside QUESTION', () => {
    const { engine } = newEngine();
    engine.addPlayer({ id: 'p0', nickname: 'Ann', reconnectToken: 't0' });
    engine.startGame();
    engine.skip(); // -> REVEAL
    expect(engine.skip().ok).toBe(false); // from REVEAL
    engine.next(); // -> LEADERBOARD
    expect(engine.skip().ok).toBe(false); // from LEADERBOARD
  });

  it('NEXT is invalid during QUESTION and LOBBY', () => {
    const { engine } = newEngine();
    engine.addPlayer({ id: 'p0', nickname: 'Ann', reconnectToken: 't0' });
    expect(engine.next().ok).toBe(false); // LOBBY
    engine.startGame();
    expect(engine.next().ok).toBe(false); // QUESTION
  });

  it('START is invalid once the game has begun', () => {
    const { engine } = newEngine();
    engine.addPlayer({ id: 'p0', nickname: 'Ann', reconnectToken: 't0' });
    engine.startGame();
    engine.skip();
    expect(engine.startGame().ok).toBe(false); // REVEAL
  });

  it('answers are rejected outside QUESTION', () => {
    const { engine } = newEngine();
    engine.addPlayer({ id: 'p0', nickname: 'Ann', reconnectToken: 't0' });
    engine.startGame();
    engine.skip(); // REVEAL
    const r = engine.submitAnswer('p0', 'q1', 'q1a');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('QUESTION_NOT_ACTIVE');
  });

  it('refuses to start a set with no questions', () => {
    const empty: LoadedSet = {
      id: 'e',
      title: 'Empty',
      description: null,
      showVoterNames: false,
      questions: [],
    };
    const { engine } = newEngine(empty);
    expect(engine.startGame().ok).toBe(false);
  });
});

describe('streak accumulation and reset across questions', () => {
  it('builds a streak over consecutive correct answers and resets on a wrong one', () => {
    const { engine } = newEngine(threeQuizSet());
    const p = engine.addPlayer({ id: 'p0', nickname: 'Ann', reconnectToken: 't0' });

    engine.startGame(); // q1
    engine.submitAnswer('p0', 'q1', 'q1a'); // correct -> streak 1
    expect(p.streak).toBe(1);
    engine.next(); // leaderboard
    engine.next(); // q2
    engine.submitAnswer('p0', 'q2', 'q2a'); // correct -> streak 2 (+100 bonus)
    expect(p.streak).toBe(2);
    engine.next();
    engine.next(); // q3
    engine.submitAnswer('p0', 'q3', 'q3b'); // wrong -> streak resets
    expect(p.streak).toBe(0);
  });

  it('a streak of 2 earns the +100 bonus on top of the base', () => {
    const { engine } = newEngine(threeQuizSet());
    const p = engine.addPlayer({ id: 'p0', nickname: 'Ann', reconnectToken: 't0' });
    engine.startGame();
    engine.submitAnswer('p0', 'q1', 'q1a'); // base 1000, streak 1
    const afterQ1 = p.score;
    engine.next();
    engine.next();
    engine.submitAnswer('p0', 'q2', 'q2a'); // base 1000 + 100 streak bonus
    expect(p.score - afterQ1).toBe(1100);
  });
});

describe('reconnect restores player identity at the engine level', () => {
  it('re-adding the same player id keeps score and streak and marks connected', () => {
    const { engine } = newEngine();
    const p = engine.addPlayer({ id: 'p0', nickname: 'Ann', reconnectToken: 't0' });
    engine.addPlayer({ id: 'p1', nickname: 'Bob', reconnectToken: 't1' });
    engine.startGame();
    engine.submitAnswer('p0', 'q1', 'q1a'); // Ann scores
    engine.submitAnswer('p1', 'q1', 'q1b');
    const score = p.score;
    expect(score).toBeGreaterThan(0);

    engine.setConnected('p0', false);
    // Reconnect: same id returns the SAME runtime player, untouched score.
    const again = engine.addPlayer({ id: 'p0', nickname: 'Ann', reconnectToken: 't0' });
    expect(again).toBe(p);
    expect(again.score).toBe(score);
    expect(again.connected).toBe(true);
  });

  it('findByToken locates the player for a reconnect', () => {
    const { engine } = newEngine();
    engine.addPlayer({ id: 'p0', nickname: 'Ann', reconnectToken: 'tok-abc' });
    expect(engine.findByToken('tok-abc')?.id).toBe('p0');
    expect(engine.findByToken('nope')).toBeUndefined();
  });

  it('a player snapshot mid-REVEAL restores the personal result', () => {
    const { engine } = newEngine();
    engine.addPlayer({ id: 'p0', nickname: 'Ann', reconnectToken: 't0' });
    engine.addPlayer({ id: 'p1', nickname: 'Bob', reconnectToken: 't1' });
    engine.startGame();
    engine.submitAnswer('p0', 'q1', 'q1a');
    engine.submitAnswer('p1', 'q1', 'q1b'); // -> REVEAL
    const snap = engine.playerSnapshot('p0');
    expect(snap.state).toBe('REVEAL');
    expect(snap.lastResult?.correct).toBe(true);
    expect(snap.lastResult?.pointsAwarded).toBeGreaterThan(0);
  });
});

describe('kicking affects the active population', () => {
  it('a kicked player is excluded from "all answered" auto-end', () => {
    const { engine } = newEngine();
    engine.addPlayer({ id: 'p0', nickname: 'Ann', reconnectToken: 't0' });
    engine.addPlayer({ id: 'p1', nickname: 'Bob', reconnectToken: 't1' });
    engine.startGame();
    engine.kick('p1'); // only Ann remains active
    engine.submitAnswer('p0', 'q1', 'q1a'); // all active answered -> reveal
    expect(engine.state).toBe('REVEAL');
    // Kicked player is not in the leaderboard.
    expect(engine.leaderboard().some((e) => e.playerId === 'p1')).toBe(false);
  });
});
