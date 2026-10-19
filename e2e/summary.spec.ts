import { expect, test, type Page } from '@playwright/test';
import { adminContext, createAndStart, joinPlayer } from './helpers';

function summarySetBody(title: string) {
  const mc = (text: string) => ({
    text,
    mode: 'POLL',
    type: 'MULTIPLE_CHOICE',
    timeLimitSec: 60,
    points: 'NONE',
    options: [{ text: 'A' }, { text: 'B' }, { text: 'C' }],
    correctOptionIndices: [],
    config: {},
  });
  return {
    title,
    description: null,
    showVoterNames: true,
    showResultsSummary: true,
    questions: [mc('Q1 — clear winner'), mc('Q2 — a tie')],
  };
}

test('poll session: winner badge, results summary (with a tie), order, dashboard', async ({ browser }) => {
  test.setTimeout(60_000);
  const { context, page: host } = await adminContext(browser);
  const { sessionId, pin } = await createAndStart(context, summarySetBody(`Summary ${Date.now()}`));
  await host.goto(`/host/${sessionId}`);

  const players: Page[] = [];
  for (const n of ['Ann', 'Bob', 'Cy', 'Di']) players.push(await joinPlayer(browser, pin, n));
  await expect(host.getByTestId('player-count')).toHaveText('4');

  // Q1: A wins 3–1.
  await host.getByTestId('host-primary').click();
  await players[0]!.getByTestId('answer-0').click();
  await players[1]!.getByTestId('answer-0').click();
  await players[2]!.getByTestId('answer-0').click();
  await players[3]!.getByTestId('answer-1').click();
  // Winner badge on the top option.
  await expect(host.locator('[data-testid="reveal-option"][data-winner="true"]')).toHaveCount(1);
  await expect(host.getByTestId('winner-badge').first()).toBeVisible();
  await host.getByTestId('host-primary').click(); // -> Q2

  // Q2: A/B tie 2–2.
  await players[0]!.getByTestId('answer-0').click();
  await players[1]!.getByTestId('answer-0').click();
  await players[2]!.getByTestId('answer-1').click();
  await players[3]!.getByTestId('answer-1').click();
  await expect(host.getByTestId('winner-badge').first()).toBeVisible();
  await host.getByTestId('host-primary').click(); // -> SUMMARY

  // Results summary: one card per poll question, with a tie on Q2.
  await expect(host.getByTestId('summary-card')).toHaveCount(2);
  await expect(host.getByTestId('summary-tie')).toHaveCount(1);
  await expect(host.getByTestId('summary-card').first()).toContainText('Ann');
  await host.screenshot({ path: 'screenshots/results-summary.png' });

  // "Download results image" produces a PNG.
  const download = host.waitForEvent('download');
  await host.getByTestId('download-results-image').click();
  expect((await download).suggestedFilename()).toBe('livevote-results.png');

  // Players see their own summary + "voted with the majority".
  await expect(players[0]!.getByTestId('player-summary-card')).toHaveCount(2);
  await expect(players[0]!.getByTestId('matched-top').first()).toBeVisible();

  // Finish -> ended -> back to dashboard still works.
  await host.getByTestId('host-primary').click(); // SUMMARY -> ENDED
  await expect(host.getByRole('link', { name: 'Back to dashboard' })).toBeVisible();

  for (const p of players) await p.context().close();
  await context.close();
});

test('host can skip the results summary with the Summary toggle', async ({ browser }) => {
  test.setTimeout(40_000);
  const { context, page: host } = await adminContext(browser);
  const { sessionId, pin } = await createAndStart(context, summarySetBody(`Skip ${Date.now()}`));
  await host.goto(`/host/${sessionId}`);
  const p = await joinPlayer(browser, pin, 'Solo');

  // Turn the summary off from the controls bar before finishing.
  await expect(host.getByTestId('toggle-summary')).toHaveAttribute('aria-pressed', 'true');
  await host.getByTestId('toggle-summary').click();
  await expect(host.getByTestId('toggle-summary')).toHaveAttribute('aria-pressed', 'false');

  // Play both questions; with the summary off the session ends directly.
  await host.getByTestId('host-primary').click();
  await p.getByTestId('answer-0').click();
  await host.getByTestId('host-primary').click(); // -> Q2
  await p.getByTestId('answer-0').click();
  await host.getByTestId('host-primary').click(); // last reveal -> ENDED (no SUMMARY)

  await expect(host.getByTestId('summary-card')).toHaveCount(0);
  await expect(host.getByRole('link', { name: 'Back to dashboard' })).toBeVisible();

  await p.context().close();
  await context.close();
});
