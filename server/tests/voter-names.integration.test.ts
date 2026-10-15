import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { sessionManager } from '../src/session/manager.js';

let app: Express;
let cookie: string[];
const createdSetIds: string[] = [];

const quizBody = (title: string, showVoterNames?: boolean) => ({
  title,
  description: null,
  ...(showVoterNames === undefined ? {} : { showVoterNames }),
  questions: [
    {
      text: 'Q',
      mode: 'QUIZ',
      options: [{ text: 'A' }, { text: 'B' }],
      correctOptionIndices: [0],
      timeLimitSec: 20,
      points: 'STANDARD',
    },
  ],
});

beforeAll(async () => {
  app = buildApp().app;
  const login = await request(app).post('/api/auth/login').send({ password: 'changeme' }).expect(200);
  cookie = login.headers['set-cookie'] as unknown as string[];
});

afterAll(async () => {
  for (const id of createdSetIds) {
    await prisma.session.deleteMany({ where: { questionSetId: id } });
    await prisma.questionSet.delete({ where: { id } }).catch(() => {});
  }
  await prisma.$disconnect();
});

describe('showVoterNames persists on the question set', () => {
  it('defaults to false and stores true when set', async () => {
    const off = await request(app).post('/api/sets').set('Cookie', cookie).send(quizBody(`VN off ${Date.now()}`)).expect(201);
    createdSetIds.push(off.body.id);
    expect(off.body.showVoterNames).toBe(false);

    const on = await request(app).post('/api/sets').set('Cookie', cookie).send(quizBody(`VN on ${Date.now()}`, true)).expect(201);
    createdSetIds.push(on.body.id);
    expect(on.body.showVoterNames).toBe(true);

    // Survives a round-trip fetch.
    const fetched = await request(app).get(`/api/sets/${on.body.id}`).set('Cookie', cookie).expect(200);
    expect(fetched.body.showVoterNames).toBe(true);
  });

  it('is preserved through JSON export -> import', async () => {
    const created = await request(app).post('/api/sets').set('Cookie', cookie).send(quizBody(`VN export ${Date.now()}`, true)).expect(201);
    createdSetIds.push(created.body.id);

    const exported = await request(app).get(`/api/sets/${created.body.id}/export`).set('Cookie', cookie).expect(200);
    expect(exported.body.set.showVoterNames).toBe(true);

    const imported = await request(app).post('/api/sets/import').set('Cookie', cookie).send(exported.body).expect(201);
    createdSetIds.push(imported.body.id);
    expect(imported.body.showVoterNames).toBe(true);
  });
});

describe('per-session override does not change the saved set', () => {
  it('toggling the session on leaves the stored set at its saved value', async () => {
    const created = await request(app).post('/api/sets').set('Cookie', cookie).send(quizBody(`VN session ${Date.now()}`, false)).expect(201);
    createdSetIds.push(created.body.id);

    const engine = await sessionManager.createSession(created.body.id);
    expect(engine!.showVoterNames).toBe(false);
    engine!.setShowVoterNames(true); // host override, in-memory only
    expect(engine!.showVoterNames).toBe(true);

    // The persisted set is unchanged.
    const fetched = await request(app).get(`/api/sets/${created.body.id}`).set('Cookie', cookie).expect(200);
    expect(fetched.body.showVoterNames).toBe(false);

    sessionManager.dispose(engine!.sessionId);
  });
});
