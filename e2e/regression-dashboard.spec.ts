import { expect, test, type Page } from '@playwright/test';
import {
  adminContext,
  createAndStart,
  joinPlayer,
  pollSetBody,
  quizSetBody,
} from './helpers';

/**
 * Regression for the manual fix: after a session ends the host must be able to
 * return to the dashboard, in every end scenario, and start a fresh session
 * afterwards with no stale state.
 */

async function backToDashboardVisible(host: Page) {
  const link = host.getByRole('link', { name: 'Back to dashboard' });
  await expect(link).toBeVisible();
  await link.click();
  await expect(host).toHaveURL(/\/admin\/?$/);
  await expect(host.getByText('Question sets')).toBeVisible();
}

test('POLL ended normally: host can return to the dashboard', async ({ browser }) => {
  const { context, page: host } = await adminContext(browser);
  const { sessionId, pin } = await createAndStart(context, pollSetBody(`Reg Poll ${Date.now()}`));
  await host.goto(`/host/${sessionId}`);

  const p = await joinPlayer(browser, pin, 'Pat');
  await host.getByTestId('host-primary').click(); // start
  await expect(p.getByTestId('answer-0')).toBeVisible();
  await p.getByTestId('answer-0').click();
  await expect(host.getByTestId('reveal-option').first()).toBeVisible();
  await host.getByTestId('host-primary').click(); // Next -> ended (single poll question)

  await backToDashboardVisible(host);

  await p.context().close();
  await context.close();
});

test('QUIZ played to the end: podium shows and host can return, then start fresh', async ({
  browser,
}) => {
  const { context, page: host } = await adminContext(browser);
  const { sessionId, pin } = await createAndStart(context, quizSetBody(`Reg Quiz ${Date.now()}`));
  await host.goto(`/host/${sessionId}`);

  const p = await joinPlayer(browser, pin, 'Quinn');
  await host.getByTestId('host-primary').click(); // start Q1
  await expect(p.getByTestId('answer-0')).toBeVisible();
  await p.getByTestId('answer-0').click(); // one active player -> auto reveal
  await expect(host.getByTestId('reveal-option').first()).toBeVisible();
  await host.getByTestId('host-primary').click(); // leaderboard
  await host.getByTestId('host-primary').click(); // Q2
  await expect(p.getByTestId('answer-0')).toBeVisible();
  await p.getByTestId('answer-0').click();
  await expect(host.getByTestId('reveal-option').first()).toBeVisible();
  await host.getByTestId('host-primary').click(); // leaderboard
  await host.getByTestId('host-primary').click(); // ended -> podium

  // Player sees their game-over screen.
  await expect(p.getByTestId('player-ended')).toBeVisible();

  await backToDashboardVisible(host);

  // Starting a new session afterwards is clean: fresh PIN, zero players.
  const next = await createAndStart(context, quizSetBody(`Reg Quiz Next ${Date.now()}`));
  expect(next.pin).not.toBe(pin);
  await host.goto(`/host/${next.sessionId}`);
  await expect(host.getByTestId('player-count')).toHaveText('0');

  await p.context().close();
  await context.close();
});

test('QUIZ ended early via End button: host can return to the dashboard', async ({ browser }) => {
  const { context, page: host } = await adminContext(browser);
  const { sessionId, pin } = await createAndStart(context, quizSetBody(`Reg Early ${Date.now()}`));
  await host.goto(`/host/${sessionId}`);

  await joinPlayer(browser, pin, 'Early');
  await host.getByTestId('host-primary').click(); // start

  // End mid-question (confirm dialog).
  host.on('dialog', (d) => d.accept());
  await host.getByRole('button', { name: 'End' }).click();

  await backToDashboardVisible(host);

  await context.close();
});
