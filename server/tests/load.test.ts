import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import type { JoinResponse, PlayerResult, QuestionResults } from '@livevote/shared';
import { buildApp, type BuiltApp } from '../src/app.js';
import { signAdminToken } from '../src/auth.js';
import { prisma } from '../src/db.js';
import { sessionManager } from '../src/session/manager.js';

const N = 100;

let built: BuiltApp;
let port: number;
let setId: string;
let questionId: string;
let correctOptionId: string;
let wrongOptionId: string;

const url = () => `http://localhost:${port}`;
const once = <T>(s: Socket, e: string): Promise<T> =>
  new Promise((r) => s.once(e, (p: T) => r(p)));

beforeAll(async () => {
  built = buildApp();
  await new Promise<void>((resolve) => built.server.listen(0, resolve));
  port = (built.server.address() as AddressInfo).port;
  const set = await prisma.questionSet.create({
    data: {
      title: `__load_${Date.now()}`,
      questions: {
        create: [
          {
            text: 'Load Q',
            mode: 'QUIZ',
            timeLimitSec: 60,
            points: 'STANDARD',
            order: 0,
            options: {
              create: [
                { text: 'A', index: 0, isCorrect: true },
                { text: 'B', index: 1, isCorrect: false },
              ],
            },
          },
        ],
      },
    },
    include: { questions: { include: { options: true } } },
  });
  setId = set.id;
  questionId = set.questions[0]!.id;
  correctOptionId = set.questions[0]!.options.find((o) => o.isCorrect)!.id;
  wrongOptionId = set.questions[0]!.options.find((o) => !o.isCorrect)!.id;
});

afterAll(async () => {
  built.io.close();
  await new Promise<void>((resolve) => built.server.close(() => resolve()));
  await prisma.session.deleteMany({ where: { questionSetId: setId } });
  await prisma.questionSet.delete({ where: { id: setId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('load: 100 concurrent players, no dropped answers', () => {
  it('counts every answer and delivers every result', async () => {
    const engine = await sessionManager.createSession(setId);
    const pin = engine!.pin;

    const host = ioClient(url(), {
      transports: ['websocket'],
      forceNew: true,
      extraHeaders: { Cookie: `lv_admin=${signAdminToken()}` },
    });
    await once(host, 'connect');
    await new Promise<void>((resolve) =>
      host.emit('host:join', { sessionId: engine!.sessionId }, () => resolve()),
    );

    const players: Socket[] = Array.from({ length: N }, () =>
      ioClient(url(), { transports: ['websocket'], forceNew: true }),
    );
    await Promise.all(players.map((s) => once(s, 'connect')));

    const joins = await Promise.all(
      players.map(
        (s, i) =>
          new Promise<JoinResponse>((resolve) =>
            s.emit('player:join', { pin, nickname: `L${i}` }, resolve),
          ),
      ),
    );
    expect(joins.filter((j) => j.ok).length).toBe(N);

    const resultPromises = players.map((s) => once<{ result: PlayerResult }>(s, 'player:result'));
    const revealPromise = once<{ results: QuestionResults }>(host, 'reveal');

    await new Promise<void>((resolve) =>
      host.emit('host:action', { sessionId: engine!.sessionId, action: 'START' }, () => resolve()),
    );
    await Promise.all(players.map((s) => once(s, 'question:start')));

    // Every player answers (half correct, half wrong) as fast as possible.
    await Promise.all(
      players.map(
        (s, i) =>
          new Promise<void>((resolve) =>
            s.emit(
              'player:answer',
              { questionId, value: { kind: 'option' as const, optionId: i % 2 === 0 ? correctOptionId : wrongOptionId } },
              () => resolve(),
            ),
          ),
      ),
    );

    const results = await Promise.all(resultPromises);
    const reveal = await revealPromise;

    // No dropped answers: tally total equals the player count, and every
    // player received exactly one personal result.
    expect(reveal.results.totalAnswers).toBe(N);
    expect(results.length).toBe(N);
    const correctCount = reveal.results.tallies.find((t) => t.optionId === correctOptionId)!.count;
    expect(correctCount).toBe(Math.ceil(N / 2));

    host.disconnect();
    players.forEach((s) => s.disconnect());
    sessionManager.dispose(engine!.sessionId);
  }, 30000);
});
