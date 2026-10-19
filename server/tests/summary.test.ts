import { describe, expect, it } from 'vitest';
import type { QuestionSummary, PlayerQuestionSummary } from '@livevote/shared';
import { SessionEngine } from '../src/session/engine.js';
import { CapturingEmitter, FakeScheduler } from './helpers.js';
import type { LoadedSet } from '../src/session/types.js';

function pollSet(showVoterNames = true, showResultsSummary = true): LoadedSet {
  return {
    id: 's',
    title: 'Poll',
    description: null,
    showVoterNames,
    showResultsSummary,
    questions: [
      {
        id: 'q1',
        text: 'Cats or dogs?',
        imageUrl: null,
        mode: 'POLL',
        type: 'MULTIPLE_CHOICE',
        config: {},
        timeLimitSec: 20,
        points: 'NONE',
        order: 0,
        options: [
          { id: 'cat', text: 'Cats', index: 0, isCorrect: false },
          { id: 'dog', text: 'Dogs', index: 1, isCorrect: false },
        ],
      },
    ],
  };
}

function setup(set = pollSet()) {
  const emitter = new CapturingEmitter();
  const engine = new SessionEngine({ sessionId: 's', pin: '000000', set, emitter, scheduler: new FakeScheduler() });
  ['Ann', 'Bob', 'Cy'].forEach((n, i) => engine.addPlayer({ id: 'p' + i, nickname: n, reconnectToken: 't' + i, avatarEmoji: '🐸', color: '#000' }));
  engine.startGame();
  engine.submitAnswer('p0', 'q1', { kind: 'option', optionId: 'cat' });
  engine.submitAnswer('p1', 'q1', { kind: 'option', optionId: 'cat' });
  engine.submitAnswer('p2', 'q1', { kind: 'option', optionId: 'dog' }); // all answered -> REVEAL
  return { engine, emitter };
}

describe('results summary flow', () => {
  it('poll session: REVEAL -> SUMMARY -> ENDED', () => {
    const { engine } = setup();
    expect(engine.state).toBe('REVEAL');
    engine.next();
    expect(engine.state).toBe('SUMMARY');
    engine.next();
    expect(engine.state).toBe('ENDED');
  });

  it('host summary has the winner with count, % and voters (names ON)', () => {
    const { engine, emitter } = setup();
    engine.next(); // -> SUMMARY
    const payload = emitter.find('session:summary').at(-1)!.payload as { questions: QuestionSummary[] };
    expect(payload.questions).toHaveLength(1);
    const card = payload.questions[0]!;
    expect(card.winners).toHaveLength(1);
    expect(card.winners[0]!.label).toBe('Cats');
    expect(card.winners[0]!.count).toBe(2);
    expect(card.winners[0]!.percent).toBe(67);
    expect(card.winners[0]!.voters!.map((v) => v.nickname).sort()).toEqual(['Ann', 'Bob']);
  });

  it('player summary: own answer + "voted with the majority", no other names', () => {
    const { engine, emitter } = setup();
    engine.next(); // -> SUMMARY
    const byPlayer = (pid: string) =>
      (emitter.events.find((e) => e.scope === 'player' && e.playerId === pid && e.event === 'player:summary')!
        .payload as { questions: PlayerQuestionSummary[] }).questions[0]!;
    const ann = byPlayer('p0');
    expect(ann.yourAnswer).toBe('Cats');
    expect(ann.youMatchedTop).toBe(true);
    const cy = byPlayer('p2');
    expect(cy.yourAnswer).toBe('Dogs');
    expect(cy.youMatchedTop).toBe(false);
    // Player payloads never carry voter names.
    for (const e of emitter.events.filter((x) => x.event === 'player:summary')) {
      expect(JSON.stringify(e.payload)).not.toContain('"voters"');
    }
  });

  it('names OFF: host summary winners have no voters', () => {
    const { engine, emitter } = setup(pollSet(false, true));
    engine.next();
    const card = (emitter.find('session:summary').at(-1)!.payload as { questions: QuestionSummary[] }).questions[0]!;
    expect(card.winners[0]!.voters).toBeUndefined();
  });

  it('skips the summary when disabled (set-level or host toggle)', () => {
    expect(setup(pollSet(true, false)).engine.state).toBe('REVEAL'); // still mid-reveal
    const { engine } = setup(pollSet(true, false));
    engine.next();
    expect(engine.state).toBe('ENDED'); // no summary

    const s2 = setup();
    s2.engine.setShowSummary(false);
    s2.engine.next();
    expect(s2.engine.state).toBe('ENDED');
  });
});
