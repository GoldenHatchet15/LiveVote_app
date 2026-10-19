import { describe, expect, it } from 'vitest';
import {
  findDuplicateSuggestions,
  groupWriteIn,
  isNearDuplicate,
  normalizeWriteIn,
  osaDistance,
  pickLabel,
  titleCase,
  type WriteInSubmission,
} from '@livevote/shared';

describe('normalizeWriteIn', () => {
  it('folds case, accents, inner/trailing spaces and trailing punctuation', () => {
    expect(normalizeWriteIn('Carlos')).toBe('carlos');
    expect(normalizeWriteIn('CARLOS')).toBe('carlos');
    expect(normalizeWriteIn('  carlos  ')).toBe('carlos');
    expect(normalizeWriteIn('José')).toBe('jose');
    expect(normalizeWriteIn('jose!')).toBe('jose');
    expect(normalizeWriteIn('Carlos.')).toBe('carlos');
    expect(normalizeWriteIn('san  jose?')).toBe('san jose');
  });
});

describe('titleCase', () => {
  it('capitalizes each word, lowercasing the rest', () => {
    expect(titleCase('carlos')).toBe('Carlos');
    expect(titleCase('CARLOS')).toBe('Carlos');
    expect(titleCase('josé')).toBe('José');
    expect(titleCase('san  jose')).toBe('San Jose');
  });
});

describe('grouping', () => {
  const sub = (text: string, voter: string, hidden = false): WriteInSubmission<string> => ({ text, voter, hidden });

  it('groups case/accent variants and counts votes with voters in order', () => {
    const groups = groupWriteIn([
      sub('carlos', 'Ana'),
      sub('Carlos', 'Luis'),
      sub('CARLOS', 'Pedro'),
      sub('José', 'Marta'),
      sub('jose', 'Kevin'),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.count).toBe(3);
    expect(groups[0]!.label).toBe('Carlos'); // tie on spelling -> first submitted, title-cased
    expect(groups[0]!.voters).toEqual(['Ana', 'Luis', 'Pedro']);
    expect(groups[1]!.count).toBe(2);
    expect(groups[1]!.label).toBe('José'); // first submitted spelling preserved
    expect(groups[1]!.voters).toEqual(['Marta', 'Kevin']);
  });

  it('uses the suggested spelling as the label when the key matches', () => {
    const groups = groupWriteIn([sub('carlos', 'A'), sub('CARLOS', 'B')], ['Carlos']);
    expect(groups[0]!.label).toBe('Carlos');
  });

  it('most common spelling wins the label (not a tie)', () => {
    const groups = groupWriteIn([sub('carlos', 'A'), sub('Carlos', 'B'), sub('Carlos', 'C')]);
    expect(groups[0]!.label).toBe('Carlos');
  });

  it('excludes hidden submissions from counts', () => {
    const groups = groupWriteIn([sub('carlos', 'A'), sub('carlos', 'B', true)]);
    expect(groups[0]!.count).toBe(1);
    expect(groups[0]!.voters).toEqual(['A']);
  });

  it('applies host merges (one key folded into another)', () => {
    const groups = groupWriteIn(
      [sub('jose', 'A'), sub('joes', 'B'), sub('jose', 'C')],
      [],
      { joes: 'jose' }, // merge "joes" -> "jose"
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.count).toBe(3);
    expect(groups[0]!.voters).toEqual(['A', 'B', 'C']);
  });
});

describe('near-duplicate detection', () => {
  it('flags transpositions/edits within distance 1 for 4+ char answers', () => {
    expect(osaDistance('jose', 'joes')).toBe(1);
    expect(isNearDuplicate('jose', 'joes')).toBe(true);
    expect(isNearDuplicate('carlos', 'karlos')).toBe(true); // 1 substitution
    expect(isNearDuplicate('ana', 'anna')).toBe(false); // under 4 chars
    expect(isNearDuplicate('carlos', 'pedro')).toBe(false);
  });

  it('suggests duplicate group pairs', () => {
    const dups = findDuplicateSuggestions([
      { key: 'jose', label: 'José' },
      { key: 'joes', label: 'Joes' },
      { key: 'carlos', label: 'Carlos' },
    ]);
    expect(dups).toHaveLength(1);
    expect(dups[0]!.a).toBe('jose');
    expect(dups[0]!.b).toBe('joes');
  });
});

describe('pickLabel', () => {
  it('prefers a matching suggested spelling; else most-common/first, title-cased', () => {
    expect(pickLabel('carlos', ['carlos'], ['Carlos'])).toBe('Carlos');
    expect(pickLabel('jose', ['jose'], ['José'])).toBe('José'); // suggested matches key
    expect(pickLabel('jose', ['jose', 'JOSE'], [])).toBe('Jose'); // tie -> first, title-cased
    expect(pickLabel('jose', ['jose'], ['Marta'])).toBe('Jose'); // no suggested match
  });
});
