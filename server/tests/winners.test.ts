import { describe, expect, it } from 'vitest';
import type { AnswerValue, QuestionConfig, QuestionMode, QuestionType } from '@livevote/shared';
import { buildResults, type RevealEntry } from '../src/session/answers.js';
import type { LoadedOption, LoadedQuestion, RecordedAnswer } from '../src/session/types.js';

function q(
  type: QuestionType,
  mode: QuestionMode = 'POLL',
  options: LoadedOption[] = [],
  config: QuestionConfig = {},
): LoadedQuestion {
  return { id: 'q', text: 't', imageUrl: null, mode, type, config, timeLimitSec: 20, points: 'NONE', order: 0, options };
}
const opt = (id: string, index: number, isCorrect = false): LoadedOption => ({ id, text: id, index, isCorrect });
function entry(nick: string, value: AnswerValue | null, hidden = false): RevealEntry {
  const answer: RecordedAnswer | null = value ? { value, responseMs: 0, pointsAwarded: 0, correct: null, hidden } : null;
  return { playerId: nick, nickname: nick, avatarEmoji: '🐸', color: '#000', answer };
}

describe('poll winner computation', () => {
  it('MULTIPLE_CHOICE: single winner by most votes', () => {
    const question = q('MULTIPLE_CHOICE', 'POLL', [opt('a', 0), opt('b', 1), opt('c', 2)]);
    const r = buildResults(question, [
      entry('A', { kind: 'option', optionId: 'a' }),
      entry('B', { kind: 'option', optionId: 'a' }),
      entry('C', { kind: 'option', optionId: 'b' }),
    ], false);
    expect(r.winners).toEqual({ keys: ['a'], tie: false, count: 2 });
  });

  it('ties: every tied answer wins', () => {
    const question = q('MULTIPLE_CHOICE', 'POLL', [opt('a', 0), opt('b', 1)]);
    const r = buildResults(question, [
      entry('A', { kind: 'option', optionId: 'a' }),
      entry('B', { kind: 'option', optionId: 'b' }),
    ], false);
    expect(r.winners!.keys.sort()).toEqual(['a', 'b']);
    expect(r.winners!.tie).toBe(true);
  });

  it('no answers -> no winner', () => {
    const question = q('MULTIPLE_CHOICE', 'POLL', [opt('a', 0), opt('b', 1)]);
    expect(buildResults(question, [entry('A', null)], false).winners).toBeUndefined();
  });

  it('QUIZ mode has no poll winner badge', () => {
    const question = q('MULTIPLE_CHOICE', 'QUIZ', [opt('a', 0, true), opt('b', 1)]);
    const r = buildResults(question, [entry('A', { kind: 'option', optionId: 'a' })], false);
    expect(r.winners).toBeUndefined();
  });

  it('RATING: most-chosen value wins', () => {
    const question = q('RATING', 'POLL', [], { scale: 5 });
    const r = buildResults(question, [
      entry('A', { kind: 'number', value: 5 }),
      entry('B', { kind: 'number', value: 5 }),
      entry('C', { kind: 'number', value: 3 }),
    ], false);
    expect(r.winners).toEqual({ keys: ['5'], tie: false, count: 2 });
  });

  it('OPEN_ENDED word cloud: most frequent word wins', () => {
    const question = q('OPEN_ENDED', 'POLL', [], { revealStyle: 'WORD_CLOUD' });
    const r = buildResults(question, [
      entry('A', { kind: 'text', text: 'great' }),
      entry('B', { kind: 'text', text: 'Great' }),
      entry('C', { kind: 'text', text: 'meh' }),
    ], false);
    expect(r.winners!.keys.map((k) => k.toLowerCase())).toContain('great');
    expect(r.winners!.count).toBe(2);
  });

  it('SLIDER poll: no single winner', () => {
    const question = q('SLIDER', 'POLL', [], { min: 0, max: 10, step: 1 });
    expect(buildResults(question, [entry('A', { kind: 'number', value: 5 })], false).winners).toBeUndefined();
  });

  it('WRITE_IN: winner from post-merge/hide counts', () => {
    const question = q('WRITE_IN', 'POLL');
    const entries = [
      entry('A', { kind: 'text', text: 'jose' }),
      entry('B', { kind: 'text', text: 'joes' }),
      entry('C', { kind: 'text', text: 'carlos' }),
      entry('D', { kind: 'text', text: 'carlos' }, true), // hidden
    ];
    // Before merge: carlos(1 visible), jose(1), joes(1) -> three-way tie.
    const before = buildResults(question, entries, false);
    expect(before.winners!.tie).toBe(true);
    // After merging joes->jose: jose(2) beats carlos(1).
    const after = buildResults(question, entries, false, { merges: { joes: 'jose' } });
    expect(after.winners).toEqual({ keys: ['jose'], tie: false, count: 2 });
  });
});
