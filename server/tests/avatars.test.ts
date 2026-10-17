import { describe, expect, it } from 'vitest';
import {
  AVATAR_EMOJIS,
  PLAYER_COLORS,
  contrastRatio,
  isValidAvatar,
  textOn,
} from '@livevote/shared';
import { SessionEngine } from '../src/session/engine.js';
import { CapturingEmitter, FakeScheduler, makeQuizSet } from './helpers.js';

function engine() {
  return new SessionEngine({
    sessionId: 's',
    pin: '000000',
    set: makeQuizSet(),
    emitter: new CapturingEmitter(),
    scheduler: new FakeScheduler(),
  });
}

describe('curated emoji list', () => {
  it('has 30 unique emojis', () => {
    expect(AVATAR_EMOJIS).toHaveLength(30);
    expect(new Set(AVATAR_EMOJIS).size).toBe(30);
  });
  it('accepts only curated emojis (validate server-side)', () => {
    expect(isValidAvatar(AVATAR_EMOJIS[0]!)).toBe(true);
    expect(isValidAvatar('🤬')).toBe(false);
    expect(isValidAvatar('not-an-emoji')).toBe(false);
  });
});

describe('colour palette contrast (WCAG AA)', () => {
  it('has 16 distinct colours', () => {
    expect(PLAYER_COLORS).toHaveLength(16);
    expect(new Set(PLAYER_COLORS).size).toBe(16);
  });
  it('every colour clears AA (4.5:1) with its chosen text colour', () => {
    for (const c of PLAYER_COLORS) {
      expect(contrastRatio(c, textOn(c))).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('contrastRatio is correct at the extremes', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 5);
  });
});

describe('colour assignment is round-robin', () => {
  it('cycles through the palette in order and wraps', () => {
    const e = engine();
    const assigned = Array.from({ length: PLAYER_COLORS.length + 1 }, () => e.assignColor());
    expect(assigned.slice(0, PLAYER_COLORS.length)).toEqual(PLAYER_COLORS);
    expect(assigned[PLAYER_COLORS.length]).toBe(PLAYER_COLORS[0]); // wraps
  });
});

describe('avatar resolution + uniqueness', () => {
  it('keeps a requested free avatar', () => {
    const e = engine();
    expect(e.resolveAvatar(AVATAR_EMOJIS[3])).toBe(AVATAR_EMOJIS[3]);
  });

  it('gives a different unused avatar when the requested one is taken', () => {
    const e = engine();
    e.addPlayer({ id: 'p0', nickname: 'A', reconnectToken: 't0', avatarEmoji: AVATAR_EMOJIS[0] });
    const got = e.resolveAvatar(AVATAR_EMOJIS[0]);
    expect(got).not.toBe(AVATAR_EMOJIS[0]);
    expect(isValidAvatar(got)).toBe(true);
  });

  it('a random pick (no request) returns an unused curated emoji', () => {
    const e = engine();
    e.addPlayer({ id: 'p0', nickname: 'A', reconnectToken: 't0', avatarEmoji: AVATAR_EMOJIS[0] });
    const got = e.resolveAvatar();
    expect(isValidAvatar(got)).toBe(true);
    expect(got).not.toBe(AVATAR_EMOJIS[0]);
  });

  it('allows duplicates once all avatars are taken', () => {
    const e = engine();
    AVATAR_EMOJIS.forEach((emoji, i) =>
      e.addPlayer({ id: `p${i}`, nickname: `P${i}`, reconnectToken: `t${i}`, avatarEmoji: emoji }),
    );
    // All 30 taken -> requesting one returns it (duplicate allowed).
    expect(e.resolveAvatar(AVATAR_EMOJIS[5])).toBe(AVATAR_EMOJIS[5]);
  });

  it('frees a kicked player’s avatar for reuse', () => {
    const e = engine();
    e.addPlayer({ id: 'p0', nickname: 'A', reconnectToken: 't0', avatarEmoji: AVATAR_EMOJIS[0] });
    expect(e.resolveAvatar(AVATAR_EMOJIS[0])).not.toBe(AVATAR_EMOJIS[0]); // taken
    e.kick('p0');
    expect(e.resolveAvatar(AVATAR_EMOJIS[0])).toBe(AVATAR_EMOJIS[0]); // freed
  });
});

describe('reconnect keeps the same avatar + colour', () => {
  it('re-adding the same id does not change avatar/colour', () => {
    const e = engine();
    const p = e.addPlayer({ id: 'p0', nickname: 'A', reconnectToken: 't0', avatarEmoji: AVATAR_EMOJIS[2], color: PLAYER_COLORS[2] });
    const again = e.addPlayer({ id: 'p0', nickname: 'A', reconnectToken: 't0', avatarEmoji: AVATAR_EMOJIS[9], color: PLAYER_COLORS[9] });
    expect(again).toBe(p);
    expect(again.avatarEmoji).toBe(AVATAR_EMOJIS[2]);
    expect(again.color).toBe(PLAYER_COLORS[2]);
  });
});
