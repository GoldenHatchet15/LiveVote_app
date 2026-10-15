import { expect, test } from '@playwright/test';
import { adminContext, createAndStart, joinPlayer, quizSetBody } from './helpers';

test('QR/link pre-fills the PIN on the join screen (M5)', async ({ browser }) => {
  const { context } = await adminContext(browser);
  const { pin } = await createAndStart(context, quizSetBody(`QR ${Date.now()}`));

  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  await page.goto(`/play?pin=${pin}`);
  // The PIN field is pre-filled from the query string (as the QR code encodes).
  await expect(page.locator('#pin')).toHaveValue(pin);

  await ctx.close();
  await context.close();
});

test('answer locks after one tap and does not submit twice (M5)', async ({ browser }) => {
  const { context, page: host } = await adminContext(browser);
  const { sessionId, pin } = await createAndStart(context, quizSetBody(`Lock ${Date.now()}`));
  await host.goto(`/host/${sessionId}`);

  const p1 = await joinPlayer(browser, pin, 'Tapper');
  const p2 = await joinPlayer(browser, pin, 'Other');
  await expect(host.getByTestId('player-count')).toHaveText('2');
  await host.getByTestId('host-primary').click(); // start

  await expect(p1.getByTestId('answer-0')).toBeVisible();
  await p1.getByTestId('answer-0').click();
  // The second tap can't land — the question screen is already gone.
  await p1.getByTestId('answer-0').click({ timeout: 1000 }).catch(() => {});
  await expect(p1.getByText('Answer locked in')).toBeVisible();

  // Second player picks a different option, forcing the reveal.
  await p2.getByTestId('answer-1').click();
  await expect(host.getByTestId('reveal-option').first()).toBeVisible();

  // Option A was chosen by exactly one player (Tapper counted once, not twice).
  const optionA = host.locator('[data-testid="reveal-option"]').first();
  await expect(optionA).toHaveAttribute('data-count', '1');

  await p1.context().close();
  await p2.context().close();
  await context.close();
});

test('kicked player sees the removed screen (M5)', async ({ browser }) => {
  const { context, page: host } = await adminContext(browser);
  const { sessionId, pin } = await createAndStart(context, quizSetBody(`Kick ${Date.now()}`));
  await host.goto(`/host/${sessionId}`);

  const p = await joinPlayer(browser, pin, 'Target');
  await expect(host.getByTestId('player-count')).toHaveText('1');

  await host.getByTitle('Players').click();
  await host.getByRole('button', { name: 'Kick' }).click();

  await expect(p.getByText('Removed from game')).toBeVisible();

  await p.context().close();
  await context.close();
});

test('refresh mid-reveal restores the reveal screen (M5)', async ({ browser }) => {
  const { context, page: host } = await adminContext(browser);
  const { sessionId, pin } = await createAndStart(context, quizSetBody(`RevealRefresh ${Date.now()}`));
  await host.goto(`/host/${sessionId}`);

  const p1 = await joinPlayer(browser, pin, 'Correct');
  const p2 = await joinPlayer(browser, pin, 'Wrong');
  await host.getByTestId('host-primary').click(); // start

  await expect(p1.getByTestId('answer-0')).toBeVisible();
  await p1.getByTestId('answer-0').click(); // correct
  await p2.getByTestId('answer-1').click(); // wrong -> reveal
  await expect(p1.getByTestId('result-heading')).toHaveText('Correct!');

  // Refresh mid-reveal: the player reconnects straight back to their result.
  await p1.reload();
  await expect(p1.getByTestId('result-heading')).toHaveText('Correct!');

  await p1.context().close();
  await p2.context().close();
  await context.close();
});
