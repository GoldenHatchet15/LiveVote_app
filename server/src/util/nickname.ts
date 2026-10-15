import { NICKNAME_MAX, NICKNAME_MIN } from '@livevote/shared';

/**
 * A deliberately small, conservative profanity list. The goal is to block the
 * most obvious slurs/swears in a classroom, not to be exhaustive. Matching is
 * done on a normalized form (lowercased, leetspeak folded, non-letters
 * stripped) so simple evasions like "a$$" or "f_u_c_k" are caught.
 */
const BLOCKLIST = [
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'cunt',
  'dick',
  'piss',
  'bastard',
  'slut',
  'whore',
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'rape',
  'nazi',
];

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
};

export function normalizeForProfanity(input: string): string {
  return input
    .toLowerCase()
    .split('')
    .map((ch) => LEET[ch] ?? ch)
    .join('')
    .replace(/[^a-z]/g, '');
}

export function isProfane(nickname: string): boolean {
  const normalized = normalizeForProfanity(nickname);
  return BLOCKLIST.some((bad) => normalized.includes(bad));
}

export type NicknameCheck =
  | { ok: true; nickname: string }
  | { ok: false; code: 'NICKNAME_INVALID' | 'NICKNAME_PROFANE'; message: string };

/** Trim, collapse whitespace, and validate length + profanity. */
export function validateNickname(raw: string): NicknameCheck {
  const nickname = raw.replace(/\s+/g, ' ').trim();
  if (nickname.length < NICKNAME_MIN || nickname.length > NICKNAME_MAX) {
    return {
      ok: false,
      code: 'NICKNAME_INVALID',
      message: `Nickname must be ${NICKNAME_MIN}–${NICKNAME_MAX} characters`,
    };
  }
  // Allow letters, numbers, spaces and a few friendly symbols.
  if (!/^[\p{L}\p{N} _.!?-]+$/u.test(nickname)) {
    return {
      ok: false,
      code: 'NICKNAME_INVALID',
      message: 'Nickname contains invalid characters',
    };
  }
  if (isProfane(nickname)) {
    return {
      ok: false,
      code: 'NICKNAME_PROFANE',
      message: 'Please choose a friendlier nickname',
    };
  }
  return { ok: true, nickname };
}
