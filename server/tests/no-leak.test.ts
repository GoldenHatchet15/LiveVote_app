import { describe, expect, it } from 'vitest';
import { SessionEngine } from '../src/session/engine.js';
import { CapturingEmitter, FakeScheduler, makeQuizSet } from './helpers.js';

/**
 * M3 acceptance: correct answers are NEVER sent to players before REVEAL.
 * We assert on every player-facing payload (broadcast to all, or to a specific
 * player) and on the player snapshot used for (re)join.
 */
describe('no correct-answer leak before reveal', () => {
  function jsonHas(obj: unknown, key: string): boolean {
    return JSON.stringify(obj).includes(`"${key}"`);
  }

  it('question:start and player snapshot carry no correctOptionIds', () => {
    const emitter = new CapturingEmitter();
    const engine = new SessionEngine({
      sessionId: 's',
      pin: '000000',
      set: makeQuizSet(),
      emitter,
      scheduler: new FakeScheduler(),
    });
    engine.addPlayer({ id: 'p0', nickname: 'Ann', reconnectToken: 't0' });
    engine.addPlayer({ id: 'p1', nickname: 'Bob', reconnectToken: 't1' });
    engine.startGame();

    // Nothing broadcast to players/all so far may mention correct answers.
    const playerFacing = emitter.events.filter(
      (e) => e.scope === 'all' || e.scope === 'player',
    );
    expect(playerFacing.length).toBeGreaterThan(0);
    for (const e of playerFacing) {
      expect(jsonHas(e.payload, 'correctOptionIds')).toBe(false);
    }

    // The public question shape has no correct-answer field at all.
    const pub = engine.publicCurrentQuestion()!;
    expect(jsonHas(pub, 'correctOptionIds')).toBe(false);
    expect(jsonHas(pub, 'isCorrect')).toBe(false);

    // A player (re)join snapshot mid-QUESTION is also clean.
    const snap = engine.playerSnapshot('p0');
    expect(jsonHas(snap, 'correctOptionIds')).toBe(false);
    expect(jsonHas(snap, 'isCorrect')).toBe(false);
  });

  it('correct answers appear only once REVEAL is reached', () => {
    const emitter = new CapturingEmitter();
    const engine = new SessionEngine({
      sessionId: 's',
      pin: '000000',
      set: makeQuizSet(),
      emitter,
      scheduler: new FakeScheduler(),
    });
    engine.addPlayer({ id: 'p0', nickname: 'Ann', reconnectToken: 't0' });
    engine.startGame();
    emitter.clear();
    engine.skip(); // -> REVEAL

    // After reveal, the host chart may include correct answers.
    const reveal = emitter.find('reveal');
    expect(reveal.length).toBe(1);
    expect(jsonHas(reveal[0]!.payload, 'correctOptionIds')).toBe(true);
    // And that reveal event targets the host.
    expect(reveal[0]!.scope).toBe('host');
  });
});
