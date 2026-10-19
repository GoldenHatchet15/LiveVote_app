import { describe, expect, it } from 'vitest';
import type { QuestionResults } from '@livevote/shared';
import { SessionEngine } from '../src/session/engine.js';
import { prepareAnswer } from '../src/session/answers.js';
import { CapturingEmitter, FakeScheduler } from './helpers.js';
import type { LoadedSet, LoadedQuestion } from '../src/session/types.js';

function writeInSet(
  showVoterNames: boolean,
  config: LoadedQuestion['config'] = {},
): LoadedSet {
  return {
    id: 'wi',
    title: 'Write-in',
    description: null,
    showVoterNames,
    showResultsSummary: true,
    questions: [
      {
        id: 'w1',
        text: 'Most likely to skateboard to class?',
        imageUrl: null,
        mode: 'POLL',
        type: 'WRITE_IN',
        config,
        timeLimitSec: 30,
        points: 'NONE',
        order: 0,
        options: [],
      },
    ],
  };
}

function engineFor(set: LoadedSet) {
  const emitter = new CapturingEmitter();
  const scheduler = new FakeScheduler();
  const engine = new SessionEngine({ sessionId: 's', pin: '000000', set, emitter, scheduler });
  return { engine, emitter, scheduler };
}

function reveal(emitter: CapturingEmitter): QuestionResults {
  return (emitter.find('reveal').at(-1)!.payload as { results: QuestionResults }).results;
}

/** Add 5 players and submit the example answers, then force reveal. */
function playExample(engine: SessionEngine, scheduler: FakeScheduler) {
  const subs: [string, string, string][] = [
    ['p0', 'Ana', 'carlos'],
    ['p1', 'Luis', 'Carlos'],
    ['p2', 'Pedro', 'CARLOS'],
    ['p3', 'Marta', 'José'],
    ['p4', 'Kevin', 'jose'],
  ];
  subs.forEach(([id, nick], i) => engine.addPlayer({ id, nickname: nick, reconnectToken: 't' + i, avatarEmoji: '🐸', color: '#0d9488' }));
  engine.startGame();
  subs.forEach(([id, , text], i) => {
    scheduler.current = i; // distinct response times -> submission order
    engine.submitAnswer(id, 'w1', { kind: 'text', text });
  });
  scheduler.advance(30_000); // timer -> reveal (not everyone needed; all answered already)
}

describe('WRITE_IN reveal grouping', () => {
  it('groups case/accent variants with voter name tags when names ON', () => {
    const { engine, emitter, scheduler } = engineFor(writeInSet(true));
    playExample(engine, scheduler);
    const r = reveal(emitter);
    expect(r.questionType).toBe('WRITE_IN');
    const groups = r.writeIn!.groups;
    expect(groups).toHaveLength(2);
    expect(groups[0]!.label).toBe('Carlos');
    expect(groups[0]!.count).toBe(3);
    expect(groups[0]!.voters!.map((v) => v.nickname)).toEqual(['Ana', 'Luis', 'Pedro']);
    expect(groups[1]!.label).toBe('José');
    expect(groups[1]!.voters!.map((v) => v.nickname)).toEqual(['Marta', 'Kevin']);
  });

  it('names OFF: groups keep counts but carry NO voter names (host payload)', () => {
    const { engine, emitter, scheduler } = engineFor(writeInSet(false));
    playExample(engine, scheduler);
    const r = reveal(emitter);
    expect(r.writeIn!.groups[0]!.count).toBe(3);
    for (const g of r.writeIn!.groups) expect(g.voters).toBeUndefined();
  });

  it('never leaks other players’ answers/names to player-facing payloads', () => {
    const { engine, emitter, scheduler } = engineFor(writeInSet(true));
    playExample(engine, scheduler);
    const playerFacing = emitter.events.filter((e) => e.scope === 'all' || e.scope === 'player');
    for (const e of playerFacing) {
      const json = JSON.stringify(e.payload);
      expect(json).not.toContain('"writeIn"');
      expect(json).not.toContain('"voters"');
    }
    // The grouped reveal (with names) is host-only.
    expect(emitter.find('reveal').at(-1)!.scope).toBe('host');
  });

  it('does not affect scores, streaks or the leaderboard', () => {
    const { engine, scheduler } = engineFor(writeInSet(true));
    playExample(engine, scheduler);
    expect(engine.leaderboard().every((e) => e.score === 0)).toBe(true);
    expect([...engine.players.values()].every((p) => p.streak === 0)).toBe(true);
  });
});

describe('WRITE_IN host moderation', () => {
  function setup() {
    const ctx = engineFor(writeInSet(true));
    const subs: [string, string, string][] = [
      ['p0', 'Ana', 'jose'],
      ['p1', 'Luis', 'joes'],
      ['p2', 'Pedro', 'carlos'],
    ];
    subs.forEach(([id, nick], i) => ctx.engine.addPlayer({ id, nickname: nick, reconnectToken: 't' + i, avatarEmoji: '🐸', color: '#000' }));
    ctx.engine.startGame();
    subs.forEach(([id, , text]) => ctx.engine.submitAnswer(id, 'w1', { kind: 'text', text }));
    ctx.engine.skip(); // -> REVEAL
    return ctx;
  }

  it('offers a duplicate suggestion and merges on request', () => {
    const { engine, emitter } = setup();
    const before = reveal(emitter);
    expect(
      before.writeIn!.duplicates!.some(
        (d) => (d.a === 'jose' && d.b === 'joes') || (d.a === 'joes' && d.b === 'jose'),
      ),
    ).toBe(true);
    expect(before.writeIn!.groups).toHaveLength(3); // jose, joes, carlos

    emitter.clear();
    expect(engine.mergeWriteIn('joes', 'jose').ok).toBe(true);
    const after = reveal(emitter);
    const jose = after.writeIn!.groups.find((g) => g.key === 'jose')!;
    expect(jose.count).toBe(2);
    expect(jose.voters!.map((v) => v.nickname).sort()).toEqual(['Ana', 'Luis']);
    expect(after.writeIn!.groups.some((g) => g.key === 'joes')).toBe(false);

    emitter.clear();
    engine.undoMergeWriteIn('joes');
    expect(reveal(emitter).writeIn!.groups).toHaveLength(3); // merge undone
  });

  it('hides a whole group (removed from reveal + counts)', () => {
    const { engine, emitter } = setup();
    emitter.clear();
    engine.hideWriteInGroup('carlos', true);
    const r = reveal(emitter);
    expect(r.writeIn!.groups.some((g) => g.key === 'carlos')).toBe(false);
  });

  it('hides an individual answer via setHiddenResponse', () => {
    const { engine, emitter } = setup();
    emitter.clear();
    engine.setHiddenResponse('p2', true); // Pedro -> carlos
    const r = reveal(emitter);
    expect(r.writeIn!.groups.some((g) => g.key === 'carlos')).toBe(false);
  });
});

describe('WRITE_IN validation', () => {
  const q = writeInSet(true, { onlySuggested: true, suggestedAnswers: ['Carlos', 'José'] }).questions[0]!;
  it('onlySuggested rejects answers not on the roster (server-side)', () => {
    expect(prepareAnswer(q, { kind: 'text', text: 'Nobody' }).ok).toBe(false);
    expect(prepareAnswer(q, { kind: 'text', text: 'carlos' }).ok).toBe(true); // case/accent-insensitive match
    expect(prepareAnswer(q, { kind: 'text', text: 'jose' }).ok).toBe(true);
  });
  it('rejects profanity and over-length', () => {
    const open = writeInSet(true, { maxAnswerLength: 5 }).questions[0]!;
    expect(prepareAnswer(open, { kind: 'text', text: 'toolong!!' }).ok).toBe(false);
    expect(prepareAnswer(open, { kind: 'text', text: 'shit' }).ok).toBe(false);
  });
});
