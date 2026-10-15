import { expect, test, type Page } from '@playwright/test';
import {
  adminContext,
  createAndStart,
  joinPlayer,
  quizSetBody,
} from './helpers';

test('full QUIZ game: 1 host + 5 players, scores and leaderboard', async ({
  browser,
}) => {
  const { context, page: host } = await adminContext(browser);
  const { sessionId, pin } = await createAndStart(
    context,
    quizSetBody(`E2E Quiz ${Date.now()}`),
  );

  await host.goto(`/host/${sessionId}`);
  await expect(host.getByText(pin)).toBeVisible();

  // Five players join.
  const names = ['Ava', 'Ben', 'Cal', 'Dee', 'Eli'];
  const players: Page[] = [];
  for (const n of names) players.push(await joinPlayer(browser, pin, n));

  await expect(host.getByTestId('player-count')).toHaveText('5');

  // Start the game.
  await host.getByTestId('host-primary').click();

  // --- Question 1: Ava/Ben/Cal pick A (correct), Dee/Eli pick B (wrong) ---
  for (const p of players) await expect(p.getByTestId('answer-0')).toBeVisible();
  await players[0].getByTestId('answer-0').click();
  await players[1].getByTestId('answer-0').click();
  await players[2].getByTestId('answer-0').click();
  await players[3].getByTestId('answer-1').click();
  await players[4].getByTestId('answer-1').click();

  // All answered -> reveal. Correct option "A" is flagged, with count 3.
  await expect(host.getByTestId('reveal-correct')).toBeVisible();
  const correctRow = host.locator('[data-testid="reveal-option"][data-correct="true"]');
  await expect(correctRow).toHaveAttribute('data-count', '3');

  // Players see their verdicts.
  await expect(players[0].getByTestId('result-heading')).toHaveText('Correct!');
  await expect(players[3].getByTestId('result-heading')).toHaveText('Incorrect');

  // Advance to the leaderboard; a correct player leads.
  await host.getByTestId('host-primary').click(); // reveal -> leaderboard
  await expect(host.getByText('Leaderboard')).toBeVisible();
  const leader = host.locator('[data-testid="lb-row"][data-rank="1"] [data-testid="lb-name"]');
  await expect(leader).toHaveText(/Ava|Ben|Cal/);

  // --- Question 2: everyone picks A ---
  await host.getByTestId('host-primary').click(); // leaderboard -> Q2
  for (const p of players) await expect(p.getByTestId('answer-0')).toBeVisible();
  for (const p of players) await p.getByTestId('answer-0').click();

  await expect(host.getByTestId('reveal-correct')).toBeVisible();
  const q2correct = host.locator('[data-testid="reveal-option"][data-correct="true"]');
  await expect(q2correct).toHaveAttribute('data-count', '5');

  // reveal -> leaderboard -> ended (podium).
  await host.getByTestId('host-primary').click();
  await expect(host.getByText('Leaderboard')).toBeVisible();
  await host.getByTestId('host-primary').click();
  await expect(host.getByTestId('podium')).toBeVisible();

  // Players see the game-over screen with a finishing position.
  await expect(players[0].getByTestId('player-ended')).toBeVisible();
  await expect(players[0].getByText(/finished/)).toBeVisible();

  for (const p of players) await p.context().close();
  await context.close();
});
