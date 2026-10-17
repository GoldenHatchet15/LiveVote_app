import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { NICKNAME_MAX, PIN_LENGTH, type PublicQuestion } from '@livevote/shared';
import { Shape, shapeColor } from '../components/Shape';
import { QuestionInput } from './QuestionInput';
import { usePlaySession, type PlayState } from './usePlaySession';

export function PlayApp() {
  const [params] = useSearchParams();
  const initialPin = (params.get('pin') ?? '').replace(/\D/g, '').slice(0, PIN_LENGTH);
  const { state, join, answer, leave } = usePlaySession(initialPin);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
      {!state.connected && state.phase !== 'join' && (
        <div className="bg-black/80 py-1 text-center text-sm text-white">
          Connection lost — reconnecting…
        </div>
      )}
      {state.showVoterNames &&
        (state.phase === 'lobby' || state.phase === 'question' || state.phase === 'answered') && (
          <div
            data-testid="voter-names-notice"
            className="bg-amber-400 px-3 py-1 text-center text-sm font-semibold text-ink"
          >
            Your name will be shown with your answer.
          </div>
        )}
      {state.phase === 'join' && (
        <JoinScreen initialPin={initialPin} state={state} onJoin={join} />
      )}
      {state.phase === 'lobby' && <Centered title="You’re in! 🎉" subtitle={`${state.nickname} · look at the screen`} />}
      {state.phase === 'question' && state.question && (
        <QuestionInput question={state.question} onAnswer={answer} />
      )}
      {state.phase === 'answered' && state.question && (
        <AnsweredScreen question={state.question} selectedOptionId={state.selectedOptionId} />
      )}
      {state.phase === 'reveal' && <RevealScreen state={state} />}
      {state.phase === 'standings' && (
        <Centered
          title={`You’re #${state.rank}`}
          subtitle={`${state.score} points · look at the screen`}
        />
      )}
      {state.phase === 'ended' && <EndedScreen state={state} onLeave={leave} />}
      {state.phase === 'kicked' && (
        <Centered title="Removed from game" subtitle={state.error ?? ''} tone="bad">
          <button className="btn-ghost mt-6" onClick={leave}>
            Back to start
          </button>
        </Centered>
      )}
    </div>
  );
}

function Centered({
  title,
  subtitle,
  tone,
  children,
}: {
  title: string;
  subtitle?: string;
  tone?: 'good' | 'bad';
  children?: React.ReactNode;
}) {
  const bg =
    tone === 'bad' ? 'bg-ink' : tone === 'good' ? 'bg-brand' : 'bg-brand';
  return (
    <div className={`flex flex-1 flex-col items-center justify-center p-6 text-center text-white ${bg}`}>
      <h1 className="font-display text-4xl font-extrabold">{title}</h1>
      {subtitle && <p className="mt-2 text-lg text-white/80">{subtitle}</p>}
      {children}
    </div>
  );
}

function JoinScreen({
  initialPin,
  state,
  onJoin,
}: {
  initialPin: string;
  state: PlayState;
  onJoin: (pin: string, nickname: string) => void;
}) {
  const [pin, setPin] = useState(initialPin);
  const [nickname, setNickname] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    onJoin(pin, nickname);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <div className="mb-2 flex justify-center gap-1">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} style={{ color: shapeColor(i) }}>
              <Shape index={i} className="h-7 w-7" />
            </span>
          ))}
        </div>
        <h1 className="font-display text-5xl font-extrabold text-brand">LiveVote</h1>
      </div>
      <form onSubmit={submit} className="card w-full">
        <label className="label" htmlFor="pin">
          Game PIN
        </label>
        <input
          id="pin"
          inputMode="numeric"
          autoComplete="off"
          className="input mb-3 text-center text-3xl tracking-[0.3em]"
          placeholder="000000"
          value={pin}
          maxLength={PIN_LENGTH}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
        />
        <label className="label" htmlFor="nick">
          Nickname
        </label>
        <input
          id="nick"
          className="input text-center text-xl"
          placeholder="Your name"
          value={nickname}
          maxLength={NICKNAME_MAX}
          onChange={(e) => setNickname(e.target.value)}
        />
        {state.error && <p className="mt-3 text-center text-sm font-semibold text-brand">{state.error}</p>}
        <button
          className="btn-primary mt-5 w-full py-4 text-xl"
          disabled={state.joinBusy || pin.length !== PIN_LENGTH || nickname.trim().length < 2}
        >
          {state.joinBusy ? 'Joining…' : 'Enter'}
        </button>
      </form>
    </div>
  );
}

function AnsweredScreen({
  question,
  selectedOptionId,
}: {
  question: PublicQuestion;
  selectedOptionId: string | null;
}) {
  const selected = question.options.find((o) => o.id === selectedOptionId);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 bg-ink p-6 text-center text-white">
      {selected && (
        <span
          className="flex h-24 w-24 items-center justify-center rounded-2xl"
          style={{ backgroundColor: shapeColor(selected.index) }}
        >
          <Shape index={selected.index} className="h-12 w-12 text-white" />
        </span>
      )}
      <h1 className="font-display text-3xl font-extrabold">Answer locked in</h1>
      <p className="text-white/70">Hang tight — look at the screen.</p>
    </div>
  );
}

function RevealScreen({ state }: { state: PlayState }) {
  const r = state.result;
  if (!r) return <Centered title="Vote received" subtitle="Look at the screen" />;

  if (r.mode === 'POLL') {
    return <Centered title="Vote received ✓" subtitle="Look at the screen" tone="good" />;
  }

  const good = r.correct === true;
  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-white ${
        good ? 'bg-shape-green' : 'bg-ink'
      }`}
    >
      <h1 data-testid="result-heading" className="font-display text-5xl font-extrabold">
        {good ? 'Correct!' : r.answered ? 'Incorrect' : 'No answer'}
      </h1>
      {good && <p className="text-3xl font-black">+{r.pointsAwarded}</p>}
      <div className="mt-2 flex gap-3">
        <Badge label="Score" value={r.totalScore} />
        <Badge label="Rank" value={`#${r.rank}`} />
        {r.streak > 1 && good && <Badge label="Streak" value={`🔥${r.streak}`} />}
      </div>
    </div>
  );
}

function Badge({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-white/15 px-4 py-2">
      <div className="text-xs uppercase tracking-wide text-white/60">{label}</div>
      <div className="font-display text-2xl font-black">{value}</div>
    </div>
  );
}

function EndedScreen({ state, onLeave }: { state: PlayState; onLeave: () => void }) {
  return (
    <div
      data-testid="player-ended"
      className="flex flex-1 flex-col items-center justify-center gap-4 bg-brand p-6 text-center text-white"
    >
      <h1 className="font-display text-4xl font-extrabold">Game over!</h1>
      {state.finalRank ? (
        <>
          <p className="text-2xl">
            You finished <span className="font-black">#{state.finalRank}</span>
            {state.totalPlayers ? ` of ${state.totalPlayers}` : ''}
          </p>
          <p className="font-display text-5xl font-black">{state.score}</p>
          <p className="text-white/70">points</p>
        </>
      ) : (
        <p className="text-xl text-white/80">Thanks for playing!</p>
      )}
      <button className="btn-ghost mt-6" onClick={onLeave}>
        Done
      </button>
    </div>
  );
}
