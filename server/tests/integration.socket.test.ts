import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import type {
  JoinResponse,
  PlayerResult,
  QuestionResults,
} from '@livevote/shared';
import { buildApp, type BuiltApp } from '../src/app.js';
import { signAdminToken } from '../src/auth.js';
import { prisma } from '../src/db.js';
import { sessionManager } from '../src/session/manager.js';

const PLAYER_COUNT = 50;
const CORRECT_COUNT = 30;

let built: BuiltApp;
let port: number;
let setId: string;
let correctOptionId: string;
let wrongOptionId: string;
let questionId: string;

function url(): string {
  return `http://localhost:${port}`;
}

function connect(extraHeaders?: Record<string, string>): Socket {
  return ioClient(url(), {
    transports: ['websocket'],
    forceNew: true,
    extraHeaders,
  });
}

function once<T = unknown>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, (p: T) => resolve(p)));
}

beforeAll(async () => {
  built = buildApp();
  await new Promise<void>((resolve) => built.server.listen(0, resolve));
  port = (built.server.address() as AddressInfo).port;

  const set = await prisma.questionSet.create({
    data: {
      title: `__it_${Date.now()}`,
      description: null,
      questions: {
        create: [
          {
            text: 'Correct is A',
            mode: 'QUIZ',
            timeLimitSec: 30,
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

describe('50 concurrent players', () => {
  it('join, answer, and receive correct results with no answer leak', async () => {
    // Host creates the session in-process.
    const engine = await sessionManager.createSession(setId);
    expect(engine).toBeTruthy();
    const pin = engine!.pin;

    // Host connects (admin cookie) and subscribes.
    const host = connect({ Cookie: `lv_admin=${signAdminToken()}` });
    await once(host, 'connect');
    const hostJoin = await new Promise<{ ok: boolean }>((resolve) =>
      host.emit('host:join', { sessionId: engine!.sessionId }, resolve),
    );
    expect(hostJoin.ok).toBe(true);

    // 50 players connect and join the lobby.
    const players: Socket[] = [];
    const joinResults: JoinResponse[] = [];
    for (let i = 0; i < PLAYER_COUNT; i++) {
      const sock = connect();
      players.push(sock);
    }
    await Promise.all(players.map((s) => once(s, 'connect')));

    await Promise.all(
      players.map(
        (sock, i) =>
          new Promise<void>((resolve) => {
            sock.emit(
              'player:join',
              { pin, nickname: `Player${i}` },
              (res: JoinResponse) => {
                joinResults[i] = res;
                resolve();
              },
            );
          }),
      ),
    );
    expect(joinResults.every((r) => r.ok)).toBe(true);

    // Every player arms a listener for the question and their personal result.
    const questionStarts = players.map((s) => once<{ question: unknown }>(s, 'question:start'));
    const playerResults = players.map((s) => once<{ result: PlayerResult }>(s, 'player:result'));
    const revealPromise = once<{ results: QuestionResults }>(host, 'reveal');

    // Host starts the game.
    await new Promise<void>((resolve) =>
      host.emit('host:action', { sessionId: engine!.sessionId, action: 'START' }, () =>
        resolve(),
      ),
    );

    const starts = await Promise.all(questionStarts);
    // No correct-answer leak on the wire.
    for (const s of starts) {
      expect(JSON.stringify(s)).not.toContain('correctOptionIds');
      expect(JSON.stringify(s)).not.toContain('isCorrect');
    }

    // First CORRECT_COUNT answer correctly; the rest answer wrong.
    await Promise.all(
      players.map(
        (sock, i) =>
          new Promise<void>((resolve) => {
            const optionId = i < CORRECT_COUNT ? correctOptionId : wrongOptionId;
            sock.emit('player:answer', { questionId, value: { kind: 'option', optionId } }, () => resolve());
          }),
      ),
    );

    // All answered -> auto reveal. Collect everyone's result.
    const results = (await Promise.all(playerResults)).map((p) => p.result);
    const reveal = await revealPromise;

    const correct = results.filter((r) => r.correct === true);
    const wrong = results.filter((r) => r.correct === false);
    expect(correct.length).toBe(CORRECT_COUNT);
    expect(wrong.length).toBe(PLAYER_COUNT - CORRECT_COUNT);
    expect(correct.every((r) => r.pointsAwarded >= 500)).toBe(true);
    expect(wrong.every((r) => r.pointsAwarded === 0)).toBe(true);

    // Host chart matches: correct option tallied CORRECT_COUNT times.
    expect(reveal.results.correctOptionIds).toEqual([correctOptionId]);
    const correctTally = reveal.results.tallies.find(
      (t) => t.optionId === correctOptionId,
    )!;
    expect(correctTally.count).toBe(CORRECT_COUNT);
    expect(reveal.results.totalAnswers).toBe(PLAYER_COUNT);

    // Clean up sockets.
    host.disconnect();
    players.forEach((s) => s.disconnect());
    sessionManager.dispose(engine!.sessionId);
  });
});
