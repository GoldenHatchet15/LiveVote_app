import type { ServerToClientEvents } from '@livevote/shared';
import type { LoadedSet, Scheduler, SessionEmitter } from '../src/session/types.js';

/** A scheduler whose clock and timers are driven manually in tests. */
export class FakeScheduler implements Scheduler {
  current = 0;
  private timers: Array<{ at: number; cb: () => void; handle: object }> = [];

  now(): number {
    return this.current;
  }
  setTimer(ms: number, cb: () => void): object {
    const handle = {};
    this.timers.push({ at: this.current + ms, cb, handle });
    return handle;
  }
  clearTimer(handle: unknown): void {
    this.timers = this.timers.filter((t) => t.handle !== handle);
  }
  /** Advance the clock, firing any timers whose deadline passed. */
  advance(ms: number): void {
    this.current += ms;
    const due = this.timers
      .filter((t) => t.at <= this.current)
      .sort((a, b) => a.at - b.at);
    this.timers = this.timers.filter((t) => t.at > this.current);
    for (const t of due) t.cb();
  }
}

export interface CapturedEvent {
  scope: 'all' | 'host' | 'player';
  playerId?: string;
  event: keyof ServerToClientEvents;
  payload: unknown;
}

export class CapturingEmitter implements SessionEmitter {
  events: CapturedEvent[] = [];
  toAll(event: keyof ServerToClientEvents, payload: unknown): void {
    this.events.push({ scope: 'all', event, payload });
  }
  toHost(event: keyof ServerToClientEvents, payload: unknown): void {
    this.events.push({ scope: 'host', event, payload });
  }
  toPlayer(
    playerId: string,
    event: keyof ServerToClientEvents,
    payload: unknown,
  ): void {
    this.events.push({ scope: 'player', playerId, event, payload });
  }
  find(event: keyof ServerToClientEvents): CapturedEvent[] {
    return this.events.filter((e) => e.event === event);
  }
  clear(): void {
    this.events = [];
  }
}

/** Build a small mixed/quiz set for engine tests. */
export function makeQuizSet(): LoadedSet {
  return {
    id: 'set1',
    title: 'Test Quiz',
    description: null,
    showVoterNames: false,
    showResultsSummary: true,
    questions: [
      {
        id: 'q1',
        text: 'Capital of France?',
        imageUrl: null,
        mode: 'QUIZ',
        type: 'MULTIPLE_CHOICE',
        config: {},
        timeLimitSec: 20,
        points: 'STANDARD',
        order: 0,
        options: [
          { id: 'q1a', text: 'Paris', index: 0, isCorrect: true },
          { id: 'q1b', text: 'Lyon', index: 1, isCorrect: false },
          { id: 'q1c', text: 'Nice', index: 2, isCorrect: false },
        ],
      },
      {
        id: 'q2',
        text: '2 + 2?',
        imageUrl: null,
        mode: 'QUIZ',
        type: 'MULTIPLE_CHOICE',
        config: {},
        timeLimitSec: 20,
        points: 'DOUBLE',
        order: 1,
        options: [
          { id: 'q2a', text: '4', index: 0, isCorrect: true },
          { id: 'q2b', text: '5', index: 1, isCorrect: false },
        ],
      },
    ],
  };
}

export function makePollSet(): LoadedSet {
  return {
    id: 'poll1',
    title: 'Test Poll',
    description: null,
    showVoterNames: false,
    showResultsSummary: true,
    questions: [
      {
        id: 'p1',
        text: 'Cats or dogs?',
        imageUrl: null,
        mode: 'POLL',
        type: 'MULTIPLE_CHOICE',
        config: {},
        timeLimitSec: 20,
        points: 'NONE',
        order: 0,
        options: [
          { id: 'p1a', text: 'Cats', index: 0, isCorrect: false },
          { id: 'p1b', text: 'Dogs', index: 1, isCorrect: false },
        ],
      },
    ],
  };
}
