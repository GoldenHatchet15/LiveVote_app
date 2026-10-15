import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';

let app: Express;

beforeAll(() => {
  app = buildApp().app;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('admin auth (M1)', () => {
  it('returns 401 for unauthenticated admin endpoints', async () => {
    await request(app).get('/api/sets').expect(401);
    await request(app).post('/api/sets').send({ title: 'x' }).expect(401);
    await request(app).get('/api/sessions/does-not-exist').expect(401);
  });

  it('rejects a wrong password', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ password: 'definitely-wrong' })
      .expect(401);
  });

  it('logs in and then reaches admin endpoints with the cookie', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ password: 'changeme' })
      .expect(200);
    const cookie = login.headers['set-cookie'];
    expect(cookie).toBeTruthy();

    const sets = await request(app).get('/api/sets').set('Cookie', cookie).expect(200);
    expect(Array.isArray(sets.body)).toBe(true);
  });

  it('serves public config without auth', async () => {
    const res = await request(app).get('/api/public/config').expect(200);
    expect(typeof res.body.publicBaseUrl).toBe('string');
  });

  it('exposes a health check', async () => {
    await request(app).get('/api/health').expect(200);
  });
});
