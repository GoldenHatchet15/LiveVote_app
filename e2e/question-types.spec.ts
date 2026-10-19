import { expect, test, type Page } from '@playwright/test';
import { adminContext, createAndStart, joinPlayer } from './helpers';

/** A set with one question of every type (quiz + poll), names ON. */
function mixedSetBody(title: string) {
  return {
    title,
    description: 'All question types',
    showVoterNames: true,
    showResultsSummary: false,
    questions: [
      {
        text: 'Capital of Japan?',
        mode: 'QUIZ',
        type: 'MULTIPLE_CHOICE',
        timeLimitSec: 30,
        points: 'STANDARD',
        options: [{ text: 'Tokyo' }, { text: 'Kyoto' }, { text: 'Osaka' }],
        correctOptionIndices: [0],
        config: {},
      },
      {
        text: 'Pick the primes',
        mode: 'QUIZ',
        type: 'MULTI_SELECT',
        timeLimitSec: 30,
        points: 'STANDARD',
        options: [{ text: '2' }, { text: '4' }, { text: '5' }, { text: '9' }],
        correctOptionIndices: [0, 2],
        config: {},
      },
      {
        text: 'The sun is a star.',
        mode: 'QUIZ',
        type: 'TRUE_FALSE',
        timeLimitSec: 30,
        points: 'STANDARD',
        options: [{ text: 'True' }, { text: 'False' }],
        correctOptionIndices: [0],
        config: { trueLabel: 'True', falseLabel: 'False' },
      },
      {
        text: 'Spanish for hello?',
        mode: 'QUIZ',
        type: 'TYPE_ANSWER',
        timeLimitSec: 30,
        points: 'STANDARD',
        options: [],
        correctOptionIndices: [],
        config: { acceptedAnswers: ['hola'], exactMatch: false },
      },
      {
        text: 'One word for today?',
        mode: 'POLL',
        type: 'OPEN_ENDED',
        timeLimitSec: 30,
        points: 'NONE',
        options: [],
        correctOptionIndices: [],
        config: { revealStyle: 'WORD_CLOUD' },
      },
      {
        text: 'Year of the Moon landing?',
        mode: 'QUIZ',
        type: 'SLIDER',
        timeLimitSec: 30,
        points: 'STANDARD',
        options: [],
        correctOptionIndices: [],
        config: { min: 1940, max: 2000, step: 1, correctValue: 1969, tolerance: 2 },
      },
      {
        text: 'Order the planets from the Sun',
        mode: 'QUIZ',
        type: 'ORDERING',
        timeLimitSec: 30,
        points: 'STANDARD',
        options: [{ text: 'Mercury' }, { text: 'Venus' }, { text: 'Earth' }],
        correctOptionIndices: [],
        config: {},
      },
      {
        text: 'Rate the session',
        mode: 'POLL',
        type: 'RATING',
        timeLimitSec: 30,
        points: 'NONE',
        options: [],
        correctOptionIndices: [],
        config: { scale: 5, lowLabel: 'Meh', highLabel: 'Great' },
      },
    ],
  };
}

async function setSlider(p: Page, value: string) {
  await p.locator('[data-testid="slider-input"]').evaluate((el, v) => {
    const input = el as HTMLInputElement;
    input.value = v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

test('mixed set: one question of every type plays end to end (names ON)', async ({ browser }) => {
  test.setTimeout(90_000);
  const { context, page: host } = await adminContext(browser);
  const { sessionId, pin } = await createAndStart(context, mixedSetBody(`Mixed ${Date.now()}`));
  await host.goto(`/host/${sessionId}`);

  const p1 = await joinPlayer(browser, pin, 'Ada');
  const p2 = await joinPlayer(browser, pin, 'Bo');
  await expect(host.getByTestId('player-count')).toHaveText('2');

  const next = (times: number) => clickNext(host, times);

  // Q1 MULTIPLE_CHOICE
  await host.getByTestId('host-primary').click();
  await expect(p1.getByTestId('answer-0')).toBeVisible();
  await p1.screenshot({ path: 'screenshots/player-multiple_choice.png' });
  await p1.getByTestId('answer-0').click();
  await p2.getByTestId('answer-1').click();
  await expect(host.getByTestId('reveal-option').first()).toBeVisible();
  await host.screenshot({ path: 'screenshots/type-multiple_choice.png' });
  await next(2);

  // Q2 MULTI_SELECT (submit several)
  await expect(p1.getByTestId('answer-0')).toBeVisible();
  await p1.getByTestId('answer-0').click();
  await p1.getByTestId('answer-2').click();
  await p1.screenshot({ path: 'screenshots/player-multi_select.png' });
  await p1.getByTestId('answer-submit').click();
  await p2.getByTestId('answer-1').click();
  await p2.getByTestId('answer-submit').click();
  await expect(host.getByTestId('reveal-option').first()).toBeVisible();
  await host.screenshot({ path: 'screenshots/type-multi_select.png' });
  await next(2);

  // Q3 TRUE_FALSE
  await expect(p1.getByTestId('answer-0')).toBeVisible();
  await p1.screenshot({ path: 'screenshots/player-true_false.png' });
  await p1.getByTestId('answer-0').click();
  await p2.getByTestId('answer-3').click();
  await expect(host.getByTestId('reveal-option').first()).toBeVisible();
  await host.screenshot({ path: 'screenshots/type-true_false.png' });
  await next(2);

  // Q4 TYPE_ANSWER
  await expect(p1.getByTestId('text-input')).toBeVisible();
  await p1.getByTestId('text-input').fill('hola');
  await p1.screenshot({ path: 'screenshots/player-type_answer.png' });
  await p1.getByTestId('answer-submit').click();
  await p2.getByTestId('text-input').fill('bonjour');
  await p2.getByTestId('answer-submit').click();
  await expect(host.getByText('hola')).toBeVisible();
  await host.screenshot({ path: 'screenshots/type-type_answer.png' });
  await next(2);

  // Q5 OPEN_ENDED (poll -> word cloud)
  await expect(p1.getByTestId('text-input')).toBeVisible();
  await p1.getByTestId('text-input').fill('great');
  await p1.screenshot({ path: 'screenshots/player-open_ended.png' });
  await p1.getByTestId('answer-submit').click();
  await p2.getByTestId('text-input').fill('great');
  await p2.getByTestId('answer-submit').click();
  await expect(host.getByTestId('cloud-word').first()).toBeVisible();
  await host.screenshot({ path: 'screenshots/type-open_ended.png' });
  await next(1);

  // Q6 SLIDER
  await expect(p1.getByTestId('slider-input')).toBeVisible();
  await setSlider(p1, '1969');
  await p1.screenshot({ path: 'screenshots/player-slider.png' });
  await p1.getByTestId('answer-submit').click();
  await setSlider(p2, '1980');
  await p2.getByTestId('answer-submit').click();
  await expect(host.getByTestId('slider-dot').first()).toBeVisible();
  await host.screenshot({ path: 'screenshots/type-slider.png' });
  await next(2);

  // Q7 ORDERING
  await expect(p1.getByTestId('order-item-0')).toBeVisible();
  await p1.screenshot({ path: 'screenshots/player-ordering.png' });
  await p1.getByTestId('answer-submit').click();
  await p2.getByTestId('answer-submit').click();
  await expect(host.getByText('Correct order')).toBeVisible();
  await host.screenshot({ path: 'screenshots/type-ordering.png' });
  await next(2);

  // Q8 RATING (poll)
  await expect(p1.getByTestId('rating-5')).toBeVisible();
  await p1.screenshot({ path: 'screenshots/player-rating.png' });
  await p1.getByTestId('rating-5').click();
  await p1.getByTestId('answer-submit').click();
  await p2.getByTestId('rating-3').click();
  await p2.getByTestId('answer-submit').click();
  await expect(host.getByText(/Average/)).toBeVisible();
  await host.screenshot({ path: 'screenshots/type-rating.png' });
  await next(1);

  // Game over -> back to dashboard still works.
  await expect(host.getByRole('link', { name: 'Back to dashboard' })).toBeVisible();

  await p1.context().close();
  await p2.context().close();
  await context.close();
});

/** Advance the host past a reveal (and the quiz leaderboard) to the next screen. */
async function clickNext(host: Page, times: number) {
  for (let i = 0; i < times; i++) {
    await host.getByTestId('host-primary').click();
    await host.waitForTimeout(250);
  }
}
