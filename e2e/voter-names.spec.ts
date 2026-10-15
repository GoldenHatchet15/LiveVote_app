import { expect, test, type Browser, type Page } from '@playwright/test';
import { adminContext, createAndStart, joinPlayer } from './helpers';

/** A quiz body with the voter-names setting pre-configured. */
function quizBody(title: string, showVoterNames: boolean) {
  return {
    title,
    description: null,
    showVoterNames,
    questions: [
      {
        text: 'Pick A',
        mode: 'QUIZ',
        timeLimitSec: 30,
        points: 'STANDARD',
        options: [{ text: 'A' }, { text: 'B' }],
        correctOptionIndices: [0],
      },
    ],
  };
}

async function joinMany(browser: Browser, pin: string, names: string[]): Promise<Page[]> {
  return Promise.all(names.map((n) => joinPlayer(browser, pin, n)));
}

test('names ON (set-level): host shows voters under the correct option, players see the notice', async ({
  browser,
}) => {
  const { context, page: host } = await adminContext(browser);
  const { sessionId, pin } = await createAndStart(context, quizBody(`VN on ${Date.now()}`, true));
  await host.goto(`/host/${sessionId}`);

  const [ann, bob, cy] = await joinMany(browser, pin, ['Ann', 'Bob', 'Cy']);
  // Transparency notice is visible to players when the setting is on.
  await expect(ann.getByTestId('voter-names-notice')).toBeVisible();

  await host.getByTestId('host-primary').click(); // start
  await expect(ann.getByTestId('answer-0')).toBeVisible();
  await ann.getByTestId('answer-0').click(); // correct
  await bob.getByTestId('answer-0').click(); // correct
  await cy.getByTestId('answer-1').click(); // wrong -> reveal

  // The correct option (A, the first row) lists Ann and Bob.
  const correctRow = host.locator('[data-testid="reveal-option"][data-correct="true"]');
  const names = correctRow.getByTestId('voter-names');
  await expect(names).toContainText('Ann');
  await expect(names).toContainText('Bob');

  for (const p of [ann, bob, cy]) await p.context().close();
  await context.close();
});

test('names OFF (default): no voter names on the host, no notice for players', async ({
  browser,
}) => {
  const { context, page: host } = await adminContext(browser);
  const { sessionId, pin } = await createAndStart(context, quizBody(`VN off ${Date.now()}`, false));
  await host.goto(`/host/${sessionId}`);

  const p = await joinPlayer(browser, pin, 'Quiet');
  await expect(p.getByTestId('voter-names-notice')).toHaveCount(0);

  await host.getByTestId('host-primary').click();
  await p.getByTestId('answer-0').click();
  await expect(host.getByTestId('reveal-option').first()).toBeVisible();
  await expect(host.getByTestId('voter-names')).toHaveCount(0);

  await p.context().close();
  await context.close();
});

test('per-session override: toggling on in the lobby pushes the notice live to players', async ({
  browser,
}) => {
  const { context, page: host } = await adminContext(browser);
  const { sessionId, pin } = await createAndStart(context, quizBody(`VN override ${Date.now()}`, false));
  await host.goto(`/host/${sessionId}`);

  const p = await joinPlayer(browser, pin, 'Pat');
  await expect(p.getByTestId('voter-names-notice')).toHaveCount(0);

  // Host flips the setting in the lobby — the player notice appears immediately.
  await host.getByTestId('lobby-voter-names').click();
  await expect(p.getByTestId('voter-names-notice')).toBeVisible();

  await host.getByTestId('host-primary').click();
  await p.getByTestId('answer-0').click();
  await expect(host.locator('[data-testid="reveal-option"][data-correct="true"]').getByTestId('voter-names')).toContainText('Pat');

  await p.context().close();
  await context.close();
});

test('truncation: more than 10 voters on one option collapse into "+N more" and expand', async ({
  browser,
}) => {
  const { context, page: host } = await adminContext(browser);
  const { sessionId, pin } = await createAndStart(context, quizBody(`VN trunc ${Date.now()}`, true));
  await host.goto(`/host/${sessionId}`);

  const names = Array.from({ length: 12 }, (_, i) => `User${String(i + 1).padStart(2, '0')}`);
  const players = await joinMany(browser, pin, names);
  await expect(host.getByTestId('player-count')).toHaveText('12');

  await host.getByTestId('host-primary').click();
  // Everyone picks the correct option A.
  await Promise.all(players.map((p) => p.getByTestId('answer-0').click()));

  const correctRow = host.locator('[data-testid="reveal-option"][data-correct="true"]');
  const more = correctRow.getByTestId('voter-more');
  await expect(more).toHaveText('+2 more'); // 12 total, 10 shown
  await host.screenshot({ path: 'screenshots/host-voter-names-12.png' });

  await more.click();
  await expect(correctRow.getByTestId('voter-more')).toHaveCount(0);
  await expect(correctRow.getByTestId('voter-names')).toContainText('User12');

  for (const p of players) await p.context().close();
  await context.close();
});
