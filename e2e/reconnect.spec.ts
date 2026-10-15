import { expect, test } from '@playwright/test';
import { adminContext, createAndStart, joinPlayer, quizSetBody } from './helpers';

test('player refresh mid-game restores their state (M5)', async ({ browser }) => {
  const { context, page: host } = await adminContext(browser);
  const { sessionId, pin } = await createAndStart(
    context,
    quizSetBody(`E2E Reconnect ${Date.now()}`),
  );
  await host.goto(`/host/${sessionId}`);

  // Two players, so one answering doesn't immediately end the question.
  const player = await joinPlayer(browser, pin, 'Refresher');
  const waiter = await joinPlayer(browser, pin, 'Waiter');
  await expect(host.getByTestId('player-count')).toHaveText('2');

  // Refresh in the lobby — the player rejoins automatically (no re-entry form).
  await player.reload();
  await expect(player.getByText("You’re in!")).toBeVisible();
  await expect(host.getByTestId('player-count')).toHaveText('2');

  // Start, answer, then refresh mid-question: state is restored as "locked in".
  await host.getByTestId('host-primary').click();
  await expect(player.getByTestId('answer-0')).toBeVisible();
  await player.getByTestId('answer-0').click();
  await expect(player.getByText('Answer locked in')).toBeVisible();

  await player.reload();
  await expect(player.getByText('Answer locked in')).toBeVisible();

  await player.context().close();
  await waiter.context().close();
  await context.close();
});
