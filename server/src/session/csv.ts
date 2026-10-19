import {
  groupWriteIn,
  normalizeWriteIn,
  resolveMergeKey,
  type AnswerValue,
} from '@livevote/shared';
import type { SessionEngine } from './engine.js';
import type { LoadedQuestion, LoadedSet } from './types.js';

function esc(value: string | number | boolean | null): string {
  let s = value === null ? '' : String(value);
  // Neutralize CSV/formula injection: a cell starting with =, +, -, @, tab or
  // carriage return is treated as a formula by Excel/Sheets. Prefix with a quote.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
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
    'avatar',
    'color',
    'final_score',
    'question_number',
    'question_text',
    'mode',
    'type',
    'response',
    'group_label',
    'hidden',
    'correct',
    'response_ms',
    'points_awarded',
  ];
  const lines: string[] = [header.join(',')];

  // Precompute WRITE_IN group labels per question (so the CSV shows the grouped
  // vote each raw answer counted toward, respecting host merges).
  const writeInLabels = new Map<string, Map<string, string>>(); // questionId -> (normKey -> label)
  for (const q of set.questions) {
    if (q.type !== 'WRITE_IN') continue;
    const merges = engine.writeInMergesOf(q.id);
    const subs = [...engine.players.values()]
      .filter((p) => !p.kicked)
      .map((p) => p.answers.get(q.id))
      .filter((a): a is NonNullable<typeof a> => !!a && a.value.kind === 'text')
      .sort((a, b) => a.responseMs - b.responseMs)
      .map((a) => ({ text: (a.value as { kind: 'text'; text: string }).text, voter: 0 }));
    const labelByKey = new Map<string, string>();
    for (const g of groupWriteIn(subs, q.config.suggestedAnswers ?? [], merges)) labelByKey.set(g.key, g.label);
    writeInLabels.set(q.id, labelByKey);
  }

  const players = [...engine.players.values()]
    .filter((p) => !p.kicked)
    .sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname));

  for (const player of players) {
    for (const q of set.questions) {
      const answer = player.answers.get(q.id) ?? null;
      const response = renderResponse(q, answer?.value ?? null);
      // WRITE_IN: the grouped label this answer counted toward + hidden flag.
      let groupLabel = '';
      let hidden = '';
      if (q.type === 'WRITE_IN' && answer && answer.value.kind === 'text') {
        const key = resolveMergeKey(normalizeWriteIn(answer.value.text), engine.writeInMergesOf(q.id));
        groupLabel = writeInLabels.get(q.id)?.get(key) ?? '';
        const groupHidden = engine.writeInHiddenGroupsOf(q.id).has(key);
        hidden = answer.hidden || groupHidden ? 'yes' : '';
      }
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
          esc(player.avatarEmoji),
          esc(player.color),
          esc(player.score),
          esc(q.order + 1),
          esc(q.text),
          esc(q.mode),
          esc(q.type),
          esc(response),
          esc(groupLabel),
          esc(hidden),
          esc(correct),
          esc(answer?.responseMs ?? ''),
          esc(answer?.pointsAwarded ?? 0),
        ].join(','),
      );
    }
  }

  // --- Results summary section (poll winners) ---
  const summary = engine.buildHostSummary();
  if (summary.length > 0) {
    lines.push('');
    lines.push('RESULTS SUMMARY');
    lines.push(['question_number', 'question_text', 'winning_answer', 'votes', 'percent', 'tie'].join(','));
    for (const s of summary) {
      if (s.winners.length === 0) {
        lines.push([esc(s.index + 1), esc(s.text), esc('(no votes)'), esc(0), esc('0%'), esc('')].join(','));
        continue;
      }
      for (const w of s.winners) {
        lines.push([esc(s.index + 1), esc(s.text), esc(w.label), esc(w.count), esc(`${w.percent}%`), esc(s.tie ? 'tie' : '')].join(','));
      }
    }
  }

  return lines.join('\n') + '\n';
}
