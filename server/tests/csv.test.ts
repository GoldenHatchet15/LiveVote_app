import { describe, expect, it } from 'vitest';
import { SessionEngine } from '../src/session/engine.js';
import { buildResultsCsv } from '../src/session/csv.js';
import { CapturingEmitter, FakeScheduler, makeQuizSet } from './helpers.js';

/** Parse a CSV into rows of cells (handles our simple quoting). */
function parse(csv: string): string[][] {
  return csv
    .trimEnd()
    .split('\n')
    .map((line) => line.split(',').map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"')));
}

describe('results CSV export (M4)', () => {
  it('emits one row per (player, question) with answers, correctness and points', () => {
    const set = makeQuizSet();
    const emitter = new CapturingEmitter();
    const scheduler = new FakeScheduler();
    const engine = new SessionEngine({ sessionId: 's', pin: '000000', set, emitter, scheduler });

    engine.addPlayer({ id: 'p0', nickname: 'Ann', reconnectToken: 't0' });
    engine.addPlayer({ id: 'p1', nickname: 'Bob', reconnectToken: 't1' });

    engine.startGame(); // q1
    engine.submitAnswer('p0', 'q1', { kind: 'option', optionId: 'q1a' }); // Ann correct
    engine.submitAnswer('p1', 'q1', { kind: 'option', optionId: 'q1b' }); // Bob wrong -> auto reveal
    engine.next(); // leaderboard
    engine.next(); // q2
    engine.submitAnswer('p0', 'q2', { kind: 'option', optionId: 'q2a' }); // Ann correct
    scheduler.advance(20_000); // Bob never answered -> timer reveals q2

    const csv = buildResultsCsv(engine, set);
    const rows = parse(csv);

    // Header + 2 players * 2 questions.
    expect(rows[0]).toEqual([
      'player',
      'avatar',
      'color',
      'final_score',
      'question_number',
      'question_text',
      'mode',
      'type',
      'response',
      'correct',
      'response_ms',
      'points_awarded',
    ]);
    expect(rows).toHaveLength(1 + 4);

    const idx = { player: 0, score: 3, qnum: 4, qtext: 5, mode: 6, sel: 8, correct: 9, points: 11 };
    const body = rows.slice(1);
    const annQ1 = body.find((r) => r[idx.player] === 'Ann' && r[idx.qnum] === '1')!;
    const bobQ1 = body.find((r) => r[idx.player] === 'Bob' && r[idx.qnum] === '1')!;
    const bobQ2 = body.find((r) => r[idx.player] === 'Bob' && r[idx.qnum] === '2')!;

    expect(annQ1[idx.sel]).toBe('Paris');
    expect(annQ1[idx.correct]).toBe('yes');
    expect(Number(annQ1[idx.points])).toBeGreaterThan(0);

    expect(bobQ1[idx.correct]).toBe('no');
    expect(Number(bobQ1[idx.points])).toBe(0);

    // Bob never answered q2 -> "no answer", blank selection.
    expect(bobQ2[idx.correct]).toBe('no answer');
    expect(bobQ2[idx.sel]).toBe('');

    // Final score is the player's total, repeated on every row.
    const annScore = Number(annQ1[idx.score]);
    expect(annScore).toBeGreaterThan(1000); // q1 + q2 both correct
    expect(body.filter((r) => r[idx.player] === 'Ann').every((r) => Number(r[idx.score]) === annScore)).toBe(true);
  });

  it('escapes commas and quotes in question text', () => {
    const set = makeQuizSet();
    set.questions[0]!.text = 'Hello, "world"';
    const engine = new SessionEngine({
      sessionId: 's',
      pin: '000000',
      set,
      emitter: new CapturingEmitter(),
      scheduler: new FakeScheduler(),
    });
    engine.addPlayer({ id: 'p0', nickname: 'Ann', reconnectToken: 't0' });
    engine.startGame();
    engine.submitAnswer('p0', 'q1', { kind: 'option', optionId: 'q1a' });
    const csv = buildResultsCsv(engine, set);
    expect(csv).toContain('"Hello, ""world"""');
  });
});
