/**
 * The Core structural significance filter (spec insight.refresh-loops Rule 2;
 * design §5.9 "hybrid significance detection", structural half). Deterministic
 * no-op detectors that rule out formatting-only, comment-only, whitespace-only,
 * and import-reordering changes BEFORE any LLM triage, plus the L3-significance
 * heuristics (new/removed exports, size delta, large-change ratio) that let the
 * daily loop classify obvious cases without Haiku.
 *
 * Pure functions — no fs, no git, no LLM (R-001). Callers supply both content
 * versions; the filter only compares. The verdicts:
 *
 *   identical              byte-identical bodies
 *   cosmetic               formatting/comment/whitespace/import-reorder only —
 *                          never reaches L2/L3
 *   real                   genuine but small content change — L2 re-extraction
 *   significant-candidate  exports changed / large size delta / large change —
 *                          L3 re-extraction due
 *   uncertain              the filter cannot decide — Haiku triage (the skill)
 *
 * The comment-stripping is a documented heuristic (it does not tokenise
 * strings); a `//` inside a string literal is only treated as a comment when
 * preceded by whitespace or line start and not by `:` (spares URLs).
 */

export type SignificanceVerdict =
  | 'identical'
  | 'cosmetic'
  | 'real'
  | 'significant-candidate'
  | 'uncertain';

export interface SignificanceResult {
  verdict: SignificanceVerdict;
  /** One-line, deterministic explanation of the verdict. */
  reason: string;
  /** Exported names added/removed (JS/TS only; empty elsewhere). */
  exportsAdded: string[];
  exportsRemoved: string[];
  /** |newLines - oldLines| / max(oldLines, newLines) — 0 when both empty. */
  sizeDeltaRatio: number;
  /** Normalized changed-line ratio (added+removed over the larger side). */
  changedLineRatio: number;
}

/** Change-ratio thresholds (deterministic tuning; spec Notes leave these to
 *  this implementation). ≤ REAL_MAX → real; ≥ SIGNIFICANT_MIN → significant. */
export const REAL_MAX_CHANGED_RATIO = 0.1;
export const SIGNIFICANT_MIN_CHANGED_RATIO = 0.4;
export const SIGNIFICANT_SIZE_DELTA_RATIO = 0.3;

const SLASH_COMMENT_LANGS = new Set(['typescript', 'javascript', 'rust', 'go', 'css']);
const HASH_COMMENT_LANGS = new Set(['python', 'shell', 'yaml', 'toml']);

/** Strip comments for the language (heuristic — see module header). */
export function stripComments(content: string, language: string): string {
  let out = content;
  if (SLASH_COMMENT_LANGS.has(language)) {
    out = out.replace(/\/\*[\s\S]*?\*\//g, ' ');
    // Line comments: `//` at line start or after whitespace, not `://` (URLs).
    out = out.replace(/(^|\s)\/\/[^\n]*/g, '$1');
  }
  if (HASH_COMMENT_LANGS.has(language)) {
    out = out.replace(/(^|\s)#[^\n]*/g, '$1');
  }
  return out;
}

/** Comment-stripped, whitespace-collapsed form — equal forms mean the change
 *  was formatting/comment/whitespace only. */
export function normalizeForCompare(content: string, language: string): string {
  return stripComments(content, language).replace(/\s+/g, ' ').trim();
}

const JS_IMPORT_LINE_RE = /^\s*(?:import\b[^;]*?;?|(?:export\s+(?:\*|\{[^}]*\})\s*from\s*['"][^'"]+['"];?)|const\s+[\w${},\s]+=\s*require\(['"][^'"]+['"]\);?)\s*$/;
const PY_IMPORT_LINE_RE = /^\s*(?:import\s+\S+|from\s+\S+\s+import\b.*)\s*$/;

function isImportLine(line: string, language: string): boolean {
  if (language === 'typescript' || language === 'javascript') return JS_IMPORT_LINE_RE.test(line);
  if (language === 'python') return PY_IMPORT_LINE_RE.test(line);
  return false;
}

/** Split normalized non-empty lines into (sorted import lines, remainder). */
export function splitImports(content: string, language: string): { imports: string[]; rest: string[] } {
  const imports: string[] = [];
  const rest: string[] = [];
  for (const raw of stripComments(content, language).split('\n')) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (line === '') continue;
    if (isImportLine(line, language)) imports.push(line);
    else rest.push(line);
  }
  imports.sort();
  return { imports, rest };
}

const EXPORT_NAME_RE =
  /(?:^|\n)\s*export\s+(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|type|interface|enum|namespace)\s+([\w$]+)/g;

/** Exported top-level names (JS/TS regex supplement, mirrors L1's extractor). */
export function exportedNamesOf(content: string, language: string): string[] {
  if (language !== 'typescript' && language !== 'javascript') return [];
  const names = new Set<string>();
  for (const match of content.matchAll(EXPORT_NAME_RE)) {
    if (match[1]) names.add(match[1]);
  }
  return [...names].sort();
}

/** Multiset changed-line count between two normalized line arrays. */
function changedLines(a: string[], b: string[]): number {
  const counts = new Map<string, number>();
  for (const line of a) counts.set(line, (counts.get(line) ?? 0) + 1);
  let common = 0;
  for (const line of b) {
    const c = counts.get(line) ?? 0;
    if (c > 0) {
      counts.set(line, c - 1);
      common++;
    }
  }
  return a.length - common + (b.length - common);
}

function normalizedLines(content: string, language: string): string[] {
  return stripComments(content, language)
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l !== '');
}

/**
 * Classify a change from `oldContent` to `newContent` (spec Rule 2). Rules,
 * in order:
 *  1. byte-identical → identical
 *  2. normalized-equal → cosmetic (formatting/comment/whitespace only)
 *  3. sorted-imports equal + remainder equal → cosmetic (import reordering)
 *  4. exports added/removed → significant-candidate
 *  5. size delta ≥ SIGNIFICANT_SIZE_DELTA_RATIO → significant-candidate
 *  6. changed-line ratio ≥ SIGNIFICANT_MIN → significant-candidate;
 *     ≤ REAL_MAX → real; between → uncertain (Haiku triage).
 */
export function classifyChange(
  oldContent: string,
  newContent: string,
  language: string,
): SignificanceResult {
  const base: Pick<SignificanceResult, 'exportsAdded' | 'exportsRemoved' | 'sizeDeltaRatio' | 'changedLineRatio'> = {
    exportsAdded: [],
    exportsRemoved: [],
    sizeDeltaRatio: 0,
    changedLineRatio: 0,
  };

  if (oldContent === newContent) {
    return { verdict: 'identical', reason: 'byte-identical', ...base };
  }

  if (normalizeForCompare(oldContent, language) === normalizeForCompare(newContent, language)) {
    return { verdict: 'cosmetic', reason: 'formatting/comment/whitespace-only change', ...base };
  }

  const oldSplit = splitImports(oldContent, language);
  const newSplit = splitImports(newContent, language);
  if (
    oldSplit.imports.join('\n') === newSplit.imports.join('\n') &&
    oldSplit.rest.join(' ') === newSplit.rest.join(' ')
  ) {
    return { verdict: 'cosmetic', reason: 'import-reordering only', ...base };
  }

  const oldExports = exportedNamesOf(oldContent, language);
  const newExports = exportedNamesOf(newContent, language);
  const oldSet = new Set(oldExports);
  const newSet = new Set(newExports);
  const exportsAdded = newExports.filter((n) => !oldSet.has(n));
  const exportsRemoved = oldExports.filter((n) => !newSet.has(n));

  const oldLines = normalizedLines(oldContent, language);
  const newLines = normalizedLines(newContent, language);
  const maxLines = Math.max(oldLines.length, newLines.length);
  const sizeDeltaRatio = maxLines === 0 ? 0 : Math.abs(newLines.length - oldLines.length) / maxLines;
  const changedLineRatio = maxLines === 0 ? 0 : changedLines(oldLines, newLines) / (2 * maxLines);

  const measured = { exportsAdded, exportsRemoved, sizeDeltaRatio, changedLineRatio };

  if (exportsAdded.length > 0 || exportsRemoved.length > 0) {
    return {
      verdict: 'significant-candidate',
      reason:
        `exports changed` +
        (exportsAdded.length > 0 ? ` +${exportsAdded.join(',')}` : '') +
        (exportsRemoved.length > 0 ? ` -${exportsRemoved.join(',')}` : ''),
      ...measured,
    };
  }
  if (sizeDeltaRatio >= SIGNIFICANT_SIZE_DELTA_RATIO) {
    return { verdict: 'significant-candidate', reason: `size delta ${(sizeDeltaRatio * 100).toFixed(0)}%`, ...measured };
  }
  if (changedLineRatio >= SIGNIFICANT_MIN_CHANGED_RATIO) {
    return { verdict: 'significant-candidate', reason: `large change (${(changedLineRatio * 100).toFixed(0)}% of lines)`, ...measured };
  }
  if (changedLineRatio <= REAL_MAX_CHANGED_RATIO) {
    return { verdict: 'real', reason: `small content change (${(changedLineRatio * 100).toFixed(0)}% of lines)`, ...measured };
  }
  return { verdict: 'uncertain', reason: `mid-band change (${(changedLineRatio * 100).toFixed(0)}% of lines) — needs LLM triage`, ...measured };
}
