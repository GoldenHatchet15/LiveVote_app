import { expect, test, type Page } from '@playwright/test';
import { adminContext, createAndStart, joinPlayer } from './helpers';

function writeInBody(title: string) {
  return {
    title,
    description: 'Write-in',
    showVoterNames: true,
    questions: [
      {
        text: 'Which student is most likely to ride a skateboard to class?',
        mode: 'POLL',
        type: 'WRITE_IN',
        timeLimitSec: 60,
        points: 'NONE',
        options: [],
        correctOptionIndices: [],
        config: { suggestedAnswers: [], onlySuggested: false, maxAnswerLength: 40, reviewBeforeReveal: false },
      },
    ],
  };
}

async function answerText(p: Page, text: string) {
  await expect(p.getByTestId('text-input')).toBeVisible();
  await p.getByTestId('text-input').fill(text);
  await p.getByTestId('answer-submit').click();
}

test('WRITE_IN groups mixed casing/accents, shows voters, suggests + merges duplicates', async ({ browser }) => {
  test.setTimeout(60_000);
  const { context, page: host } = await adminContext(browser);
  const { sessionId, pin } = await createAndStart(context, writeInBody(`WriteIn ${Date.now()}`));
  await host.goto(`/host/${sessionId}`);

  const names = ['Ana', 'Luis', 'Pedro', 'Marta', 'Kevin', 'Sam'];
  const answers = ['carlos', 'Carlos', 'CARLOS', 'José', 'jose', 'Joes'];
  const players: Page[] = [];
  for (const n of names) players.push(await joinPlayer(browser, pin, n));
  await expect(host.getByTestId('player-count')).toHaveText('6');

  await host.getByTestId('host-primary').click(); // start
  for (let i = 0; i < players.length; i++) await answerText(players[i]!, answers[i]!);

  // Reveal: grouped bars.
  const carlos = host.locator('[data-testid="write-in-group"][data-key="carlos"]');
  await expect(carlos).toBeVisible();
  await expect(carlos).toHaveAttribute('data-count', '3');
  // Voter name tags under the Carlos group.
  const carlosNames = carlos.getByTestId('voter-names');
  for (const n of ['Ana', 'Luis', 'Pedro']) await expect(carlosNames).toContainText(n);

  // José (2) and Joes (1) exist and are flagged as possible duplicates.
  await expect(host.locator('[data-testid="write-in-group"][data-key="jose"]')).toHaveAttribute('data-count', '2');
  await expect(host.locator('[data-testid="write-in-group"][data-key="joes"]')).toHaveAttribute('data-count', '1');
  await expect(host.getByTestId('wi-duplicates')).toBeVisible();
  await host.screenshot({ path: 'screenshots/write-in-reveal.png' });

  // Merge the duplicate: José becomes 3, Joes disappears.
  await host.getByTestId('wi-merge').first().click();
  await expect(host.locator('[data-testid="write-in-group"][data-key="jose"]')).toHaveAttribute('data-count', '3');
  await expect(host.locator('[data-testid="write-in-group"][data-key="joes"]')).toHaveCount(0);

  for (const p of players) await p.context().close();
  await context.close();
});

test('WRITE_IN: players never see others’ answers on their phones', async ({ browser }) => {
  const { context, page: host } = await adminContext(browser);
  const { sessionId, pin } = await createAndStart(context, writeInBody(`WriteIn priv ${Date.now()}`));
  await host.goto(`/host/${sessionId}`);
  const p1 = await joinPlayer(browser, pin, 'Ana');
  const p2 = await joinPlayer(browser, pin, 'Beto');
  await host.getByTestId('host-primary').click();
  await answerText(p1, 'Carlos');
  await answerText(p2, 'Carlos');
  // The answering player only ever sees their own "vote received" state.
  await expect(p1.getByText(/Answer locked in|Vote received/)).toBeVisible();
  await expect(p1.locator('body')).not.toContainText('Beto');

  await p1.context().close();
  await p2.context().close();
  await context.close();
});
