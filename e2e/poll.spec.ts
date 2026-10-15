import { expect, test, type Page } from '@playwright/test';
import {
  adminContext,
  createAndStart,
  joinPlayer,
  pollSetBody,
} from './helpers';

test('full POLL game: votes tally, no leaderboard or podium', async ({ browser }) => {
  const { context, page: host } = await adminContext(browser);
  const { sessionId, pin } = await createAndStart(
    context,
    pollSetBody(`E2E Poll ${Date.now()}`),
  );

  await host.goto(`/host/${sessionId}`);
  await expect(host.getByText(pin)).toBeVisible();

  const names = ['Mia', 'Noa', 'Oli'];
  const players: Page[] = [];
  for (const n of names) players.push(await joinPlayer(browser, pin, n));
  await expect(host.getByTestId('player-count')).toHaveText('3');

  await host.getByTestId('host-primary').click(); // start

  // Two vote Cats, one votes Dogs.
  for (const p of players) await expect(p.getByTestId('answer-0')).toBeVisible();
  await players[0].getByTestId('answer-0').click();
  await players[1].getByTestId('answer-0').click();
  await players[2].getByTestId('answer-1').click();

  // Reveal shows tallies but NO correct answer in poll mode.
  await expect(host.getByTestId('reveal-option').first()).toBeVisible();
  await expect(host.getByTestId('reveal-correct')).toHaveCount(0);
  const cats = host.locator('[data-testid="reveal-option"]').first();
  await expect(cats).toHaveAttribute('data-count', '2');

  // Players see "Vote received", not a correct/incorrect verdict.
  await expect(players[0].getByText('Vote received')).toBeVisible();
  await expect(players[0].getByTestId('result-heading')).toHaveCount(0);

  // Only one poll question -> Next ends the game, skipping the leaderboard.
  await host.getByTestId('host-primary').click();
  await expect(host.getByText('Leaderboard')).toHaveCount(0);
  await expect(host.getByText(/Thanks for playing|Final results/)).toBeVisible();

  for (const p of players) await p.context().close();
  await context.close();
});
