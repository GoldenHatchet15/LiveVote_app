import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AnswerResponse,
  AnswerValue,
  JoinResponse,
  PlayerQuestionSummary,
  PlayerResult,
  PlayerSnapshot,
  PublicQuestion,
} from '@livevote/shared';
import { createSocket, type LiveSocket } from '../lib/socket';

export type PlayPhase =
  | 'join'
  | 'lobby'
  | 'question'
  | 'answered'
  | 'reveal'
  | 'standings'
  | 'summary'
  | 'ended'
  | 'kicked';

export interface PlayState {
  phase: PlayPhase;
  connected: boolean;
  error: string | null;
  joinBusy: boolean;
  pin: string;
  nickname: string;
  avatarEmoji: string;
  color: string;
  playerId: string | null;
  question: PublicQuestion | null;
  serverNow: number | null;
  endsAt: number | null;
  selectedOptionId: string | null;
  result: PlayerResult | null;
  score: number;
  rank: number;
  totalPlayers: number;
  finalRank: number | null;
  summary: PlayerQuestionSummary[] | null;
  /** When true, show the "your name will be shown with your answer" notice. */
  showVoterNames: boolean;
}

const STORAGE_KEY = 'livevote.player';

interface StoredCreds {
  pin: string;
  nickname: string;
  token: string;
  playerId: string;
}

function loadCreds(): StoredCreds | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredCreds) : null;
  } catch {
    return null;
  }
}
function saveCreds(c: StoredCreds): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}
function clearCreds(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

const initial: PlayState = {
  phase: 'join',
  connected: false,
  error: null,
  joinBusy: false,
  pin: '',
  nickname: '',
  avatarEmoji: '',
  color: '',
  playerId: null,
  question: null,
  serverNow: null,
  endsAt: null,
  selectedOptionId: null,
  result: null,
  score: 0,
  rank: 0,
  totalPlayers: 0,
  finalRank: null,
  summary: null,
  showVoterNames: false,
};

export function usePlaySession(initialPin: string) {
  const [s, setS] = useState<PlayState>({ ...initial, pin: initialPin });
  const socketRef = useRef<LiveSocket | null>(null);
  const credsRef = useRef<StoredCreds | null>(loadCreds());
  const patch = useCallback(
    (p: Partial<PlayState>) => setS((prev) => ({ ...prev, ...p })),
    [],
  );

  const applySnapshot = useCallback(
    (snap: PlayerSnapshot) => {
      const phase: PlayPhase =
        snap.state === 'LOBBY'
          ? 'lobby'
          : snap.state === 'QUESTION'
            ? snap.hasAnswered
              ? 'answered'
              : 'question'
            : snap.state === 'REVEAL'
              ? 'reveal'
              : snap.state === 'LEADERBOARD'
                ? 'standings'
                : snap.state === 'SUMMARY'
                  ? 'summary'
                  : snap.state === 'ENDED'
                    ? 'ended'
                    : 'lobby';
      patch({
        phase,
        question: snap.question,
        serverNow: snap.serverNow,
        endsAt: snap.endsAt,
        selectedOptionId:
          snap.selectedValue && snap.selectedValue.kind === 'option'
            ? snap.selectedValue.optionId
            : null,
        result: snap.lastResult,
        score: snap.score,
        rank: snap.rank,
        totalPlayers: snap.totalPlayers,
        summary: snap.summary,
        showVoterNames: snap.showVoterNames,
        avatarEmoji: snap.avatarEmoji,
        color: snap.color,
      });
    },
    [patch],
  );

  const emitJoin = useCallback(
    (pin: string, nickname: string, token?: string, avatarEmoji?: string) => {
      const socket = socketRef.current;
      if (!socket) return;
      patch({ joinBusy: true });
      socket.emit('player:join', { pin, nickname, avatarEmoji, reconnectToken: token }, (res: JoinResponse) => {
        patch({ joinBusy: false });
        if (!res.ok) {
          if (res.code === 'PLAYER_KICKED') {
            clearCreds();
            credsRef.current = null;
            patch({ phase: 'kicked', error: res.message });
          } else {
            // A stale token just falls back to the join form.
            if (token) {
              clearCreds();
              credsRef.current = null;
            }
            patch({ error: res.message, phase: 'join' });
          }
          return;
        }
        const creds: StoredCreds = {
          pin,
          nickname: res.nickname,
          token: res.reconnectToken,
          playerId: res.playerId,
        };
        credsRef.current = creds;
        saveCreds(creds);
        patch({
          error: null,
          pin,
          nickname: res.nickname,
          avatarEmoji: res.avatarEmoji,
          color: res.color,
          playerId: res.playerId,
        });
        applySnapshot(res.snapshot);
      });
    },
    [applySnapshot, patch],
  );

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    socket.on('connect', () => {
      patch({ connected: true });
      // Auto-rejoin on (re)connect if we have stored credentials.
      const creds = credsRef.current;
      if (creds) emitJoin(creds.pin, creds.nickname, creds.token);
    });
    socket.on('disconnect', () => patch({ connected: false }));

    socket.on('question:start', (p) =>
      patch({
        phase: 'question',
        question: p.question,
        serverNow: p.serverNow,
        endsAt: p.endsAt,
        selectedOptionId: null,
        result: null,
        showVoterNames: p.question.showVoterNames,
      }),
    );
    socket.on('voterNames:update', (p) => patch({ showVoterNames: p.enabled }));
    socket.on('player:summary', (p) => patch({ summary: p.questions, phase: 'summary' }));
    socket.on('session:state', (p) => {
      if (p.state === 'LEADERBOARD') patch({ phase: 'standings' });
      if (p.state === 'SUMMARY') patch({ phase: 'summary' });
      if (p.state === 'LOBBY') patch({ phase: 'lobby' });
    });
    socket.on('player:result', (p) =>
      patch({
        phase: 'reveal',
        result: p.result,
        score: p.result.totalScore,
        rank: p.result.rank,
        totalPlayers: p.result.totalPlayers,
      }),
    );
    socket.on('session:ended', (p) => {
      const me = credsRef.current?.playerId;
      const mine = p.full.find((e) => e.playerId === me);
      patch({
        phase: 'ended',
        finalRank: mine?.rank ?? null,
        score: mine?.score ?? 0,
        totalPlayers: p.full.length,
      });
    });
    socket.on('player:kicked', (p) => {
      clearCreds();
      credsRef.current = null;
      patch({ phase: 'kicked', error: p.reason });
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [patch, emitJoin]);

  const join = useCallback(
    (pin: string, nickname: string, avatarEmoji: string) => {
      patch({ error: null, pin, nickname });
      emitJoin(pin, nickname, undefined, avatarEmoji);
    },
    [emitJoin, patch],
  );

  const answer = useCallback(
    (value: AnswerValue) => {
      const socket = socketRef.current;
      const q = s.question;
      if (!socket || !q) return;
      // Optimistic lock; the server confirms or rejects.
      patch({
        selectedOptionId: value.kind === 'option' ? value.optionId : null,
        phase: 'answered',
      });
      socket.emit('player:answer', { questionId: q.id, value }, (res: AnswerResponse) => {
        if (!res.ok) {
          // Roll back if the server rejected (e.g. too late).
          patch({ selectedOptionId: null, phase: 'question', error: res.message });
        }
      });
    },
    [patch, s.question],
  );

  const leave = useCallback(() => {
    clearCreds();
    credsRef.current = null;
    patch({ ...initial });
  }, [patch]);

  return { state: s, join, answer, leave };
}
