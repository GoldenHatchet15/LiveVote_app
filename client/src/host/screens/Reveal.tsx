import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { PublicQuestion, QuestionResults, Voter, VoterGroup, WriteInGroupResult } from '@livevote/shared';
import { Shape, shapeColor } from '../../components/Shape';
import { NameTag } from '../../components/NameTag';
import { sound } from '../../lib/sound';

const MAX_NAMES = 10;

function VoterNames({ voters }: { voters: Voter[] }) {
  const [expanded, setExpanded] = useState(false);
  if (voters.length === 0) return <p className="mt-1 text-sm italic text-white/30">No one</p>;
  const shown = expanded ? voters : voters.slice(0, MAX_NAMES);
  const hidden = voters.length - shown.length;
  return (
    <div data-testid="voter-names" className="mt-1 flex max-h-28 flex-wrap items-center gap-1.5 overflow-auto">
      {shown.map((v, i) => (
        <NameTag key={`${v.nickname}-${i}`} nickname={v.nickname} avatarEmoji={v.avatarEmoji} color={v.color} size="sm" />
      ))}
      {hidden > 0 && (
        <button
          data-testid="voter-more"
          className="rounded-lg bg-white/5 px-2 py-0.5 text-sm font-semibold text-white/60 hover:bg-white/15"
          onClick={() => setExpanded(true)}
        >
          +{hidden} more
        </button>
      )}
      {expanded && voters.length > MAX_NAMES && (
        <button
          className="rounded-lg bg-white/5 px-2 py-0.5 text-sm font-semibold text-white/60 hover:bg-white/15"
          onClick={() => setExpanded(false)}
        >
          Show fewer
        </button>
      )}
    </div>
  );
}

function VoterGroupList({ groups }: { groups: VoterGroup[] }) {
  return (
    <div data-testid="voter-groups" className="mt-4 grid gap-3">
      {groups.map((g, i) => (
        <div key={i}>
          <span
            className={`text-sm font-bold uppercase tracking-wide ${g.correct ? 'text-shape-green' : 'text-white/60'}`}
          >
            {g.label}
          </span>
          <VoterNames voters={g.voters} />
        </div>
      ))}
    </div>
  );
}

function Footer({ results, hideResults }: { results: QuestionResults; hideResults: boolean }) {
  return (
    <p className="mt-8 text-center text-lg text-white/40">
      {results.totalAnswers} of {results.totalPlayers} answered
      {results.percentCorrect !== undefined ? ` · ${results.percentCorrect}% correct` : ''}
      {hideResults ? ' · results hidden (press R to show)' : ''}
    </p>
  );
}

export function Reveal({
  question,
  results,
  hideResults,
  onHide,
  onMerge,
  onUndoMerge,
  onHideGroup,
}: {
  question: PublicQuestion;
  results: QuestionResults;
  hideResults: boolean;
  onHide: (playerId: string, hidden: boolean) => void;
  onMerge: (sourceKey: string, targetKey: string) => void;
  onUndoMerge: (sourceKey: string) => void;
  onHideGroup: (key: string, hidden: boolean) => void;
}) {
  useEffect(() => {
    sound.reveal();
  }, [results.questionId]);

  const showNames = (results.voters !== undefined || results.voterGroups !== undefined) && !hideResults;

  return (
    <div className="flex min-h-screen flex-col justify-center p-8">
      <h2 className="mb-8 text-center text-3xl font-bold text-white xl:text-4xl">{question.text}</h2>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        {(results.questionType === 'MULTIPLE_CHOICE' ||
          results.questionType === 'MULTI_SELECT' ||
          results.questionType === 'TRUE_FALSE') && (
          <OptionBars question={question} results={results} hideResults={hideResults} showNames={showNames} />
        )}
        {results.questionType === 'ORDERING' && <OrderingView results={results} showNames={showNames} />}
        {results.questionType === 'TYPE_ANSWER' && <TextAnswerView results={results} showNames={showNames} />}
        {results.questionType === 'OPEN_ENDED' && (
          <OpenEndedView results={results} onHide={onHide} />
        )}
        {results.questionType === 'SLIDER' && <SliderView results={results} />}
        {results.questionType === 'RATING' && <RatingView results={results} showNames={showNames} />}
        {results.questionType === 'WRITE_IN' && (
          <WriteInView results={results} onMerge={onMerge} onUndoMerge={onUndoMerge} onHideGroup={onHideGroup} />
        )}
      </div>
      <Footer results={results} hideResults={hideResults} />
    </div>
  );
}

function WinnerBadge({ tie }: { tie?: boolean }) {
  return (
    <span
      data-testid="winner-badge"
      className="inline-flex items-center gap-1 rounded-full bg-shape-yellow px-2 py-0.5 text-sm font-bold text-ink shadow"
    >
      👑 {tie ? 'Tie' : 'Top answer'}
    </span>
  );
}

function OptionBars({
  question,
  results,
  hideResults,
  showNames,
}: {
  question: PublicQuestion;
  results: QuestionResults;
  hideResults: boolean;
  showNames: boolean;
}) {
  const correct = new Set(results.correctOptionIds);
  const isQuiz = results.mode === 'QUIZ';
  const maxCount = Math.max(1, ...results.tallies.map((t) => t.count));
  const votersByOption = new Map((results.voters ?? []).map((v) => [v.optionId, v.voters]));
  const winnerKeys = new Set(results.winners?.keys ?? []);
  return (
    <>
      {question.options.map((opt) => {
        const tally = results.tallies.find((t) => t.optionId === opt.id);
        const count = tally?.count ?? 0;
        const percent = tally?.percent ?? 0;
        const isCorrect = correct.has(opt.id);
        const dim = isQuiz && !isCorrect;
        return (
          <div
            key={opt.id}
            data-testid="reveal-option"
            data-correct={isQuiz && isCorrect ? 'true' : 'false'}
            data-winner={!hideResults && winnerKeys.has(opt.id) ? 'true' : 'false'}
            data-count={count}
            className={`rounded-xl transition ${!hideResults && winnerKeys.has(opt.id) ? 'bg-shape-yellow/10 p-2 ring-2 ring-shape-yellow/50' : ''}`}
            style={{ opacity: dim ? 0.5 : 1 }}
          >
            <div className="flex items-center gap-4">
              <span
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-white shadow"
                style={{ backgroundColor: shapeColor(opt.index) }}
              >
                <Shape index={opt.index} className="h-7 w-7 text-white" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2 text-white">
                  <span className="truncate text-xl font-semibold">{opt.text}</span>
                  {isQuiz && isCorrect && (
                    <span data-testid="reveal-correct" className="rounded-full bg-shape-green px-2 py-0.5 text-sm font-bold">
                      ✓ Correct
                    </span>
                  )}
                  {!hideResults && winnerKeys.has(opt.id) && <WinnerBadge tie={results.winners?.tie} />}
                </div>
                <div className="h-12 overflow-hidden rounded-xl bg-white/10">
                  <motion.div
                    className="flex h-full items-center justify-end rounded-xl pr-3 text-lg font-bold text-white"
                    style={{ backgroundColor: shapeColor(opt.index) }}
                    initial={{ width: 0 }}
                    animate={{ width: hideResults ? 0 : `${Math.max((count / maxCount) * 100, count > 0 ? 8 : 0)}%` }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                  >
                    {!hideResults && count > 0 && count}
                  </motion.div>
                </div>
              </div>
              <span className="w-24 shrink-0 text-right text-2xl font-black text-white">
                {hideResults ? '—' : `${percent}%`}
              </span>
            </div>
            {showNames && (
              <div className="pl-[4.5rem] pr-24">
                <VoterNames voters={votersByOption.get(opt.id) ?? []} />
              </div>
            )}
          </div>
        );
      })}
      {showNames && results.noAnswer && results.noAnswer.length > 0 && (
        <div data-testid="reveal-no-answer" className="pl-[4.5rem] pr-24 text-white/50">
          <span className="text-sm font-semibold uppercase tracking-wide">No answer</span>
          <VoterNames voters={results.noAnswer} />
        </div>
      )}
    </>
  );
}

function OrderingView({ results, showNames }: { results: QuestionResults; showNames: boolean }) {
  const order = results.ordering?.correctOrder ?? [];
  return (
    <div>
      <p className="mb-3 text-center text-lg font-semibold text-white/70">Correct order</p>
      <ol className="mx-auto grid max-w-xl gap-2">
        {order.map((o, i) => (
          <li key={o.optionId} className="flex items-center gap-3 rounded-xl bg-shape-green/20 px-4 py-3 text-white">
            <span className="font-black text-shape-green">{i + 1}</span>
            <span className="font-semibold">{o.text}</span>
          </li>
        ))}
      </ol>
      {showNames && results.voterGroups && <VoterGroupList groups={results.voterGroups} />}
    </div>
  );
}

function TextAnswerView({ results, showNames }: { results: QuestionResults; showNames: boolean }) {
  const rows = results.textAnswers ?? [];
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="grid gap-3">
      {rows.map((r) => (
        <div key={r.normalized} className="flex items-center gap-3">
          <span className={`w-40 shrink-0 truncate text-right font-semibold ${r.correct ? 'text-shape-green' : 'text-white/80'}`}>
            {r.display}
            {r.correct && ' ✓'}
          </span>
          <div className="h-9 flex-1 overflow-hidden rounded-lg bg-white/10">
            <div
              className={`h-full rounded-lg ${r.correct ? 'bg-shape-green' : 'bg-white/30'}`}
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </div>
          <span className="w-10 text-right font-black text-white">{r.count}</span>
        </div>
      ))}
      {rows.length === 0 && <p className="text-center text-white/40">No answers yet.</p>}
      {showNames && results.voterGroups && <VoterGroupList groups={results.voterGroups} />}
    </div>
  );
}

function OpenEndedView({
  results,
  onHide,
}: {
  results: QuestionResults;
  onHide: (playerId: string, hidden: boolean) => void;
}) {
  const oe = results.openEnded;
  if (!oe) return null;
  if (oe.style === 'WORD_CLOUD') {
    const words = oe.words ?? [];
    const max = Math.max(1, ...words.map((w) => w.count));
    const winnerKeys = new Set(results.winners?.keys ?? []);
    return (
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 p-4">
        {words.map((w) => {
          const win = winnerKeys.has(w.word);
          return (
            <span
              key={w.word}
              data-testid="cloud-word"
              data-winner={win ? 'true' : 'false'}
              className={`font-display font-black ${win ? 'text-shape-yellow' : 'text-white'}`}
              style={{ fontSize: `${1 + (w.count / max) * 2.5}rem`, opacity: win ? 1 : 0.55 + (w.count / max) * 0.45 }}
            >
              {win && <span className="mr-1 text-2xl align-middle">👑</span>}
              {w.word}
            </span>
          );
        })}
        {words.length === 0 && <p className="text-white/40">No responses yet.</p>}
      </div>
    );
  }
  const cards = oe.cards ?? [];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {cards.map((c) => (
        <div key={c.id} data-testid="answer-card" className="group relative rounded-2xl bg-white/10 p-4 text-white">
          <p className="pr-8">{c.text}</p>
          {c.nickname && c.avatarEmoji && c.color && (
            <div className="mt-2">
              <NameTag nickname={c.nickname} avatarEmoji={c.avatarEmoji} color={c.color} size="sm" />
            </div>
          )}
          <button
            data-testid="hide-response"
            title="Hide this response"
            className="absolute right-2 top-2 rounded-lg bg-black/30 px-2 py-1 text-xs opacity-70 hover:opacity-100"
            onClick={() => onHide(c.id, true)}
          >
            Hide
          </button>
        </div>
      ))}
      {cards.length === 0 && <p className="text-center text-white/40">No responses yet.</p>}
    </div>
  );
}

function SliderView({ results }: { results: QuestionResults }) {
  const s = results.slider;
  if (!s) return null;
  const span = s.max - s.min || 1;
  const pos = (v: number) => `${((v - s.min) / span) * 100}%`;
  return (
    <div className="px-4">
      <div className="relative mx-auto mt-10 h-24 max-w-3xl">
        <div className="absolute left-0 right-0 top-12 h-1 rounded bg-white/20" />
        {s.values.map((v, i) => (
          <span
            key={i}
            data-testid="slider-dot"
            className="absolute top-10 h-5 w-5 -translate-x-1/2 rounded-full bg-shape-blue/70"
            style={{ left: pos(v) }}
          />
        ))}
        {s.correctValue !== null && (
          <div className="absolute top-4 -translate-x-1/2 text-center" style={{ left: pos(s.correctValue) }}>
            <span className="rounded bg-shape-green px-2 py-0.5 text-sm font-bold text-white">
              {s.correctValue}
              {s.unit ? ` ${s.unit}` : ''}
            </span>
            <div className="mx-auto h-8 w-0.5 bg-shape-green" />
          </div>
        )}
        <div className="absolute -bottom-2 left-0 text-sm text-white/50">{s.min}</div>
        <div className="absolute -bottom-2 right-0 text-sm text-white/50">{s.max}</div>
      </div>
      <p className="mt-6 text-center text-xl text-white/80">
        Average <span className="font-black text-white">{s.average}</span>
        {s.unit ? ` ${s.unit}` : ''} · median <span className="font-black text-white">{s.median}</span>
      </p>
    </div>
  );
}

function RatingView({ results, showNames }: { results: QuestionResults; showNames: boolean }) {
  const r = results.rating;
  if (!r) return null;
  const max = Math.max(1, ...r.counts.map((c) => c.count));
  const winnerKeys = new Set(results.winners?.keys ?? []);
  return (
    <div>
      <div className="flex items-end justify-center gap-3" style={{ height: '14rem' }}>
        {r.counts.map((c) => {
          const win = winnerKeys.has(String(c.value));
          return (
            <div key={c.value} className="flex w-16 flex-col items-center justify-end">
              {win && <span className="mb-1 text-lg">👑</span>}
              <span className="mb-1 font-bold text-white">{c.count}</span>
              <div
                className={`w-full rounded-t-lg bg-shape-yellow ${win ? 'ring-2 ring-white/70' : ''}`}
                style={{ height: `${(c.count / max) * 100}%`, minHeight: c.count > 0 ? 8 : 0 }}
              />
              <span className="mt-2 font-black text-white/70">{c.value}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-6 text-center text-2xl text-white/80">
        Average <span className="font-black text-white">{r.average}</span> / {r.scale}
      </p>
      {showNames && results.voterGroups && <VoterGroupList groups={results.voterGroups} />}
    </div>
  );
}

function WriteInView({
  results,
  onMerge,
  onUndoMerge,
  onHideGroup,
}: {
  results: QuestionResults;
  onMerge: (sourceKey: string, targetKey: string) => void;
  onUndoMerge: (sourceKey: string) => void;
  onHideGroup: (key: string, hidden: boolean) => void;
}) {
  const [merged, setMerged] = useState<{ key: string; label: string }[]>([]);
  const [showOther, setShowOther] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const wi = results.writeIn;
  if (!wi) return null;
  const gated = wi.reviewBeforeReveal === true && !reviewed;
  const groups = wi.groups;
  const winnerKeys = new Set(results.winners?.keys ?? []);
  const max = Math.max(1, ...groups.map((g) => g.count));
  const top = groups.slice(0, 8);
  const other = groups.slice(8);
  const dups = wi.duplicates ?? [];

  const doMerge = (src: string, srcLabel: string, tgt: string) => {
    onMerge(src, tgt);
    setMerged((m) => (m.some((x) => x.key === src) ? m : [...m, { key: src, label: srcLabel }]));
  };
  const doUndo = (src: string) => {
    onUndoMerge(src);
    setMerged((m) => m.filter((x) => x.key !== src));
  };

  const Bar = (g: WriteInGroupResult) => (
    <div key={g.key} data-testid="write-in-group" data-count={g.count} data-key={g.key}>
      <div className="flex items-center gap-3">
        <span className="flex w-48 shrink-0 items-center justify-end gap-2 truncate text-right text-xl font-semibold text-white">
          {winnerKeys.has(g.key) && <WinnerBadge tie={results.winners?.tie} />}
          {g.label}
        </span>
        <div className="h-10 flex-1 overflow-hidden rounded-lg bg-white/10">
          <motion.div
            className="h-full rounded-lg bg-shape-blue"
            initial={{ width: 0 }}
            animate={{ width: `${(g.count / max) * 100}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
        <span className="w-24 text-right font-black text-white">
          {g.count} · {g.percent}%
        </span>
        <button
          data-testid="wi-hide"
          title="Hide this answer"
          className="rounded bg-black/30 px-2 py-1 text-xs text-white/70 hover:text-white"
          onClick={() => onHideGroup(g.key, true)}
        >
          Hide
        </button>
      </div>
      {g.voters && (
        <div className="pl-[12.5rem] pr-28">
          <VoterNames voters={g.voters} />
        </div>
      )}
    </div>
  );

  return (
    <div className="grid gap-3">
      {gated && (
        <div data-testid="wi-review-gate" className="flex items-center justify-between gap-3 rounded-xl bg-amber-400/20 p-3 text-white">
          <span className="font-semibold">Review the answers below (merge/hide as needed), then reveal to the room.</span>
          <button className="btn-primary px-4" onClick={() => setReviewed(true)}>
            Reveal to the room
          </button>
        </div>
      )}
      {dups.length > 0 && (
        <div data-testid="wi-duplicates" className="rounded-xl bg-amber-400/15 p-3">
          <span className="text-sm font-bold uppercase tracking-wide text-amber-300">Possible duplicates</span>
          {dups.map((d, i) => (
            <div key={i} className="mt-1 flex items-center gap-2 text-white">
              <span className="font-semibold">{d.labelA}</span>
              <span className="text-white/40">↔</span>
              <span className="font-semibold">{d.labelB}</span>
              <button
                data-testid="wi-merge"
                className="rounded bg-white/15 px-2 py-0.5 text-sm font-semibold hover:bg-white/25"
                onClick={() => doMerge(d.b, d.labelB, d.a)}
              >
                Merge
              </button>
            </div>
          ))}
        </div>
      )}
      {merged.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {merged.map((m) => (
            <button
              key={m.key}
              data-testid="wi-undo"
              className="rounded bg-white/10 px-2 py-0.5 text-sm text-white/70 hover:text-white"
              onClick={() => doUndo(m.key)}
            >
              Undo merge “{m.label}”
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-3 transition-opacity" style={{ opacity: gated ? 0.3 : 1 }}>
        {top.map(Bar)}
      </div>
      {other.length > 0 && (
        <div style={{ opacity: gated ? 0.3 : 1 }}>
          <button
            data-testid="wi-other-toggle"
            className="text-sm text-white/60 underline hover:text-white"
            onClick={() => setShowOther((v) => !v)}
          >
            {showOther ? 'Hide other answers' : `Show ${other.length} other answer${other.length === 1 ? '' : 's'}`}
          </button>
          {showOther && <div className="mt-2 grid gap-3">{other.map(Bar)}</div>}
        </div>
      )}
      {groups.length === 0 && <p className="text-center text-white/40">No answers yet.</p>}
    </div>
  );
}
