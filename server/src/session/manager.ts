import type { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  InterServerEvents,
  PointsValue,
  QuestionMode,
  ServerToClientEvents,
  SocketData,
  TimeLimitSec,
} from '@livevote/shared';
import { prisma } from '../db.js';
import { generatePin } from '../util/pin.js';
import { SessionEngine } from './engine.js';
import { realScheduler, type LoadedSet, type SessionEmitter } from './types.js';

type IO = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

interface Entry {
  engine: SessionEngine;
  set: LoadedSet;
}

const roomAll = (sid: string) => `session:${sid}`;
const roomHost = (sid: string) => `host:${sid}`;
const roomPlayer = (pid: string) => `player:${pid}`;

export class SessionManager {
  private entries = new Map<string, Entry>();
  private pinToSession = new Map<string, string>();
  private io: IO | null = null;

  attachIo(io: IO): void {
    this.io = io;
  }

  get(sessionId: string): SessionEngine | undefined {
    return this.entries.get(sessionId)?.engine;
  }

  getSet(sessionId: string): LoadedSet | undefined {
    return this.entries.get(sessionId)?.set;
  }

  bySessionId = (sid: string) => this.get(sid);

  bySocketRooms = roomAll;

  getBySessionId(sessionId: string): SessionEngine | undefined {
    return this.get(sessionId);
  }

  getByPin(pin: string): SessionEngine | undefined {
    const sid = this.pinToSession.get(pin);
    return sid ? this.get(sid) : undefined;
  }

  // ------------------------------------------------------------ loading

  async loadSet(questionSetId: string): Promise<LoadedSet | null> {
    const set = await prisma.questionSet.findUnique({
      where: { id: questionSetId },
      include: {
        questions: {
          orderBy: { order: 'asc' },
          include: { options: { orderBy: { index: 'asc' } } },
        },
      },
    });
    if (!set) return null;
    return {
      id: set.id,
      title: set.title,
      description: set.description,
      questions: set.questions.map((q) => ({
        id: q.id,
        text: q.text,
        imageUrl: q.imageUrl,
        mode: q.mode as QuestionMode,
        timeLimitSec: (q.timeLimitSec ?? null) as TimeLimitSec,
        points: q.points as PointsValue,
        order: q.order,
        options: q.options.map((o) => ({
          id: o.id,
          text: o.text,
          index: o.index,
          isCorrect: o.isCorrect,
        })),
      })),
    };
  }

  private uniquePin(): string {
    let pin = generatePin();
    let guard = 0;
    while (this.pinToSession.has(pin) && guard < 50) {
      pin = generatePin();
      guard += 1;
    }
    return pin;
  }

  private emitterFor(sessionId: string): SessionEmitter {
    const io = this.io;
    return {
      toAll: (event, ...args) => io?.to(roomAll(sessionId)).emit(event, ...args),
      toHost: (event, ...args) => io?.to(roomHost(sessionId)).emit(event, ...args),
      toPlayer: (playerId, event, ...args) =>
        io?.to(roomPlayer(playerId)).emit(event, ...args),
    };
  }

  // ------------------------------------------------------------ create

  async createSession(questionSetId: string): Promise<SessionEngine | null> {
    const set = await this.loadSet(questionSetId);
    if (!set) return null;

    const pin = this.uniquePin();
    const row = await prisma.session.create({
      data: { pin, questionSetId, state: 'LOBBY', currentQuestionIndex: 0 },
    });

    const engine = new SessionEngine({
      sessionId: row.id,
      pin,
      set,
      emitter: this.emitterFor(row.id),
      scheduler: realScheduler,
      hooks: this.hooksFor(row.id),
    });

    this.entries.set(row.id, { engine, set });
    this.pinToSession.set(pin, row.id);
    return engine;
  }

  private hooksFor(sessionId: string) {
    return {
      onStateChange: (meta: {
        state: string;
        currentQuestionIndex: number;
        questionStartedAt: number | null;
        endedAt: number | null;
      }) => {
        void prisma.session
          .update({
            where: { id: sessionId },
            data: {
              state: meta.state,
              currentQuestionIndex: meta.currentQuestionIndex,
              questionStartedAt: meta.questionStartedAt
                ? new Date(meta.questionStartedAt)
                : null,
              endedAt: meta.endedAt ? new Date(meta.endedAt) : null,
            },
          })
          .catch(() => {});
      },
      onAnswer: (e: {
        playerId: string;
        questionId: string;
        optionId: string;
        responseMs: number;
      }) => {
        void prisma.answer
          .upsert({
            where: {
              playerId_questionId: {
                playerId: e.playerId,
                questionId: e.questionId,
              },
            },
            create: {
              playerId: e.playerId,
              questionId: e.questionId,
              optionId: e.optionId,
              responseMs: e.responseMs,
              pointsAwarded: 0,
            },
            update: {},
          })
          .catch(() => {});
      },
      onReveal: (e: {
        perPlayer: Array<{
          playerId: string;
          optionId: string | null;
          responseMs: number;
          pointsAwarded: number;
          newScore: number;
          newStreak: number;
        }>;
        questionId: string;
      }) => {
        void prisma
          .$transaction(
            e.perPlayer.flatMap((p) => {
              const ops = [
                prisma.player.update({
                  where: { id: p.playerId },
                  data: { score: p.newScore, streak: p.newStreak },
                }),
              ];
              if (p.optionId) {
                ops.push(
                  prisma.answer.update({
                    where: {
                      playerId_questionId: {
                        playerId: p.playerId,
                        questionId: e.questionId,
                      },
                    },
                    data: { pointsAwarded: p.pointsAwarded },
                  }) as never,
                );
              }
              return ops;
            }),
          )
          .catch(() => {});
      },
    };
  }

  // ------------------------------------------------------------ players

  /** Create a persisted player and register it in the engine. */
  async createPlayer(
    engine: SessionEngine,
    nickname: string,
    reconnectToken: string,
  ): Promise<{ id: string }> {
    const row = await prisma.player.create({
      data: {
        sessionId: engine.sessionId,
        nickname,
        reconnectToken,
        connected: true,
      },
    });
    engine.addPlayer({ id: row.id, nickname, reconnectToken });
    return { id: row.id };
  }

  setConnected(engine: SessionEngine, playerId: string, connected: boolean): void {
    engine.setConnected(playerId, connected);
    void prisma.player
      .update({ where: { id: playerId }, data: { connected } })
      .catch(() => {});
  }

  kick(engine: SessionEngine, playerId: string): void {
    engine.kick(playerId);
    void prisma.player
      .update({ where: { id: playerId }, data: { kicked: true, connected: false } })
      .catch(() => {});
  }

  rooms = { all: roomAll, host: roomHost, player: roomPlayer };

  /** Remove ended sessions from memory to avoid unbounded growth. */
  dispose(sessionId: string): void {
    const entry = this.entries.get(sessionId);
    if (!entry) return;
    this.pinToSession.delete(entry.engine.pin);
    this.entries.delete(sessionId);
  }
}

export const sessionManager = new SessionManager();
