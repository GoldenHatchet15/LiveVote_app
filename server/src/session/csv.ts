import type { SessionEngine } from './engine.js';
import type { LoadedSet } from './types.js';

function esc(value: string | number | boolean | null): string {
  const s = value === null ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
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
    'selected_option',
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
      const optText = answer
        ? (q.options.find((o) => o.id === answer.optionId)?.text ?? '')
        : '';
      const correct =
        q.mode === 'POLL' ? '' : answer ? (answer.correct ? 'yes' : 'no') : 'no answer';
      lines.push(
        [
          esc(player.nickname),
          esc(player.score),
          esc(q.order + 1),
          esc(q.text),
          esc(q.mode),
          esc(optText),
          esc(correct),
          esc(answer?.responseMs ?? ''),
          esc(answer?.pointsAwarded ?? 0),
        ].join(','),
      );
    }
  }

  return lines.join('\n') + '\n';
}
