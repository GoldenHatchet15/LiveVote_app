/** Shared, framework-agnostic constants and validation bounds. */

export const PIN_LENGTH = 6;

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 16;

export const OPTIONS_MIN = 2;
export const OPTIONS_MAX = 4;

export const OPTION_TEXT_MAX = 120;
export const QUESTION_TEXT_MAX = 300;
export const SET_TITLE_MAX = 120;

export const ALLOWED_TIME_LIMITS = [10, 20, 30, 60, null] as const;

/**
 * Canonical answer shapes and their brand colors, matching the player buttons
 * and host tiles. Index corresponds to Option.index (0..3).
 */
export const OPTION_SHAPES = [
  { shape: 'triangle', color: '#e4002b', label: 'Red triangle' }, // Holberton red
  { shape: 'diamond', color: '#2563eb', label: 'Blue diamond' },
  { shape: 'circle', color: '#f2b705', label: 'Yellow circle' },
  { shape: 'square', color: '#15803d', label: 'Green square' },
] as const;

export type OptionShape = (typeof OPTION_SHAPES)[number]['shape'];

/** Grace window (ms) added to the server timer before an answer is rejected as late. */
export const LATE_ANSWER_GRACE_MS = 750;
