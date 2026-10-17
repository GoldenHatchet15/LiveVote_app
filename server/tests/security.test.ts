import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomBytes, scryptSync } from 'node:crypto';
import type { Express } from 'express';
import { buildApp } from '../src/app.js';
import {
  ADMIN_SESSION_MAX_AGE_MS,
  signAdminToken,
  verifyAdminToken,
  verifyAdminPassword,
} from '../src/auth.js';
import { loginLimiter } from '../src/routes/auth.js';
import { resolveClientIp } from '../src/util/clientIp.js';
import { prepareAnswer } from '../src/session/answers.js';
import { buildResultsCsv } from '../src/session/csv.js';
import { SessionEngine } from '../src/session/engine.js';
import { sessionManager } from '../src/session/manager.js';
import { purgeExpiredSessions } from '../src/session/retention.js';
import { prisma } from '../src/db.js';
import { CapturingEmitter, FakeScheduler, makeQuizSet } from './helpers.js';
import type { AnswerValue } from '@livevote/shared';

let app: Express;
beforeAll(() => {
  app = buildApp().app;
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('H1 — security headers', () => {
  it('sets CSP, nosniff and frame-ancestors via helmet', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('H2 — admin login brute-force protection', () => {
  it('rate-limits repeated login attempts from one IP', async () => {
    loginLimiter.reset();
    let got429 = false;
    for (let i = 0; i < 15; i++) {
      const res = await request(app).post('/api/auth/login').send({ password: 'wrong' });
      if (res.status === 429) {
        got429 = true;
        break;
      }
    }
    expect(got429).toBe(true);
    loginLimiter.reset();
  });
});

describe('H3 — admin session cookie expiry (server-side)', () => {
  it('accepts a fresh token and rejects an expired/future one', () => {
    expect(verifyAdminToken(signAdminToken(Date.now()))).toBe(true);
    expect(verifyAdminToken(signAdminToken(Date.now() - ADMIN_SESSION_MAX_AGE_MS - 1000))).toBe(false);
    expect(verifyAdminToken(signAdminToken(Date.now() + 5 * 60_000))).toBe(false); // far future
    expect(verifyAdminToken('garbage')).toBe(false);
  });
});

describe('H4 — CSV formula injection is neutralized', () => {
  it('prefixes cells that start with = + - @ with a quote', () => {
    const set = makeQuizSet();
    const engine = new SessionEngine({
      sessionId: 's',
      pin: '000000',
      set,
      emitter: new CapturingEmitter(),
      scheduler: new FakeScheduler(),
    });
    engine.addPlayer({ id: 'p0', nickname: '=HYPERLINK("http://evil")', reconnectToken: 't0' });
    engine.startGame();
    engine.submitAnswer('p0', 'q1', { kind: 'option', optionId: 'q1a' });
    const csv = buildResultsCsv(engine, set);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toMatch(/(^|,)=HYPERLINK/); // never a raw leading =
  });
});

describe('H5 — malformed socket answers are rejected, not thrown', () => {
  const set = makeQuizSet();
  const q = set.questions[0]!;
  it('guards against non-objects and missing/invalid fields', () => {
    expect(() => prepareAnswer(q, undefined as unknown as AnswerValue)).not.toThrow();
    expect(prepareAnswer(q, undefined as unknown as AnswerValue).ok).toBe(false);
    expect(prepareAnswer(q, {} as AnswerValue).ok).toBe(false);
    expect(prepareAnswer(q, { kind: 'options' } as unknown as AnswerValue).ok).toBe(false);
    expect(prepareAnswer(q, { kind: 'order' } as unknown as AnswerValue).ok).toBe(false);
  });
  it('engine.submitAnswer returns an error for a malformed value instead of throwing', () => {
    const engine = new SessionEngine({
      sessionId: 's',
      pin: '000000',
      set: makeQuizSet(),
      emitter: new CapturingEmitter(),
      scheduler: new FakeScheduler(),
    });
    engine.addPlayer({ id: 'p0', nickname: 'Ann', reconnectToken: 't0' });
    engine.addPlayer({ id: 'p1', nickname: 'Bob', reconnectToken: 't1' });
    engine.startGame();
    const r = engine.submitAnswer('p0', 'q1', { kind: 'number', value: 5 } as AnswerValue); // wrong kind for MC
    expect(r.ok).toBe(false);
    expect(engine.state).toBe('QUESTION'); // nothing broke
  });
});

describe('M1 — admin password supports a scrypt hash', () => {
  it('verifies against ADMIN_PASSWORD_HASH', async () => {
    const salt = randomBytes(16);
    const hash = scryptSync('s3cret-pw', salt, 64);
    process.env.ADMIN_PASSWORD_HASH = `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
    vi.resetModules();
    const auth = await import('../src/auth.js');
    expect(auth.verifyAdminPassword('s3cret-pw')).toBe(true);
    expect(auth.verifyAdminPassword('wrong')).toBe(false);
    delete process.env.ADMIN_PASSWORD_HASH;
    vi.resetModules();
  });

  it('(default) still verifies a plaintext dev password without hashing', () => {
    expect(verifyAdminPassword('changeme')).toBe(true);
    expect(verifyAdminPassword('nope')).toBe(false);
    expect(verifyAdminPassword('')).toBe(false);
  });
});

describe('M2 — client IP not trusted from headers when not behind a proxy', () => {
  it('ignores CF-Connecting-IP / XFF by default and uses the direct address', () => {
    const ip = resolveClientIp(
      { 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' },
      '10.0.0.5',
    );
    expect(ip).toBe('10.0.0.5'); // TRUST_PROXY is false in tests
  });
});

describe('M6 — manual session data deletion', () => {
  it('deletes a session row (cascading player data) via the admin endpoint', async () => {
    const login = await request(app).post('/api/auth/login').send({ password: 'changeme' }).expect(200);
    const cookie = login.headers['set-cookie'] as unknown as string[];

    const set = await prisma.questionSet.create({
      data: {
        title: `__sec_${Date.now()}`,
        questions: { create: [{ text: 'Q', mode: 'QUIZ', timeLimitSec: 20, points: 'STANDARD', order: 0, options: { create: [{ text: 'A', index: 0, isCorrect: true }, { text: 'B', index: 1 }] } }] },
      },
    });
    const engine = await sessionManager.createSession(set.id);
    const sid = engine!.sessionId;
    expect(await prisma.session.count({ where: { id: sid } })).toBe(1);

    await request(app).delete(`/api/sessions/${sid}/data`).set('Cookie', cookie).expect(200);
    expect(await prisma.session.count({ where: { id: sid } })).toBe(0);
    expect(sessionManager.get(sid)).toBeUndefined();

    await prisma.questionSet.delete({ where: { id: set.id } }).catch(() => {});
  });

  it('purge is disabled when retention is 0', async () => {
    expect(await purgeExpiredSessions(0)).toBe(0);
  });

  it('the delete endpoint requires admin auth', async () => {
    await request(app).delete('/api/sessions/whatever/data').expect(401);
  });
});
