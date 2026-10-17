import { describe, expect, it } from 'vitest';
import type { AnswerValue, QuestionConfig, QuestionType } from '@livevote/shared';
import { buildResults, prepareAnswer, sanitizeText, type RevealEntry } from '../src/session/answers.js';
import type { LoadedOption, LoadedQuestion, RecordedAnswer } from '../src/session/types.js';

function q(
  type: QuestionType,
  config: QuestionConfig = {},
  options: LoadedOption[] = [],
  mode: 'QUIZ' | 'POLL' = 'QUIZ',
): LoadedQuestion {
  return { id: 'q', text: 't', imageUrl: null, mode, type, config, timeLimitSec: 20, points: 'STANDARD', order: 0, options };
}
const opt = (id: string, index: number, isCorrect = false): LoadedOption => ({ id, text: id.toUpperCase(), index, isCorrect });

function entry(nick: string, value: AnswerValue | null, hidden = false): RevealEntry {
  const answer: RecordedAnswer | null = value
    ? { value, responseMs: 0, pointsAwarded: 0, correct: null, hidden }
    : null;
  return { playerId: nick, nickname: nick, answer };
}

describe('prepareAnswer rejects malformed answers per type', () => {
  it('MC: wrong kind / unknown option', () => {
    const question = q('MULTIPLE_CHOICE', {}, [opt('a', 0, true), opt('b', 1)]);
    expect(prepareAnswer(question, { kind: 'text', text: 'x' }).ok).toBe(false);
    expect(prepareAnswer(question, { kind: 'option', optionId: 'zzz' }).ok).toBe(false);
    expect(prepareAnswer(question, { kind: 'option', optionId: 'a' }).ok).toBe(true);
  });
  it('MULTI_SELECT: must be non-empty known options', () => {
    const question = q('MULTI_SELECT', {}, [opt('a', 0, true), opt('b', 1), opt('c', 2, true)]);
    expect(prepareAnswer(question, { kind: 'options', optionIds: [] }).ok).toBe(false);
    expect(prepareAnswer(question, { kind: 'options', optionIds: ['a', 'zzz'] }).ok).toBe(false);
    expect(prepareAnswer(question, { kind: 'options', optionIds: ['a', 'c'] }).ok).toBe(true);
  });
  it('ORDERING: must be a permutation of all items', () => {
    const question = q('ORDERING', {}, [opt('a', 0), opt('b', 1), opt('c', 2)]);
    expect(prepareAnswer(question, { kind: 'order', order: ['a', 'b'] }).ok).toBe(false);
    expect(prepareAnswer(question, { kind: 'order', order: ['a', 'a', 'b'] }).ok).toBe(false);
    expect(prepareAnswer(question, { kind: 'order', order: ['c', 'a', 'b'] }).ok).toBe(true);
  });
  it('SLIDER: number within [min,max]', () => {
    const question = q('SLIDER', { min: 0, max: 10, step: 1, correctValue: 5, tolerance: 1 });
    expect(prepareAnswer(question, { kind: 'number', value: 20 }).ok).toBe(false);
    expect(prepareAnswer(question, { kind: 'number', value: Infinity }).ok).toBe(false);
    expect(prepareAnswer(question, { kind: 'number', value: 5 }).ok).toBe(true);
  });
  it('RATING: integer within [1,scale]', () => {
    const question = q('RATING', { scale: 5 }, [], 'POLL');
    expect(prepareAnswer(question, { kind: 'number', value: 6 }).ok).toBe(false);
    expect(prepareAnswer(question, { kind: 'number', value: 2.5 }).ok).toBe(false);
    expect(prepareAnswer(question, { kind: 'number', value: 3 }).ok).toBe(true);
  });
  it('TYPE_ANSWER: trims, rejects empty / over-long', () => {
    const question = q('TYPE_ANSWER', { acceptedAnswers: ['x'] });
    expect(prepareAnswer(question, { kind: 'text', text: '   ' }).ok).toBe(false);
    expect(prepareAnswer(question, { kind: 'text', text: 'a'.repeat(50) }).ok).toBe(false);
  });
});

describe('OPEN_ENDED moderation and sanitization', () => {
  const question = q('OPEN_ENDED', { revealStyle: 'ANSWER_WALL' }, [], 'POLL');
  it('strips HTML so nothing can be injected', () => {
    expect(sanitizeText('<img src=x onerror=alert(1)>hi')).toBe('hi');
    const r = prepareAnswer(question, { kind: 'text', text: '<b>bold</b> idea' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ kind: 'text', text: 'bold idea' });
  });
  it('rejects profanity on submit', () => {
    const r = prepareAnswer(question, { kind: 'text', text: 'this is shit' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NICKNAME_PROFANE');
  });
});

describe('buildResults — type-specific reveal payloads', () => {
  it('TYPE_ANSWER: buckets correct + common wrong; names grouped when ON', () => {
    const question = q('TYPE_ANSWER', { acceptedAnswers: ['canción'] });
    const entries = [
      entry('Ann', { kind: 'text', text: 'Cancion' }), // correct (normalized)
      entry('Bob', { kind: 'text', text: 'nope' }),
      entry('Cy', { kind: 'text', text: 'NOPE' }), // same wrong bucket
    ];
    const off = buildResults(question, entries, false);
    expect(off.textAnswers?.find((r) => r.correct)?.count).toBe(1);
    expect(off.textAnswers?.find((r) => !r.correct)?.count).toBe(2);
    expect(off.voterGroups).toBeUndefined();
    expect(off.percentCorrect).toBe(33);

    const on = buildResults(question, entries, true);
    const correctGroup = on.voterGroups?.find((g) => g.correct);
    expect(correctGroup?.nicknames).toEqual(['Ann']);
  });

  it('OPEN_ENDED word cloud counts; hidden excluded', () => {
    const question = q('OPEN_ENDED', { revealStyle: 'WORD_CLOUD' }, [], 'POLL');
    const entries = [
      entry('Ann', { kind: 'text', text: 'great' }),
      entry('Bob', { kind: 'text', text: 'Great' }),
      entry('Cy', { kind: 'text', text: 'meh' }, true), // hidden by host
    ];
    const r = buildResults(question, entries, false);
    const words = r.openEnded?.words ?? [];
    expect(words.find((w) => w.word.toLowerCase() === 'great')?.count).toBe(2);
    expect(words.some((w) => w.word === 'meh')).toBe(false); // hidden excluded
  });

  it('OPEN_ENDED answer wall carries nicknames only when names ON', () => {
    const question = q('OPEN_ENDED', { revealStyle: 'ANSWER_WALL' }, [], 'POLL');
    const entries = [entry('Ann', { kind: 'text', text: 'hello' })];
    expect(buildResults(question, entries, false).openEnded?.cards?.[0]?.nickname).toBeUndefined();
    expect(buildResults(question, entries, true).openEnded?.cards?.[0]?.nickname).toBe('Ann');
  });

  it('SLIDER: distribution + correct value (quiz) / avg', () => {
    const question = q('SLIDER', { min: 0, max: 100, step: 1, correctValue: 50, tolerance: 5 });
    const entries = [entry('Ann', { kind: 'number', value: 50 }), entry('Bob', { kind: 'number', value: 60 })];
    const r = buildResults(question, entries, false);
    expect(r.slider?.values.sort((a, b) => a - b)).toEqual([50, 60]);
    expect(r.slider?.correctValue).toBe(50);
    expect(r.slider?.average).toBe(55);
  });

  it('RATING: counts per value + average', () => {
    const question = q('RATING', { scale: 5 }, [], 'POLL');
    const entries = [entry('Ann', { kind: 'number', value: 5 }), entry('Bob', { kind: 'number', value: 3 })];
    const r = buildResults(question, entries, false);
    expect(r.rating?.counts.find((c) => c.value === 5)?.count).toBe(1);
    expect(r.rating?.average).toBe(4);
  });

  it('ORDERING: correct order + Correct/Incorrect groups when ON', () => {
    const question = q('ORDERING', {}, [opt('a', 0), opt('b', 1), opt('c', 2)]);
    const entries = [
      entry('Ann', { kind: 'order', order: ['a', 'b', 'c'] }), // correct
      entry('Bob', { kind: 'order', order: ['b', 'a', 'c'] }), // wrong
    ];
    const r = buildResults(question, entries, true);
    expect(r.ordering?.correctOrder.map((o) => o.optionId)).toEqual(['a', 'b', 'c']);
    expect(r.voterGroups?.find((g) => g.correct)?.nicknames).toEqual(['Ann']);
    expect(r.voterGroups?.find((g) => !g.correct)?.nicknames).toEqual(['Bob']);
  });
});

describe('no answer leak in reveal payloads (names OFF)', () => {
  for (const [type, question, value] of [
    ['TYPE_ANSWER', q('TYPE_ANSWER', { acceptedAnswers: ['x'] }), { kind: 'text', text: 'x' }],
    ['SLIDER', q('SLIDER', { min: 0, max: 10, step: 1, correctValue: 5, tolerance: 1 }), { kind: 'number', value: 5 }],
    ['ORDERING', q('ORDERING', {}, [opt('a', 0), opt('b', 1), opt('c', 2)]), { kind: 'order', order: ['a', 'b', 'c'] }],
  ] as const) {
    it(`${type}: no voter names/groups when the setting is off`, () => {
      const r = buildResults(question, [entry('Ann', value as AnswerValue)], false);
      expect(r.voters).toBeUndefined();
      expect(r.voterGroups).toBeUndefined();
      expect(r.noAnswer).toBeUndefined();
    });
  }
});
