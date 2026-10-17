/**
 * Curated emoji avatars and the player colour palette, plus the WCAG contrast
 * helpers used to pick a readable text colour for each name pill. Shared so the
 * server (validation, assignment) and client (rendering) agree.
 */

/**
 * 30 friendly, neutral emojis (animals, food, objects). No faces, no flags, no
 * hands — nothing that reads as negative or could offend. All single-codepoint
 * so they map cleanly to a bundled/CDN SVG set (e.g. Twemoji).
 */
export const AVATAR_EMOJIS: string[] = [
  '🐶', '🐱', '🦊', '🐼', '🦁', '🐸', '🐵', '🦄', '🐝', '🐢',
  '🐙', '🦉', '🐧', '🦋', '🐬',
  '🍎', '🍊', '🍋', '🍉', '🍇', '🍓', '🍒', '🥑', '🍜', '🍩',
  '🚀', '⭐', '🎸', '🎲', '🧩',
];

export function isValidAvatar(emoji: string): boolean {
  return AVATAR_EMOJIS.includes(emoji);
}

/**
 * 16 distinct player colours. Chosen to be saturated enough that either black
 * or white text clears WCAG AA on them, and shaded/hued away from the answer
 * tiles (red/blue/yellow/green) and the correct-answer green. Name tags also
 * carry a border, so they never read as an answer option.
 */
export const PLAYER_COLORS: string[] = [
  '#0d9488', '#0891b2', '#0284c7', '#4f46e5',
  '#7c3aed', '#9333ea', '#c026d3', '#db2777',
  '#e11d48', '#ea580c', '#d97706', '#b45309',
  '#be185d', '#7e22ce', '#4338ca', '#a21caf',
];

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

/** WCAG contrast ratio between two hex colours (1..21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Pick black or white text for the best contrast on a background colour. */
export function textOn(bg: string): string {
  return contrastRatio(bg, '#ffffff') >= contrastRatio(bg, '#111111') ? '#ffffff' : '#111111';
}
