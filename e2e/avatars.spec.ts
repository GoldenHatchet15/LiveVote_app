import { expect, test, type Browser, type Page } from '@playwright/test';
import { adminContext, createAndStart, quizSetBody } from './helpers';

/** Join with the avatar picker (pick a specific emoji) at phone size. */
async function joinWithAvatar(browser: Browser, pin: string, nickname: string, emoji?: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  await page.goto(`/play?pin=${pin}`);
  await page.getByPlaceholder('Your name').fill(nickname);
  if (emoji) await page.getByTestId(`avatar-${emoji}`).click();
  else await page.getByTestId('avatar-random').click();
  await page.getByRole('button', { name: 'Enter' }).click();
  await expect(page.getByText("You’re in!")).toBeVisible();
  return page;
}

async function bgColor(page: Page, testid = 'name-tag', nth = 0): Promise<string> {
  return page
    .getByTestId(testid)
    .nth(nth)
    .evaluate((el) => getComputedStyle(el).backgroundColor);
}

test('avatar picker + Random, and name tags appear for players and host', async ({ browser }) => {
  const { context, page: host } = await adminContext(browser);
  const { sessionId, pin } = await createAndStart(context, quizSetBody(`Avatars ${Date.now()}`));
  await host.goto(`/host/${sessionId}`);

  const p1 = await joinWithAvatar(browser, pin, 'Ada', '🐶');
  // The player sees their own name tag in the header.
  await expect(p1.getByTestId('name-tag').filter({ hasText: 'Ada' })).toBeVisible();
  // The host lobby shows a name tag for them.
  await expect(host.getByTestId('name-tag').filter({ hasText: 'Ada' })).toBeVisible();

  await p1.context().close();
  await context.close();
});

test('colors are assigned round-robin (nearby players differ)', async ({ browser }) => {
  const { context, page: host } = await adminContext(browser);
  const { sessionId, pin } = await createAndStart(context, quizSetBody(`Colors ${Date.now()}`));
  await host.goto(`/host/${sessionId}`);

  const names = ['Ann', 'Bo', 'Cy', 'Di', 'Ed'];
  const players: Page[] = [];
  for (const n of names) players.push(await joinWithAvatar(browser, pin, n));
  await expect(host.getByTestId('player-count')).toHaveText('5');
  await expect(host.getByTestId('name-tag')).toHaveCount(5);

  // First two joiners get different palette colors.
  const first = await host.getByTestId('name-tag').nth(0).evaluate((el) => getComputedStyle(el).backgroundColor);
  const second = await host.getByTestId('name-tag').nth(1).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(first).not.toBe(second);

  await host.screenshot({ path: 'screenshots/lobby-name-tags-5.png' });

  for (const p of players) await p.context().close();
  await context.close();
});

test('reconnect keeps the same color', async ({ browser }) => {
  const { context, page: host } = await adminContext(browser);
  const { sessionId, pin } = await createAndStart(context, quizSetBody(`Reconn ${Date.now()}`));
  await host.goto(`/host/${sessionId}`);

  const p = await joinWithAvatar(browser, pin, 'Remy', '🦊');
  const before = await bgColor(p);
  await p.reload();
  await expect(p.getByText("You’re in!")).toBeVisible();
  const after = await bgColor(p);
  expect(after).toBe(before);

  await p.context().close();
  await context.close();
});
