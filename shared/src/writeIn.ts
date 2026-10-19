/**
 * Pure logic for the WRITE_IN question type: normalization for grouping, display
 * label selection, grouping of submissions, and near-duplicate detection. No I/O
 * and framework-agnostic so it can be unit-tested and reused by the server.
 */
import { normalizeText } from './questionTypes.js';

/**
 * Normalize a write-in answer for grouping: case-fold, strip accents, collapse
 * inner whitespace (via normalizeText), and drop trailing . ! ? punctuation.
 * "José!" and "jose" both normalize to "jose".
 */
export function normalizeWriteIn(s: string): string {
  return normalizeText(s).replace(/[.!?]+$/g, '').trim();
}

/** First letter of each word uppercased, the rest lowercased. */
export function titleCase(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

/**
 * Optimal string alignment distance (Levenshtein + adjacent transposition),
 * so "jose"/"joes" is distance 1.
 */
export function osaDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i]![0] = i;
  for (let j = 0; j <= n; j++) d[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
      }
    }
  }
  return d[m]![n]!;
}

/** Near-duplicate: both answers 4+ chars and within edit distance 1. */
export function isNearDuplicate(a: string, b: string): boolean {
  if (a === b || a.length < 4 || b.length < 4) return false;
  return osaDistance(a, b) <= 1;
}

export interface WriteInSubmission<V> {
  /** The raw answer as typed. */
  text: string;
  /** Voter identity (e.g. a name tag). */
  voter: V;
  /** Host hid this individual answer. */
  hidden?: boolean;
}

export interface WriteInGroup<V> {
  /** Resolved normalized key (after merges). */
  key: string;
  label: string;
  count: number;
  voters: V[];
}

/** Follow a merge chain to the final target key. */
export function resolveMergeKey(key: string, merges: Record<string, string>): string {
  const seen = new Set<string>();
  let k = key;
  while (merges[k] && !seen.has(k)) {
    seen.add(k);
    k = merges[k]!;
  }
  return k;
}

/**
 * Group submissions by normalized key (after applying host merges), choosing a
 * display label per group, sorted by vote count desc then label asc.
 * Hidden submissions are excluded.
 */
export function groupWriteIn<V>(
  subs: WriteInSubmission<V>[],
  suggested: string[] = [],
  merges: Record<string, string> = {},
): WriteInGroup<V>[] {
  const groups = new Map<string, { originals: string[]; voters: V[] }>();
  for (const s of subs) {
    if (s.hidden) continue;
    const key = resolveMergeKey(normalizeWriteIn(s.text), merges);
    if (!key) continue;
    const g = groups.get(key) ?? { originals: [], voters: [] };
    g.originals.push(s.text);
    g.voters.push(s.voter);
    groups.set(key, g);
  }
  const result: WriteInGroup<V>[] = [];
  for (const [key, g] of groups) {
    result.push({ key, label: pickLabel(key, g.originals, suggested), count: g.voters.length, voters: g.voters });
  }
  result.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return result;
}

/**
 * Display label for a group. If the key matches a suggested answer, use that
 * exact spelling; otherwise use the most common original spelling (ties → the
 * first submitted), title-cased.
 */
export function pickLabel(key: string, originals: string[], suggested: string[]): string {
  const match = suggested.find((s) => normalizeWriteIn(s) === key);
  if (match) return match;
  const freq = new Map<string, number>();
  for (const o of originals) freq.set(o, (freq.get(o) ?? 0) + 1);
  let best = originals[0] ?? '';
  let bestN = 0;
  for (const o of originals) {
    const n = freq.get(o)!;
    if (n > bestN) {
      bestN = n;
      best = o;
    }
  }
  return titleCase(best);
}

/** Candidate near-duplicate group pairs the host could merge. */
export function findDuplicateSuggestions(
  groups: { key: string; label: string }[],
): { a: string; b: string; labelA: string; labelB: string }[] {
  const out: { a: string; b: string; labelA: string; labelB: string }[] = [];
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      if (isNearDuplicate(groups[i]!.key, groups[j]!.key)) {
        out.push({ a: groups[i]!.key, b: groups[j]!.key, labelA: groups[i]!.label, labelB: groups[j]!.label });
      }
    }
  }
  return out;
}
