import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  HostAction,
  HostJoinResponse,
  LeaderboardEntry,
  PlayerSummary,
  PublicQuestion,
  QuestionResults,
  SessionState,
} from '@livevote/shared';
import { createSocket, type LiveSocket } from '../lib/socket';

export interface HostState {
  connected: boolean;
  error: string | null;
  sessionId: string;
  pin: string;
  title: string;
  state: SessionState;
  currentQuestionIndex: number;
  totalQuestions: number;
  question: PublicQuestion | null;
  serverNow: number | null;
  endsAt: number | null;
  players: PlayerSummary[];
  answered: number;
  totalForProgress: number;
  results: QuestionResults | null;
  leaderboard: LeaderboardEntry[];
  ended: { podium: LeaderboardEntry[]; full: LeaderboardEntry[] } | null;
  showVoterNames: boolean;
}

const initial = (sessionId: string): HostState => ({
  connected: false,
  error: null,
  sessionId,
  pin: '',
  title: '',
  state: 'LOBBY',
  currentQuestionIndex: 0,
  totalQuestions: 0,
  question: null,
  serverNow: null,
  endsAt: null,
  players: [],
  answered: 0,
  totalForProgress: 0,
  results: null,
  leaderboard: [],
  ended: null,
  showVoterNames: false,
});

export function useHostSession(sessionId: string) {
  const [s, setS] = useState<HostState>(() => initial(sessionId));
  const socketRef = useRef<LiveSocket | null>(null);
  const patch = useCallback(
    (p: Partial<HostState>) => setS((prev) => ({ ...prev, ...p })),
    [],
  );

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    const join = () => {
      socket.emit('host:join', { sessionId }, (res: HostJoinResponse) => {
        if (!res.ok) {
          patch({ error: res.message });
          return;
        }
        const snap = res.snapshot;
        patch({
          connected: true,
          error: null,
          pin: snap.pin,
          title: snap.title,
          state: snap.state,
          currentQuestionIndex: snap.currentQuestionIndex,
          totalQuestions: snap.totalQuestions,
          question: snap.currentQuestion
            ? {
                id: snap.currentQuestion.id,
                index: snap.currentQuestion.order,
                total: snap.totalQuestions,
                text: snap.currentQuestion.text,
                imageUrl: snap.currentQuestion.imageUrl,
                mode: snap.currentQuestion.mode,
                options: snap.currentQuestion.options,
                timeLimitSec: snap.currentQuestion.timeLimitSec,
                points: snap.currentQuestion.points,
                showVoterNames: snap.showVoterNames,
              }
            : null,
          serverNow: snap.serverNow,
          endsAt: snap.endsAt,
          players: snap.players,
          answered: snap.answeredCount,
          totalForProgress: snap.players.length,
          results: snap.results,
          leaderboard: snap.leaderboard,
          showVoterNames: snap.showVoterNames,
        });
      });
    };

    socket.on('connect', () => join());
    socket.on('disconnect', () => patch({ connected: false }));

    socket.on('session:state', (p) =>
      patch({
        state: p.state,
        currentQuestionIndex: p.currentQuestionIndex,
        totalQuestions: p.totalQuestions,
      }),
    );
    socket.on('lobby:update', (p) =>
      patch({ players: p.players, totalForProgress: p.players.length }),
    );
    socket.on('question:start', (p) =>
      patch({
        question: p.question,
        serverNow: p.serverNow,
        endsAt: p.endsAt,
        results: null,
        answered: 0,
      }),
    );
    socket.on('question:progress', (p) =>
      patch({ answered: p.answered, totalForProgress: p.total }),
    );
    socket.on('reveal', (p) => patch({ results: p.results }));
    socket.on('voterNames:update', (p) => patch({ showVoterNames: p.enabled }));
    socket.on('leaderboard', (p) => patch({ leaderboard: p.full }));
    socket.on('session:ended', (p) =>
      patch({ ended: { podium: p.podium, full: p.full }, leaderboard: p.full }),
    );

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [sessionId, patch]);

  const action = useCallback(
    (a: HostAction) => socketRef.current?.emit('host:action', { sessionId, action: a }, () => {}),
    [sessionId],
  );
  const kick = useCallback(
    (playerId: string) =>
      socketRef.current?.emit('host:kick', { sessionId, playerId }, () => {}),
    [sessionId],
  );
  const setVoterNames = useCallback(
    (enabled: boolean) =>
      socketRef.current?.emit('host:setVoterNames', { sessionId, enabled }, () => {}),
    [sessionId],
  );

  return { state: s, action, kick, setVoterNames };
}
