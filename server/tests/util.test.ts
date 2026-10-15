import { describe, expect, it } from 'vitest';
import { validateNickname, isProfane } from '../src/util/nickname.js';
import { generatePin, isValidPinFormat } from '../src/util/pin.js';
import { RateLimiter } from '../src/util/rateLimiter.js';

describe('nickname validation', () => {
  it('accepts a reasonable nickname', () => {
    expect(validateNickname('  Ada Lovelace ').ok).toBe(true);
  });
  it('rejects too short / too long', () => {
    expect(validateNickname('a').ok).toBe(false);
    expect(validateNickname('x'.repeat(17)).ok).toBe(false);
  });
  it('catches basic profanity and leetspeak evasions', () => {
    expect(isProfane('sh1t')).toBe(true);
    expect(isProfane('a$$hole')).toBe(true);
    expect(isProfane('Sunflower')).toBe(false);
  });
});

describe('pin', () => {
  it('generates 6-digit pins', () => {
    for (let i = 0; i < 100; i++) {
      expect(isValidPinFormat(generatePin())).toBe(true);
    }
  });
  it('rejects malformed pins', () => {
    expect(isValidPinFormat('12345')).toBe(false);
    expect(isValidPinFormat('abcdef')).toBe(false);
    expect(isValidPinFormat('1234567')).toBe(false);
  });
});

describe('rate limiter', () => {
  it('allows up to capacity then blocks', () => {
    const rl = new RateLimiter(3, 1);
    expect(rl.take('ip', 0)).toBe(true);
    expect(rl.take('ip', 0)).toBe(true);
    expect(rl.take('ip', 0)).toBe(true);
    expect(rl.take('ip', 0)).toBe(false);
  });
  it('refills over time', () => {
    const rl = new RateLimiter(1, 1);
    expect(rl.take('ip', 0)).toBe(true);
    expect(rl.take('ip', 0)).toBe(false);
    expect(rl.take('ip', 1000)).toBe(true);
  });
});
