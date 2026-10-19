import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { HostAction } from '@livevote/shared';
import { api } from '../lib/api';
import { sound } from '../lib/sound';
import { useHostSession } from './useHostSession';
import { Controls } from './Controls';
import { Lobby } from './screens/Lobby';
import { Question } from './screens/Question';
import { Reveal } from './screens/Reveal';
import { Leaderboard } from './screens/Leaderboard';
import { Ended } from './screens/Ended';

export function HostApp() {
  const { sessionId } = useParams();
  const { state, action, kick, setVoterNames, hideResponse, mergeWriteIn, undoMergeWriteIn, hideWriteInGroup } =
    useHostSession(sessionId ?? '');
  const [baseUrl, setBaseUrl] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.origin : '',
  );
  const [muted, setMuted] = useState(true);
  const [hideResults, setHideResults] = useState(false);

  useEffect(() => {
    api.config().then((c) => setBaseUrl(c.publicBaseUrl)).catch(() => {});
  }, []);

  // Reset the results-hidden toggle whenever a new question is revealed.
  useEffect(() => {
    setHideResults(false);
  }, [state.results?.questionId]);

  const joinUrl = useMemo(() => baseUrl.replace(/^https?:\/\//, ''), [baseUrl]) + '/play';
  const qrUrl = `${baseUrl}/play?pin=${state.pin}`;
  const csvUrl = api.csvUrl(state.sessionId);

  // Keyboard shortcuts.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
        return;
      const advance: Record<string, HostAction | undefined> = {
        LOBBY: 'START',
        QUESTION: 'SKIP',
        REVEAL: 'NEXT',
        LEADERBOARD: 'NEXT',
      };
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
        const a = advance[state.state];
        if (a) {
          e.preventDefault();
          action(a);
        }
      } else if (e.key.toLowerCase() === 's' && state.state === 'QUESTION') {
        action('SKIP');
      } else if (e.key.toLowerCase() === 'e' && state.state !== 'ENDED') {
        if (confirm('End the session for everyone?')) action('END');
      } else if (e.key.toLowerCase() === 'm') {
        toggleMute();
      } else if (e.key.toLowerCase() === 'r' && state.state === 'REVEAL') {
        setHideResults((v) => !v);
      } else if (e.key.toLowerCase() === 'n' && state.state !== 'ENDED') {
        setVoterNames(!state.showVoterNames);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.state, state.showVoterNames, action, setVoterNames]);

  function toggleMute() {
    setMuted((m) => {
      const next = !m;
      sound.setMuted(next);
      return next;
    });
  }

  if (state.error) {
    return (
      <div className="host-screen flex min-h-screen flex-col items-center justify-center gap-3 text-center">
        <h1 className="font-display text-4xl font-bold">Can’t open this session</h1>
        <p className="text-white/60">{state.error}</p>
        <a className="btn-ghost mt-4" href="/admin">
          Back to admin
        </a>
      </div>
    );
  }

  return (
    <div className="host-screen relative">
      {!state.connected && (
        <div className="fixed left-1/2 top-3 z-50 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1 text-sm text-white">
          Reconnecting…
        </div>
      )}

      {state.state === 'LOBBY' && (
        <Lobby
          pin={state.pin}
          joinUrl={joinUrl}
          qrUrl={qrUrl}
          title={state.title}
          players={state.players}
          showVoterNames={state.showVoterNames}
          onToggleVoterNames={() => setVoterNames(!state.showVoterNames)}
        />
      )}
      {state.state === 'QUESTION' && state.question && (
        <Question
          question={state.question}
          serverNow={state.serverNow}
          endsAt={state.endsAt}
          answered={state.answered}
          total={state.totalForProgress}
        />
      )}
      {state.state === 'REVEAL' && state.question && state.results && (
        <Reveal
          question={state.question}
          results={state.results}
          hideResults={hideResults}
          onHide={hideResponse}
          onMerge={mergeWriteIn}
          onUndoMerge={undoMergeWriteIn}
          onHideGroup={hideWriteInGroup}
        />
      )}
      {state.state === 'LEADERBOARD' && <Leaderboard entries={state.leaderboard} />}
      {state.state === 'ENDED' && state.ended && (
        <Ended podium={state.ended.podium} full={state.ended.full} csvUrl={csvUrl} />
      )}

      <Controls
        state={state.state}
        players={state.players}
        muted={muted}
        hideResults={hideResults}
        showVoterNames={state.showVoterNames}
        onAction={action}
        onKick={kick}
        onToggleMute={toggleMute}
        onToggleHide={() => setHideResults((v) => !v)}
        onToggleVoterNames={() => setVoterNames(!state.showVoterNames)}
        csvUrl={csvUrl}
      />
    </div>
  );
}
