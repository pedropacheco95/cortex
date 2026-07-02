/**
 * Schema §4.5 fence grammar (B-003 fix). A proposal payload containing code
 * fences MUST be wrapped in an outer fence STRICTLY longer than any fence run
 * it contains (CommonMark longer-fence rule). This module owns both halves of
 * the contract so writer and parser cannot drift:
 *
 * - writers call `chooseOuterFence(payload)` — an outer backtick fence one
 *   longer than the payload's longest backtick run (minimum three);
 * - parsers call `openingFence(line)` / `closesFence(line, open)` — a fenced
 *   block closes only on a fence of the SAME character and AT LEAST the
 *   opening length, so inner (shorter) fences pass through byte-exact.
 *
 * Consumed by the §4.5 section parser (src/pulse/review.ts, pulse.distil's
 * parseSuggestionSections) and the §4.5 section writers (pulse.distil,
 * loops.skill-suggest). Deterministic Core (R-001): pure string functions.
 */

export interface FenceOpen {
  char: '`' | '~';
  length: number;
}

const OPENING_RE = /^\s*(`{3,}|~{3,})/;
const CLOSING_RE = /^\s*(`{3,}|~{3,})\s*$/;

/** The opening fence on `line` (char + length), or null when it opens none. */
export function openingFence(line: string): FenceOpen | null {
  const m = line.match(OPENING_RE);
  if (!m) return null;
  const run = m[1] as string;
  return { char: run[0] as '`' | '~', length: run.length };
}

/**
 * §4.5: "the parser honours the opening fence's length and closes only on a
 * fence of at least that length" — same character, nothing else on the line.
 */
export function closesFence(line: string, open: FenceOpen): boolean {
  const m = line.match(CLOSING_RE);
  if (!m) return false;
  const run = m[1] as string;
  return run[0] === open.char && run.length >= open.length;
}

/** Longest backtick run anywhere in `payload` (0 when it has none). */
export function longestBacktickRun(payload: string): number {
  let max = 0;
  for (const m of payload.matchAll(/`+/g)) {
    if (m[0].length > max) max = m[0].length;
  }
  return max;
}

/**
 * §4.5 writer half: "writers inspect the payload and choose the outer length
 * automatically" — strictly longer than any inner backtick run, minimum 3.
 */
export function chooseOuterFence(payload: string): string {
  return '`'.repeat(Math.max(3, longestBacktickRun(payload) + 1));
}

/**
 * Line indices of `## S-NNN`-style headings that sit OUTSIDE fenced blocks —
 * a heading-looking line inside a §4.5 payload is payload, not structure.
 */
export function headingLinesOutsideFences(lines: string[], headingRe: RegExp): number[] {
  const headings: number[] = [];
  let open: FenceOpen | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    if (open !== null) {
      if (closesFence(line, open)) open = null;
      continue;
    }
    const fence = openingFence(line);
    if (fence !== null) {
      open = fence;
      continue;
    }
    if (headingRe.test(line)) headings.push(i);
  }
  return headings;
}
