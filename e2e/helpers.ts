import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

export interface StartedSession {
  setId: string;
  sessionId: string;
  pin: string;
}

/** A quiz set where, in every question, option index 0 ("A") is correct. */
export function quizSetBody(title: string) {
  return {
    title,
    description: 'E2E quiz',
    questions: [
      {
        text: 'E2E Q1 — pick A',
        mode: 'QUIZ',
        timeLimitSec: 30,
        points: 'STANDARD',
        options: [{ text: 'A' }, { text: 'B' }, { text: 'C' }],
        correctOptionIndices: [0],
      },
      {
        text: 'E2E Q2 — pick A',
        mode: 'QUIZ',
        timeLimitSec: 30,
        points: 'STANDARD',
        options: [{ text: 'A' }, { text: 'B' }],
        correctOptionIndices: [0],
      },
    ],
  };
}

export function pollSetBody(title: string) {
  return {
    title,
    description: 'E2E poll',
    questions: [
      {
        text: 'E2E Poll — favourite?',
        mode: 'POLL',
        timeLimitSec: 30,
        points: 'NONE',
        options: [{ text: 'Cats' }, { text: 'Dogs' }],
        correctOptionIndices: [],
      },
    ],
  };
}

/** Create an admin browser context (logged in via the API) + its page. */
export async function adminContext(
  browser: Browser,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const res = await context.request.post('/api/auth/login', {
    // Override for a live/production smoke test via ADMIN_PASSWORD.
    data: { password: process.env.ADMIN_PASSWORD ?? 'changeme' },
  });
  expect(res.ok()).toBeTruthy();
  const page = await context.newPage();
  return { context, page };
}

/** Create a set and start a session via the authed admin context. */
export async function createAndStart(
  context: BrowserContext,
  body: unknown,
): Promise<StartedSession> {
  const created = await context.request.post('/api/sets', { data: body });
  expect(created.ok()).toBeTruthy();
  const set = await created.json();
  const startRes = await context.request.post(`/api/sets/${set.id}/start`);
  expect(startRes.ok()).toBeTruthy();
  const started = await startRes.json();
  return { setId: set.id, sessionId: started.sessionId, pin: started.pin };
}

/** A player joins via the mobile view using a fresh context (375px wide). */
export async function joinPlayer(
  browser: Browser,
  pin: string,
  nickname: string,
): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
  });
  const page = await context.newPage();
  await page.goto(`/play?pin=${pin}`);
  await page.getByPlaceholder('Your name').fill(nickname);
  await page.getByRole('button', { name: 'Enter' }).click();
  await expect(page.getByText("You’re in!")).toBeVisible();
  return page;
}
