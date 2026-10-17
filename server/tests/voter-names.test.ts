import { describe, expect, it } from 'vitest';
import type { QuestionResults } from '@livevote/shared';
import { SessionEngine } from '../src/session/engine.js';
import { CapturingEmitter, FakeScheduler, makePollSet, makeQuizSet } from './helpers.js';
import type { LoadedSet } from '../src/session/types.js';

function engineFor(set: LoadedSet) {
  const emitter = new CapturingEmitter();
  const scheduler = new FakeScheduler();
  const engine = new SessionEngine({ sessionId: 's', pin: '000000', set, emitter, scheduler });
  return { engine, emitter, scheduler };
}

function revealPayload(emitter: CapturingEmitter): QuestionResults {
  return (emitter.find('reveal').at(-1)!.payload as { results: QuestionResults }).results;
}

/** No player-facing payload (broadcast to all, or to a player) may carry names. */
function assertNoNamesLeakToPlayers(emitter: CapturingEmitter) {
  const playerFacing = emitter.events.filter((e) => e.scope === 'all' || e.scope === 'player');
  for (const e of playerFacing) {
    const json = JSON.stringify(e.payload);
    expect(json).not.toContain('"voters"');
    expect(json).not.toContain('"noAnswer"');
  }
}

describe('show voter names — OFF by default', () => {
  it('reveal results omit voters/noAnswer entirely', () => {
    const { engine, emitter } = engineFor(makeQuizSet()); // showVoterNames: false
    engine.addPlayer({ id: 'p0', nickname: 'Ann', reconnectToken: 't0' });
    engine.addPlayer({ id: 'p1', nickname: 'Bob', reconnectToken: 't1' });
    engine.startGame();
    engine.submitAnswer('p0', 'q1', { kind: 'option', optionId: 'q1a' });
    engine.submitAnswer('p1', 'q1', { kind: 'option', optionId: 'q1b' }); // -> reveal
    const results = revealPayload(emitter);
    expect(results.voters).toBeUndefined();
    expect(results.noAnswer).toBeUndefined();
    assertNoNamesLeakToPlayers(emitter);
  });
});

describe('show voter names — ON', () => {
  function onQuiz(): LoadedSet {
    return { ...makeQuizSet(), showVoterNames: true };
  }

  it('lists the nicknames under each option, with correct option identified', () => {
    const { engine, emitter } = engineFor(onQuiz());
    engine.addPlayer({ id: 'p0', nickname: 'Ann', reconnectToken: 't0' });
    engine.addPlayer({ id: 'p1', nickname: 'Bob', reconnectToken: 't1' });
    engine.addPlayer({ id: 'p2', nickname: 'Cy', reconnectToken: 't2' });
    engine.startGame();
    engine.submitAnswer('p0', 'q1', { kind: 'option', optionId: 'q1a' }); // correct
    engine.submitAnswer('p1', 'q1', { kind: 'option', optionId: 'q1a' }); // correct
    engine.submitAnswer('p2', 'q1', { kind: 'option', optionId: 'q1b' }); // wrong -> reveal

    const results = revealPayload(emitter);
    expect(results.voters).toBeDefined();
    const correctVoters = results.voters!.find((v) => v.optionId === 'q1a')!;
    expect(correctVoters.nicknames.sort()).toEqual(['Ann', 'Bob']);
    expect(results.correctOptionIds).toEqual(['q1a']);
    const wrongVoters = results.voters!.find((v) => v.optionId === 'q1b')!;
    expect(wrongVoters.nicknames).toEqual(['Cy']);
    expect(results.noAnswer).toEqual([]);
  });

  it('lists players who did not answer under noAnswer', () => {
    const { engine, emitter, scheduler } = engineFor(onQuiz());
    engine.addPlayer({ id: 'p0', nickname: 'Ann', reconnectToken: 't0' });
    engine.addPlayer({ id: 'p1', nickname: 'Zed', reconnectToken: 't1' });
    engine.startGame();
    engine.submitAnswer('p0', 'q1', { kind: 'option', optionId: 'q1a' });
    scheduler.advance(20_000); // Zed never answered -> timer reveal
    const results = revealPayload(emitter);
    expect(results.noAnswer).toEqual(['Zed']);
  });

  it('works in POLL mode (names without correctness)', () => {
    const { engine, emitter } = engineFor({ ...makePollSet(), showVoterNames: true });
    engine.addPlayer({ id: 'p0', nickname: 'Ann', reconnectToken: 't0' });
    engine.addPlayer({ id: 'p1', nickname: 'Bob', reconnectToken: 't1' });
    engine.startGame();
    engine.submitAnswer('p0', 'p1', { kind: 'option', optionId: 'p1a' });
    engine.submitAnswer('p1', 'p1', { kind: 'option', optionId: 'p1a' }); // -> reveal
    const results = revealPayload(emitter);
    expect(results.correctOptionIds).toEqual([]);
    expect(results.voters!.find((v) => v.optionId === 'p1a')!.nicknames.sort()).toEqual([
      'Ann',
      'Bob',
    ]);
  });

  it('still never leaks names to player-facing payloads', () => {
    const { engine, emitter } = engineFor(onQuiz());
    engine.addPlayer({ id: 'p0', nickname: 'Ann', reconnectToken: 't0' });
    engine.addPlayer({ id: 'p1', nickname: 'Bob', reconnectToken: 't1' });
    engine.startGame();
    engine.submitAnswer('p0', 'q1', { kind: 'option', optionId: 'q1a' });
    engine.submitAnswer('p1', 'q1', { kind: 'option', optionId: 'q1b' });
    assertNoNamesLeakToPlayers(emitter);
    // The host-only reveal is where names live.
    expect(emitter.find('reveal').at(-1)!.scope).toBe('host');
  });
});

describe('per-session override', () => {
  it('toggling on mid-REVEAL re-sends the host chart with names', () => {
    const { engine, emitter } = engineFor(makeQuizSet()); // starts OFF
    engine.addPlayer({ id: 'p0', nickname: 'Ann', reconnectToken: 't0' });
    engine.addPlayer({ id: 'p1', nickname: 'Bob', reconnectToken: 't1' });
    engine.startGame();
    engine.submitAnswer('p0', 'q1', { kind: 'option', optionId: 'q1a' });
    engine.submitAnswer('p1', 'q1', { kind: 'option', optionId: 'q1b' }); // -> REVEAL (no names)
    expect(revealPayload(emitter).voters).toBeUndefined();

    emitter.clear();
    engine.setShowVoterNames(true);
    // Broadcasts the new setting to everyone (for the player notice)...
    const update = emitter.find('voterNames:update').at(-1)!;
    expect(update.scope).toBe('all');
    expect((update.payload as { enabled: boolean }).enabled).toBe(true);
    // ...and re-sends the chart to the host, now with names.
    expect(revealPayload(emitter).voters).toBeDefined();

    emitter.clear();
    engine.setShowVoterNames(false);
    expect(revealPayload(emitter).voters).toBeUndefined();
  });

  it('a per-session toggle does not mutate the saved set object', () => {
    const set = makeQuizSet(); // showVoterNames: false
    const { engine } = engineFor(set);
    engine.setShowVoterNames(true);
    expect(engine.showVoterNames).toBe(true);
    expect(set.showVoterNames).toBe(false); // the set is untouched
  });

  it('defaults the session value from the set', () => {
    const { engine } = engineFor({ ...makeQuizSet(), showVoterNames: true });
    expect(engine.showVoterNames).toBe(true);
    expect(engine.hostSnapshot().showVoterNames).toBe(true);
  });
});
