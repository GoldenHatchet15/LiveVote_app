import { useState } from 'react';
import type { HostAction, PlayerSummary, SessionState } from '@livevote/shared';

function primaryFor(state: SessionState): { label: string; action: HostAction } | null {
  switch (state) {
    case 'LOBBY':
      return { label: '▶ Start', action: 'START' };
    case 'QUESTION':
      return { label: 'Skip ⏭', action: 'SKIP' };
    case 'REVEAL':
    case 'LEADERBOARD':
      return { label: 'Next ⏭', action: 'NEXT' };
    case 'SUMMARY':
      return { label: 'Finish ⏭', action: 'NEXT' };
    default:
      return null;
  }
}

export function Controls({
  state,
  players,
  muted,
  hideResults,
  showVoterNames,
  showResultsSummary,
  onAction,
  onKick,
  onToggleMute,
  onToggleHide,
  onToggleVoterNames,
  onToggleSummary,
  csvUrl,
}: {
  state: SessionState;
  players: PlayerSummary[];
  muted: boolean;
  hideResults: boolean;
  showVoterNames: boolean;
  showResultsSummary: boolean;
  onAction: (a: HostAction) => void;
  onKick: (playerId: string) => void;
  onToggleMute: () => void;
  onToggleHide: () => void;
  onToggleVoterNames: () => void;
  onToggleSummary: () => void;
  csvUrl: string;
}) {
  const [showPlayers, setShowPlayers] = useState(false);
  const primary = primaryFor(state);

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-2 bg-black/40 px-4 py-2 text-white backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20"
            onClick={() => setShowPlayers((v) => !v)}
            title="Players"
          >
            👥 {players.length}
          </button>
          <button
            className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20"
            onClick={onToggleMute}
            title="Mute (M)"
          >
            {muted ? '🔇' : '🔊'}
          </button>
          {state === 'REVEAL' && (
            <button
              className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20"
              onClick={onToggleHide}
              title="Show/hide results (R)"
            >
              {hideResults ? 'Show results' : 'Hide results'}
            </button>
          )}
          {state !== 'ENDED' && (
            <button
              data-testid="toggle-voter-names"
              aria-pressed={showVoterNames}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                showVoterNames ? 'bg-brand text-white hover:bg-brand-700' : 'bg-white/10 hover:bg-white/20'
              }`}
              onClick={onToggleVoterNames}
              title="Show voter names on results (N)"
            >
              Names: {showVoterNames ? 'On' : 'Off'}
            </button>
          )}
          {state !== 'ENDED' && state !== 'SUMMARY' && (
            <button
              data-testid="toggle-summary"
              aria-pressed={showResultsSummary}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                showResultsSummary ? 'bg-brand text-white hover:bg-brand-700' : 'bg-white/10 hover:bg-white/20'
              }`}
              onClick={onToggleSummary}
              title="Show the results summary at the end of the session"
            >
              Summary: {showResultsSummary ? 'On' : 'Off'}
            </button>
          )}
          <a
            className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20"
            href={csvUrl}
            title="Download results CSV"
          >
            ⬇ CSV
          </a>
        </div>

        <div className="flex items-center gap-2">
          {state !== 'ENDED' && (
            <button
              className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20"
              onClick={() => {
                if (confirm('End the session for everyone?')) onAction('END');
              }}
              title="End session (E)"
            >
              End
            </button>
          )}
          {primary && (
            <button
              data-testid="host-primary"
              className="rounded-lg bg-brand px-6 py-2 font-display text-lg font-bold hover:bg-brand-700"
              onClick={() => onAction(primary.action)}
            >
              {primary.label}
            </button>
          )}
        </div>
      </div>

      {showPlayers && (
        <div className="fixed bottom-16 left-4 z-40 max-h-[60vh] w-72 overflow-auto rounded-2xl bg-white p-3 text-ink shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-bold">Players ({players.length})</span>
            <button className="text-ink/50" onClick={() => setShowPlayers(false)}>
              ✕
            </button>
          </div>
          {players.length === 0 && <p className="text-sm text-ink/50">No players yet.</p>}
          <ul className="grid gap-1">
            {players.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-black/5">
                <span className="flex items-center gap-2 truncate">
                  <span className={`h-2 w-2 rounded-full ${p.connected ? 'bg-shape-green' : 'bg-black/20'}`} />
                  {p.nickname}
                </span>
                <button
                  className="text-sm font-semibold text-brand hover:underline"
                  onClick={() => onKick(p.id)}
                >
                  Kick
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
