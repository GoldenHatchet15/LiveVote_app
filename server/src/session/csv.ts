import type { AnswerValue } from '@livevote/shared';
import type { SessionEngine } from './engine.js';
import type { LoadedQuestion, LoadedSet } from './types.js';

function esc(value: string | number | boolean | null): string {
  const s = value === null ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Human-readable rendering of a canonical answer value for the CSV. */
function renderResponse(q: LoadedQuestion, value: AnswerValue | null): string {
  if (!value) return '';
  const textOf = (id: string) => q.options.find((o) => o.id === id)?.text ?? id;
  switch (value.kind) {
    case 'option':
      return textOf(value.optionId);
    case 'options':
      return value.optionIds.map(textOf).join(' | ');
    case 'order':
      return value.order.map(textOf).join(' > ');
    case 'text':
      return value.text;
    case 'number':
      return String(value.value);
  }
}

/**
 * Build a results CSV: one row per (player, question), plus the player's final
 * score. Includes the selected answer, whether it was correct, response time
 * and points — everything a presenter needs to review a game afterwards.
 */
export function buildResultsCsv(engine: SessionEngine, set: LoadedSet): string {
  const header = [
    'player',
    'final_score',
    'question_number',
    'question_text',
    'mode',
    'type',
    'response',
    'correct',
    'response_ms',
    'points_awarded',
  ];
  const lines: string[] = [header.join(',')];

  const players = [...engine.players.values()]
    .filter((p) => !p.kicked)
    .sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname));

  for (const player of players) {
    for (const q of set.questions) {
      const answer = player.answers.get(q.id) ?? null;
      const response = renderResponse(q, answer?.value ?? null);
      const correct =
        answer?.correct === null || answer?.correct === undefined
          ? answer
            ? '' // poll-style: no correctness
            : 'no answer'
          : answer.correct
            ? 'yes'
            : 'no';
      lines.push(
        [
          esc(player.nickname),
          esc(player.score),
          esc(q.order + 1),
          esc(q.text),
          esc(q.mode),
          esc(q.type),
          esc(response),
          esc(correct),
          esc(answer?.responseMs ?? ''),
          esc(answer?.pointsAwarded ?? 0),
        ].join(','),
      );
    }
  }

  return lines.join('\n') + '\n';
}
