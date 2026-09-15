/**
 * Addressable schema clauses — `schema:§N[.M[.K]]` (schema §6.2, spec
 * `schema.schema-clauses`; new at 3.4).
 *
 * The grammar every `ValidationReport.clause` already uses becomes a reference
 * form a `bears_on` list can carry. A ref resolves when `cortex-schema.md` at
 * the project root has a heading whose leading number is exactly the ref's:
 * `## 6.`, `### 6.2`, `#### 4.10.11` — the title after the number is not part
 * of the match, so a retitled section still resolves. Headings inside fenced
 * code blocks are skipped; appendix headings and the unnumbered §0 decisions
 * list carry no number and are not addressable.
 *
 * Read once, cached per run (Rule 3): `loadClauseIndex` reads the document a
 * single time and returns the set of heading numbers; `clauseResolves` is a
 * pure set lookup. Every check and the recall compiler take the index as an
 * argument — the document is never re-read per ref.
 *
 * Deterministic Core (R-001): one file read and string matching. No LLM, no
 * network. A project without the document resolves nothing, without error.
 */
import * as fs from 'fs';
import * as path from 'path';

/** Rule 1's grammar: `schema:§` then one to three dot-separated integers. */
export const CLAUSE_REF_RE = /^schema:§\d+(\.\d+){0,2}$/;

/** The set of every numbered heading found in the document, e.g. `{"1","6","6.2"}`. */
export type ClauseIndex = Set<string>;

/** The document the resolver reads — always at the project root, never elsewhere (Rule 2). */
export const SCHEMA_DOC_FILENAME = 'cortex-schema.md';

const CLAUSE_PREFIX = 'schema:§';

/** A markdown heading (2–4 `#`) whose text starts with a number followed by a space or full stop. */
const NUMBERED_HEADING_RE = /^#{2,4}\s+(\d+(?:\.\d+){0,2})[.\s]/;

/** A fence line: three or more backticks at the start of the line (Rule 2's skip state). */
const FENCE_RE = /^```/;

/**
 * The one heading scan both loaders share: every numbered heading outside a
 * fence, in document order, as `[number, text after the number]`. The text has
 * the number's trailing `.` and surrounding whitespace trimmed
 * (`## 5. Hook payload contracts` → `["5", "Hook payload contracts"]`).
 * Absent or unreadable document → no headings and no exception.
 */
function scanNumberedHeadings(root: string): [string, string][] {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(root, SCHEMA_DOC_FILENAME), 'utf-8');
  } catch {
    return [];
  }

  const headings: [string, string][] = [];
  let inFence = false;
  for (const line of raw.split(/\r?\n/)) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = NUMBERED_HEADING_RE.exec(line);
    if (m?.[1]) headings.push([m[1], line.slice(m[0].length).replace(/^[.\s]+/, '').trim()]);
  }
  return headings;
}

/**
 * Scan the heading lines of `cortex-schema.md` once. Absent or unreadable
 * document → an empty index and no exception (the "resolves nothing, without
 * error" criterion).
 */
export function loadClauseIndex(root: string): ClauseIndex {
  const index: ClauseIndex = new Set();
  for (const [number] of scanNumberedHeadings(root)) index.add(number);
  return index;
}

/**
 * The same scan keeping the heading TEXT alongside the number (3.4 second
 * revision — `hooks.search-annotate` Rule 5e matches a schema search's tokens
 * against it, for that one target only). A number that appears twice keeps its
 * first heading. Absent document → an empty map, never a throw. Additive:
 * `ClauseIndex` stays a `Set`, `loadClauseIndex` is unchanged.
 */
export function loadClauseHeadings(root: string): Map<string, string> {
  const headings = new Map<string, string>();
  for (const [number, text] of scanNumberedHeadings(root)) {
    if (!headings.has(number)) headings.set(number, text);
  }
  return headings;
}

/** The heading number a well-formed ref names (`schema:§4.11` → `4.11`); `undefined` when the grammar fails. */
export function clauseNumber(ref: string): string | undefined {
  if (!CLAUSE_REF_RE.test(ref)) return undefined;
  return ref.slice(CLAUSE_PREFIX.length);
}

/** Pure set lookup (Rule 3). A malformed ref is rejected by the grammar and never looked up. */
export function clauseResolves(index: ClauseIndex, ref: string): boolean {
  const number = clauseNumber(ref);
  if (number === undefined) return false;
  return index.has(number);
}
