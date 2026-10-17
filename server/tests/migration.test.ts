import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { sessionManager } from '../src/session/manager.js';
import { SessionEngine } from '../src/session/engine.js';
import { CapturingEmitter, FakeScheduler } from './helpers.js';

/**
 * Migration safety: a question row written WITHOUT the new type/config columns
 * (as all pre-migration rows effectively are — the migration backfills the
 * default) loads as MULTIPLE_CHOICE and plays exactly as before.
 */
let setId: string;

beforeAll(async () => {
  const set = await prisma.questionSet.create({
    data: {
      title: `__migrate_${Date.now()}`,
      // Note: type/config intentionally omitted (legacy shape).
      questions: {
        create: [
          {
            text: 'Legacy MC question',
            mode: 'QUIZ',
            timeLimitSec: 20,
            points: 'STANDARD',
            order: 0,
            options: {
              create: [
                { text: 'Right', index: 0, isCorrect: true },
                { text: 'Wrong', index: 1, isCorrect: false },
              ],
            },
          },
        ],
      },
    },
  });
  setId = set.id;
});

afterAll(async () => {
  await prisma.session.deleteMany({ where: { questionSetId: setId } });
  await prisma.questionSet.delete({ where: { id: setId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('legacy questions migrate to MULTIPLE_CHOICE', () => {
  it('loads with the default type and empty config', async () => {
    const loaded = await sessionManager.loadSet(setId);
    expect(loaded).toBeTruthy();
    const q = loaded!.questions[0]!;
    expect(q.type).toBe('MULTIPLE_CHOICE');
    expect(q.config).toEqual({});
    expect(q.options).toHaveLength(2);
  });

  it('plays unchanged: a correct option scores and reveals', async () => {
    const loaded = await sessionManager.loadSet(setId);
    const engine = new SessionEngine({
      sessionId: 'm1',
      pin: '000000',
      set: loaded!,
      emitter: new CapturingEmitter(),
      scheduler: new FakeScheduler(),
    });
    engine.addPlayer({ id: 'p0', nickname: 'Ann', reconnectToken: 't0' });
    engine.startGame();
    const q = loaded!.questions[0]!;
    const correctId = q.options.find((o) => o.isCorrect)!.id;
    const r = engine.submitAnswer('p0', q.id, { kind: 'option', optionId: correctId });
    expect(r.ok).toBe(true);
    expect(engine.state).toBe('REVEAL'); // one player, all answered
    expect(engine.leaderboard()[0]!.score).toBe(1000);
  });
});
