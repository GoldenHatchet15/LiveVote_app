import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import type { Ack, HostJoinResponse, JoinResponse } from '@livevote/shared';
import { buildApp, type BuiltApp } from '../src/app.js';
import { signAdminToken } from '../src/auth.js';
import { prisma } from '../src/db.js';
import { sessionManager } from '../src/session/manager.js';

let built: BuiltApp;
let port: number;
let setId: string;
const createdSessionIds: string[] = [];

const url = () => `http://localhost:${port}`;
const once = <T>(s: Socket, e: string): Promise<T> =>
  new Promise((r) => s.once(e, (p: T) => r(p)));
const host = () =>
  ioClient(url(), {
    transports: ['websocket'],
    forceNew: true,
    extraHeaders: { Cookie: `lv_admin=${signAdminToken()}` },
  });
const player = () => ioClient(url(), { transports: ['websocket'], forceNew: true });

function hostJoin(sock: Socket, sessionId: string): Promise<HostJoinResponse> {
  return new Promise((resolve) => sock.emit('host:join', { sessionId }, resolve));
}
function hostAction(sock: Socket, sessionId: string, action: string): Promise<Ack> {
  return new Promise((resolve) => sock.emit('host:action', { sessionId, action }, resolve));
}
function join(sock: Socket, pin: string, nickname: string): Promise<JoinResponse> {
  return new Promise((resolve) => sock.emit('player:join', { pin, nickname }, resolve));
}

beforeAll(async () => {
  built = buildApp();
  await new Promise<void>((resolve) => built.server.listen(0, resolve));
  port = (built.server.address() as AddressInfo).port;
  const set = await prisma.questionSet.create({
    data: {
      title: `__sess_${Date.now()}`,
      questions: {
        create: [
          {
            text: 'Q',
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
  });
  setId = set.id;
});

afterAll(async () => {
  for (const id of createdSessionIds) sessionManager.dispose(id);
  built.io.close();
  await new Promise<void>((resolve) => built.server.close(() => resolve()));
  await prisma.session.deleteMany({ where: { questionSetId: setId } });
  await prisma.questionSet.delete({ where: { id: setId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('PIN uniqueness among active sessions', () => {
  it('assigns a distinct PIN to every concurrently-active session', async () => {
    const pins = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const engine = await sessionManager.createSession(setId);
      expect(engine).toBeTruthy();
      createdSessionIds.push(engine!.sessionId);
      expect(pins.has(engine!.pin)).toBe(false); // no collision with a live session
      pins.add(engine!.pin);
      expect(/^\d{6}$/.test(engine!.pin)).toBe(true);
    }
  });
});

describe('host disconnect/refresh', () => {
  it('session survives a host disconnect and the host regains control', async () => {
    const engine = await sessionManager.createSession(setId);
    createdSessionIds.push(engine!.sessionId);
    const sid = engine!.sessionId;

    const h1 = host();
    await once(h1, 'connect');
    expect((await hostJoin(h1, sid)).ok).toBe(true);
    // Host "refreshes": the old socket drops.
    h1.disconnect();

    // A fresh host socket rejoins and still controls the same session.
    const h2 = host();
    await once(h2, 'connect');
    const rejoin = await hostJoin(h2, sid);
    expect(rejoin.ok).toBe(true);
    if (rejoin.ok) expect(rejoin.snapshot.state).toBe('LOBBY');

    const started = await hostAction(h2, sid, 'START');
    expect(started.ok).toBe(true);
    expect(sessionManager.get(sid)!.state).toBe('QUESTION');

    h2.disconnect();
  });
});

describe('WRITE_IN moderation is admin-only over sockets', () => {
  it('a non-admin socket cannot merge, undo-merge, or hide groups', async () => {
    const engine = await sessionManager.createSession(setId);
    createdSessionIds.push(engine!.sessionId);
    const sid = engine!.sessionId;

    const p = player(); // no admin cookie
    await once(p, 'connect');
    const emit = (event: string, payload: object) =>
      new Promise<Ack>((resolve) => p.emit(event as 'host:writeInMerge', payload as never, resolve));

    for (const [event, payload] of [
      ['host:writeInMerge', { sessionId: sid, sourceKey: 'a', targetKey: 'b' }],
      ['host:writeInUndoMerge', { sessionId: sid, sourceKey: 'a' }],
      ['host:writeInHideGroup', { sessionId: sid, key: 'a', hidden: true }],
    ] as const) {
      const res = await emit(event, payload);
      expect(res.ok).toBe(false);
      expect(res.code).toBe('NOT_AUTHENTICATED');
    }
    p.disconnect();
  });
});

describe('two simultaneous sessions do not leak state into each other', () => {
  it('a question started in session A is never delivered to a player in session B', async () => {
    const a = await sessionManager.createSession(setId);
    const b = await sessionManager.createSession(setId);
    createdSessionIds.push(a!.sessionId, b!.sessionId);
    expect(a!.pin).not.toBe(b!.pin);

    const hostA = host();
    await once(hostA, 'connect');
    await hostJoin(hostA, a!.sessionId);

    const playerA = player();
    const playerB = player();
    await Promise.all([once(playerA, 'connect'), once(playerB, 'connect')]);
    expect((await join(playerA, a!.pin, 'Alice')).ok).toBe(true);
    expect((await join(playerB, b!.pin, 'Bob')).ok).toBe(true);

    // Watch B's player for any question:start — it must never fire.
    let bGotQuestion = false;
    playerB.on('question:start', () => {
      bGotQuestion = true;
    });
    const aGetsQuestion = once(playerA, 'question:start');

    await hostAction(hostA, a!.sessionId, 'START');
    await aGetsQuestion; // A's player receives it

    // Give any stray cross-room delivery a chance to arrive, then assert none did.
    await new Promise((r) => setTimeout(r, 150));
    expect(bGotQuestion).toBe(false);
    expect(sessionManager.get(b!.sessionId)!.state).toBe('LOBBY');

    hostA.disconnect();
    playerA.disconnect();
    playerB.disconnect();
  });
});
