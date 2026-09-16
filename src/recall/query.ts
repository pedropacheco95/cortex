/**
 * The shared recall query module — the one loader, tokeniser, candidate
 * expansion, matcher and pointer-line formatter every consumer of
 * `.cortex/recall-index.json` calls (schema §4.11 "Consumers", §5 "Recall
 * pointer lines"; owned by `hooks.search-annotate` Rule 12, whose Rules 4–10
 * fix the semantics). Four consumers, one grammar:
 *
 *   - `cortex hook search-annotate`     (`src/hooks/search-annotate.ts`)
 *   - the PreRead recall marker          (`hooks.pre-read-writeback` Rule 6)
 *   - `cortex why` / `cortex recall`     (`recall.why`)
 *   - the generated atlas index blocks   (`recall.index-blocks`)
 *
 * Everything here is index-only: no consumer opens frontmatter, a rule, a
 * decision or a thread to build a pointer — every fact a line carries is
 * already a name, an id, a date or a path in the index. The single exception
 * is `candidateKeys` for the schema document, which reads `cortex-schema.md`'s
 * heading lines (through `loadClauseHeadings`) to match clause subjects by
 * heading text — Rule 5e, and only for that target.
 *
 * Fail-open (Rule 10): a missing, unparseable or mis-shaped index loads as
 * `null`; nothing in this module throws on its inputs and nothing logs. The
 * index is read once per process per root (Rule 11's latency target).
 *
 * The two line shapes (Rule 7, schema §5) are the only text this module emits:
 *
 *   Recall: <kind> <YYYY-MM-DD> <title cut to 60> (<path>)
 *   Decided: <decision id> · Open: <T-id> <thread key text cut to 40>
 *
 * plus the PreRead marker form `Decided: <ids ≤3> · Evidence: <ids ≤2> · Open:
 * <T-ids ≤2>`, and the optional ` · more: cortex why <ref>` tail. No imperative,
 * no second person, no body text — `pulse.usage` Rule 11 counts fired and
 * followed pointers by these prefixes, so the wording is pinned.
 *
 * Deterministic Core (R-001, Rule 13): string matching, set operations, one
 * JSON read. No LLM, no network, no subprocess.
 */
import * as fs from 'fs';
import * as path from 'path';
import { recallIndexPath, RECALL_ENTRY_KINDS, type RecallEntry, type RecallEntryKind, type RecallIndex, type RecallSubject } from './index.js';
import { CLAUSE_REF_RE, clauseNumber, loadClauseHeadings, SCHEMA_DOC_FILENAME } from '../schema/clauses.js';
import { BUG_RE, CONCEPT_RE, DOMAIN_RE, RULE_RE, normalisePathRef } from '../schema/refs.js';

// ---------------------------------------------------------------------------
// Rule 10 / Rule 12 — the loader and its per-process cache
// ---------------------------------------------------------------------------

const cache = new Map<string, RecallIndex | null>();

const SUBJECT_LISTS = ['decided', 'evidence', 'threads', 'observations'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/** The §4.11 shape probe: `subjects` and `entries` are plain objects, every subject has four string lists, every entry its five fields. */
function probeShape(value: unknown): value is RecallIndex {
  if (!isPlainObject(value)) return false;
  const { subjects, entries } = value;
  if (!isPlainObject(subjects) || !isPlainObject(entries)) return false;
  for (const subject of Object.values(subjects)) {
    if (!isPlainObject(subject)) return false;
    for (const list of SUBJECT_LISTS) if (!isStringArray(subject[list])) return false;
  }
  for (const entry of Object.values(entries)) {
    if (!isPlainObject(entry)) return false;
    if (typeof entry['kind'] !== 'string' || !(RECALL_ENTRY_KINDS as readonly string[]).includes(entry['kind'])) return false;
    if (typeof entry['title'] !== 'string' || typeof entry['path'] !== 'string' || typeof entry['date'] !== 'string') return false;
    if (!isStringArray(entry['keywords'])) return false;
  }
  return true;
}

/**
 * Read `.cortex/recall-index.json` once per process per root. `null` — never a
 * throw, never a log — on ENOENT, a JSON parse error, or a value failing the
 * shape probe; the `null` is cached too, so a hook fires at most one read.
 */
export function loadRecallIndex(root: string): RecallIndex | null {
  const key = path.resolve(root);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  let loaded: RecallIndex | null = null;
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(recallIndexPath(key), 'utf-8'));
    loaded = probeShape(parsed) ? parsed : null;
  } catch {
    loaded = null;
  }
  cache.set(key, loaded);
  return loaded;
}

/** Drop every cached index — for tests and for a long-lived process that rebuilt the file. */
export function clearRecallIndexCache(): void {
  cache.clear();
}

// ---------------------------------------------------------------------------
// Rule 4 — tokens and ref-shaped spans
// ---------------------------------------------------------------------------

/** Rule 4's fixed stop-list, quoted in the spec so tests pin it. Widening it is a spec edit. */
export const STOP_TOKENS: ReadonlySet<string> = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'not', 'are', 'was', 'but',
]);

/** Rule 4: tokens shorter than this are dropped. */
const TOKEN_MIN_CHARS = 3;

const THREAD_RE = /^T-\d{3,}$/;
/** A dotted spec-style id (`pulse.usage`) — a ref only when the index knows it (Rule 4). */
const DOTTED_ID_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
/** The characters stripped from both ends of a whitespace token before the ref shapes are tried. */
const REF_TRIM_RE = /^[`'"()[\]]+|[`'"()[\]]+$/g;

const REF_SHAPES: readonly RegExp[] = [RULE_RE, BUG_RE, THREAD_RE, CLAUSE_REF_RE, CONCEPT_RE, DOMAIN_RE];

export interface Tokenised {
  /** Lowercase, split on non-alphanumerics, ≥3 chars, stop-list removed, first-seen order, deduplicated. */
  tokens: string[];
  /** Ref-shaped spans of the raw text, verbatim and case-sensitive, deduplicated. */
  refs: string[];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Rule 4. `tokens` are the pattern's plain words; `refs` are its `R-NNN`,
 * `B-NNN`, `T-NNN`, `schema:§…`, `concept:<slug>`, `domain.<term>` spans and
 * — when `index` is given — any dotted id it holds as a subject key or in an
 * entry's keywords. Regex metacharacters vanish in the split.
 */
export function tokenise(text: string, index?: RecallIndex | null): Tokenised {
  const tokens = unique(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= TOKEN_MIN_CHARS && !STOP_TOKENS.has(t)),
  );

  const known = index ? knownDottedIds(index) : null;
  const refs = unique(
    text
      .split(/\s+/)
      .map((t) => t.replace(REF_TRIM_RE, ''))
      .filter((t) => t.length > 0)
      .filter((t) => REF_SHAPES.some((re) => re.test(t)) || (known !== null && DOTTED_ID_RE.test(t) && known.has(t))),
  );

  return { tokens, refs };
}

const knownIdsCache = new WeakMap<RecallIndex, Set<string>>();

/** Every subject key and every entry keyword of the index — the population a dotted id must belong to. */
function knownDottedIds(index: RecallIndex): Set<string> {
  const cached = knownIdsCache.get(index);
  if (cached !== undefined) return cached;
  const known = new Set<string>(Object.keys(index.subjects));
  for (const entry of Object.values(index.entries)) for (const keyword of entry.keywords) known.add(keyword);
  knownIdsCache.set(index, known);
  return known;
}

// ---------------------------------------------------------------------------
// Rule 5 — candidate subject keys for a search or read target
// ---------------------------------------------------------------------------

const SPEC_TREES: readonly [prefix: string, suffix: string][] = [
  ['.specflow/specs/', '.spec.md'],
  ['.specflow/specs-business/', '.business.md'],
];

/** Rule 5d: the basename shapes that map a compass, domain or concept file to its id. */
const RULE_FILE_RE = /^(R-\d{3,})(?:-[^/]*)?\.md$/;
const BUG_FILE_RE = /^(B-\d{3,})(?:-[^/]*)?\.md$/;

/** The project-relative POSIX form of a target, or `null` for the root, an outside path, or nothing. */
function normaliseTarget(root: string, targetPath: string): string | null {
  let p = normalisePathRef(targetPath.trim());
  if (path.isAbsolute(p) || path.posix.isAbsolute(p)) {
    p = path.relative(path.resolve(root), p).split(path.sep).join('/');
  }
  p = p.replace(/\/+$/, '');
  if (p === '' || p === '.' || p === '..' || p.startsWith('../') || p.startsWith('/')) return null;
  return p;
}

/** Rule 5b: parents nearest-first, stopping inclusively at `.cortex/<module>`, `.specflow/<tree>`, or the first segment. */
function parentKeys(relPath: string): string[] {
  const segments = relPath.split('/');
  const floor = segments[0] === '.cortex' || segments[0] === '.specflow' ? 2 : 1;
  const parents: string[] = [];
  for (let depth = segments.length - 1; depth >= floor; depth--) parents.push(segments.slice(0, depth).join('/'));
  return parents;
}

/** Rule 5c: a spec file's id — tree root and suffix stripped, `/` → `.`. */
function specIdOf(relPath: string): string | null {
  for (const [prefix, suffix] of SPEC_TREES) {
    if (relPath.startsWith(prefix) && relPath.endsWith(suffix)) {
      return relPath.slice(prefix.length, relPath.length - suffix.length).split('/').join('.');
    }
  }
  return null;
}

/** Rule 5d: the compass, domain or concept id a `.cortex/` file stands for. */
function artefactIdOf(relPath: string): string | null {
  const segments = relPath.split('/');
  const base = segments[segments.length - 1] ?? '';
  const dir = segments.slice(0, -1).join('/');
  if (dir === '.cortex/compass/rules') return RULE_FILE_RE.exec(base)?.[1] ?? null;
  if (dir === '.cortex/compass/bugs') return BUG_FILE_RE.exec(base)?.[1] ?? null;
  if (dir === '.cortex/atlas/domain' && base.endsWith('.md')) return `domain.${base.slice(0, -3)}`;
  const isConcept = dir === '.cortex/insight/concepts' || /^\.cortex\/insight\/scopes\/[^/]+\/concepts$/.test(dir);
  if (isConcept && base.endsWith('.md')) return `concept:${base.slice(0, -3)}`;
  return null;
}

/**
 * Rule 5e: for the schema document, every `schema:§…` subject whose clause
 * number equals a pattern token or whose heading text contains one; with no
 * tokens at all (the PreRead and `why` callers) every clause subject. The one
 * read outside the index, and only for this target.
 */
function clauseKeys(root: string, index: RecallIndex, patternTokens: string[] | undefined): string[] {
  const clauseSubjects = Object.keys(index.subjects).filter((k) => CLAUSE_REF_RE.test(k)).sort();
  if (patternTokens === undefined) return clauseSubjects;
  if (clauseSubjects.length === 0 || patternTokens.length === 0) return [];
  const tokens = patternTokens.map((t) => t.toLowerCase());
  const headings = loadClauseHeadings(root);
  return clauseSubjects.filter((key) => {
    const number = clauseNumber(key) ?? '';
    if (tokens.includes(number)) return true;
    const heading = headings.get(number)?.toLowerCase();
    return heading !== undefined && tokens.some((t) => heading.includes(t));
  });
}

/**
 * Rule 5: the candidate subject keys of a target path, in strength order —
 * the exact path, then its spec / compass / domain / concept / clause ids,
 * then its parents nearest-first — filtered to the keys the index holds and
 * deduplicated. A path outside the project, or the root itself, yields none.
 */
export function candidateKeys(root: string, targetPath: string, index: RecallIndex, patternTokens?: string[]): string[] {
  const rel = normaliseTarget(root, targetPath);
  if (rel === null) return [];

  const candidates: string[] = [rel];
  const specId = specIdOf(rel);
  if (specId !== null) candidates.push(specId);
  const artefactId = artefactIdOf(rel);
  if (artefactId !== null) candidates.push(artefactId);
  if (rel === SCHEMA_DOC_FILENAME) candidates.push(...clauseKeys(root, index, patternTokens));
  candidates.push(...parentKeys(rel));

  return unique(candidates.filter((key) => Object.prototype.hasOwnProperty.call(index.subjects, key)));
}

// ---------------------------------------------------------------------------
// Rule 6 — keyword matches, the weak signal
// ---------------------------------------------------------------------------

export interface KeywordHit {
  id: string;
  /** Distinct tokens plus distinct refs found in the entry's keywords. */
  hits: number;
}

/** Rule 6's qualifying threshold: this many distinct plain tokens, or one ref. */
const TOKEN_HITS_TO_QUALIFY = 2;

function byDateDescThenId(index: RecallIndex): (a: string, b: string) => number {
  return (a, b) => {
    const da = index.entries[a]?.date ?? '';
    const db = index.entries[b]?.date ?? '';
    if (da !== db) return da < db ? 1 : -1;
    return a < b ? -1 : a > b ? 1 : 0;
  };
}

/**
 * Rule 6: an entry qualifies on two or more distinct token hits or one ref hit
 * against its keywords; ranked by hits descending, then date descending, then
 * id ascending. `kind` narrows the population.
 */
export function keywordMatches(index: RecallIndex, tokens: string[], refs: string[], kind?: RecallEntryKind): KeywordHit[] {
  const distinctTokens = unique(tokens);
  const distinctRefs = unique(refs);
  const hits: KeywordHit[] = [];
  for (const [id, entry] of Object.entries(index.entries)) {
    if (kind !== undefined && entry.kind !== kind) continue;
    const keywords = new Set(entry.keywords);
    const tokenHits = distinctTokens.filter((t) => keywords.has(t)).length;
    const refHits = distinctRefs.filter((r) => keywords.has(r)).length;
    if (tokenHits >= TOKEN_HITS_TO_QUALIFY || refHits >= 1) hits.push({ id, hits: tokenHits + refHits });
  }
  const tieBreak = byDateDescThenId(index);
  return hits.sort((a, b) => b.hits - a.hits || tieBreak(a.id, b.id));
}

// ---------------------------------------------------------------------------
// Rule 7 — the pointer-line grammar
// ---------------------------------------------------------------------------

/** Rule 7's title widths: a `Recall:` title, a `Decided:` thread fragment, and Rule 10's over-budget width. */
export const RECALL_TITLE_MAX = 60;
export const THREAD_TITLE_MAX = 40;
const BUDGET_TITLE_MAX = 20;
/** Rule 10: ≤60 tokens by the project-wide chars/4 estimate, over at most two lines. */
export const POINTER_BUDGET_CHARS = 240;
export const POINTER_MAX_LINES = 2;
const ELLIPSIS = '…';

/** Cut on a word boundary with a trailing `…`; the result never exceeds `max` characters. */
export function cutTitle(title: string, max: number): string {
  if (title.length <= max) return title;
  let head = title.slice(0, max - 1);
  if (!/\s/.test(title.charAt(max - 1))) {
    const boundary = head.search(/\s\S*$/);
    if (boundary > 0) head = head.slice(0, boundary);
  }
  return head.trimEnd() + ELLIPSIS;
}

/** `Recall: <kind> <YYYY-MM-DD> <title cut to 60> (<path>)`. */
export function recallLine(entry: RecallEntry, titleMax = RECALL_TITLE_MAX): string {
  return `Recall: ${entry.kind} ${entry.date.slice(0, 10)} ${cutTitle(entry.title, titleMax)} (${entry.path})`;
}

/** `Decided: <decision id> · Open: <T-id> <thread key text cut to 40>`. */
export function decidedLine(decisionId: string, threadId: string, threadTitle: string, titleMax = THREAD_TITLE_MAX): string {
  return `Decided: ${decisionId} · Open: ${threadId} ${cutTitle(threadTitle, titleMax)}`.trimEnd();
}

/** The ` · more: cortex why <ref>` tail every last line may carry. */
export function moreTail(ref: string): string {
  return ` · more: cortex why ${ref}`;
}

/** The PreRead marker's per-part caps (schema §5 row (c)). */
const MARKER_CAPS = { decided: 3, evidence: 2, threads: 2 } as const;

/** The entry an id in a subject list names — observations are listed by theme but keyed `observation.<theme>`. */
function entryFor(index: RecallIndex, id: string): [key: string, entry: RecallEntry] | null {
  const direct = index.entries[id];
  if (direct !== undefined) return [id, direct];
  const themed = index.entries[`observation.${id}`];
  return themed === undefined ? null : [`observation.${id}`, themed];
}

/** A subject list's ids that exist in `entries`, newest first (date descending, then id ascending). */
function newestFirst(index: RecallIndex, ids: string[]): string[] {
  const present = unique(ids).filter((id) => entryFor(index, id) !== null);
  const tieBreak = byDateDescThenId(index);
  return present.sort((a, b) => tieBreak(entryFor(index, a)?.[0] ?? a, entryFor(index, b)?.[0] ?? b));
}

/**
 * The PreRead marker (schema §5 row (c), `hooks.pre-read-writeback` Rule 6):
 * `Decided: <ids ≤3> · Evidence: <ids ≤2> · Open: <T-ids ≤2>`, newest first,
 * empty parts omitted, ` · more: cortex why <key>` when any part was cut;
 * `null` when the subject has no decision, evidence or open thread.
 */
export function markerLine(subject: RecallSubject, key: string, index: RecallIndex): string | null {
  const parts: string[] = [];
  let cut = false;
  const part = (label: string, ids: string[], cap: number): void => {
    const ordered = newestFirst(index, ids);
    if (ordered.length === 0) return;
    if (ordered.length > cap) cut = true;
    parts.push(`${label}: ${ordered.slice(0, cap).join(', ')}`);
  };
  part('Decided', subject.decided, MARKER_CAPS.decided);
  part('Evidence', subject.evidence, MARKER_CAPS.evidence);
  part('Open', subject.threads, MARKER_CAPS.threads);
  if (parts.length === 0) return null;
  return parts.join(' · ') + (cut ? moreTail(key) : '');
}

// ---------------------------------------------------------------------------
// Rules 8–10 — selection, once-per-session, budget
// ---------------------------------------------------------------------------

export interface PointerSelection {
  /** At most two lines in the Rule 7 grammar; empty when nothing qualifies. */
  lines: string[];
  /** The subject key (if one led) and the entry ids the lines name — what the caller records as fired. */
  fired: string[];
}

/** One planned line before rendering — rendered late so Rule 10's title cut can be re-applied. */
type PlannedLine =
  | { shape: 'recall'; id: string; entry: RecallEntry }
  | { shape: 'decided'; decisionId: string; threadId: string; threadTitle: string; ids: string[] };

/** Rule 8's strength order: open thread > current decision > evidence > observation, newest first within a kind. */
function membersByStrength(index: RecallIndex, subject: RecallSubject): [key: string, entry: RecallEntry][] {
  const ordered: [string, RecallEntry][] = [];
  for (const list of [subject.threads, subject.decided, subject.evidence, subject.observations]) {
    for (const id of newestFirst(index, list)) {
      const found = entryFor(index, id);
      if (found !== null) ordered.push(found);
    }
  }
  return ordered;
}

function render(planned: PlannedLine, titleMax: { recall: number; thread: number }): string {
  return planned.shape === 'recall'
    ? recallLine(planned.entry, titleMax.recall)
    : decidedLine(planned.decisionId, planned.threadId, planned.threadTitle, titleMax.thread);
}

function idsOf(planned: PlannedLine): string[] {
  return planned.shape === 'recall' ? [planned.id] : planned.ids;
}

/**
 * Rules 8–10. `subjectKeys` are the Rule 5 candidates in order; `keywordHits`
 * the Rule 6 ranking; `alreadyFired` the session's memory of subject keys and
 * entry ids (Rule 9). The first subject with an unfired member leads: a
 * `Decided:` line when it has both a current decision and an open thread,
 * else a `Recall:` line for its strongest member; a second line only when it
 * names a different entry — the leading subject's next member, else the top
 * keyword entry. Without a subject, up to two `Recall:` lines from the keyword
 * ranking. The last line carries ` · more: cortex why <key>` when the leading
 * subject holds more unfired members than were shown. Then the budget: titles
 * to 20 characters, then the second line dropped, then the tail.
 */
export function selectPointers(
  index: RecallIndex,
  subjectKeys: string[],
  keywordHits: KeywordHit[],
  alreadyFired: Set<string>,
): PointerSelection {
  const planned: PlannedLine[] = [];
  const named = new Set<string>();
  let leadKey: string | null = null;
  let leadMembers: [string, RecallEntry][] = [];

  const unfired = (pair: [string, RecallEntry]): boolean => !alreadyFired.has(pair[0]);

  for (const key of subjectKeys) {
    if (alreadyFired.has(key)) continue;
    const subject = index.subjects[key];
    if (subject === undefined) continue;
    const members = membersByStrength(index, subject).filter(unfired);
    if (members.length === 0) continue;
    leadKey = key;
    leadMembers = members;
    break;
  }

  const takeNextMember = (): void => {
    const next = leadMembers.find(([id]) => !named.has(id));
    if (next === undefined) return;
    named.add(next[0]);
    planned.push({ shape: 'recall', id: next[0], entry: next[1] });
  };
  const takeKeywordEntry = (): void => {
    for (const hit of keywordHits) {
      if (named.has(hit.id) || alreadyFired.has(hit.id)) continue;
      const entry = index.entries[hit.id];
      if (entry === undefined) continue;
      named.add(hit.id);
      planned.push({ shape: 'recall', id: hit.id, entry });
      return;
    }
  };

  if (leadKey !== null) {
    const thread = leadMembers.find(([, e]) => e.kind === 'thread');
    const decision = leadMembers.find(([, e]) => e.kind === 'decision');
    if (thread !== undefined && decision !== undefined) {
      named.add(thread[0]);
      named.add(decision[0]);
      planned.push({
        shape: 'decided',
        decisionId: decision[0],
        threadId: thread[0],
        threadTitle: thread[1].title,
        ids: [decision[0], thread[0]],
      });
    } else {
      takeNextMember();
    }
    if (planned.length < POINTER_MAX_LINES) {
      const before = planned.length;
      takeNextMember();
      if (planned.length === before) takeKeywordEntry();
    }
  } else {
    while (planned.length < POINTER_MAX_LINES) {
      const before = planned.length;
      takeKeywordEntry();
      if (planned.length === before) break;
    }
  }

  if (planned.length === 0) return { lines: [], fired: [] };

  const shownFromLead = leadMembers.filter(([id]) => named.has(id)).length;
  let tail = leadKey !== null && leadMembers.length > shownFromLead ? moreTail(leadKey) : '';

  // Rule 10: the budget, applied in the spec's order.
  let titleMax = { recall: RECALL_TITLE_MAX, thread: THREAD_TITLE_MAX };
  let kept = planned;
  const renderAll = (): string[] => kept.map((p, i) => render(p, titleMax) + (i === kept.length - 1 ? tail : ''));
  const overBudget = (): boolean => renderAll().join('\n').length > POINTER_BUDGET_CHARS;
  if (overBudget()) titleMax = { recall: BUDGET_TITLE_MAX, thread: BUDGET_TITLE_MAX };
  if (overBudget() && kept.length > 1) kept = kept.slice(0, 1);
  if (overBudget()) tail = '';

  const fired = [...(leadKey === null ? [] : [leadKey]), ...kept.flatMap(idsOf)];
  return { lines: renderAll(), fired };
}

// ---------------------------------------------------------------------------
// 3.4 third revision — the `Open:` line (`hooks.prompt-route` Rule 9; schema §5
// grammar third shape) and the fired memory both hooks share (Rule 8 there,
// `hooks.search-annotate` Rule 9)
// ---------------------------------------------------------------------------

/** Rule 9's key-text width, before the budget cuts it to 40 then 20. */
export const OPEN_TITLE_MAX = 80;
/** Rule 9's onward pointer when more threads qualified than were shown. */
export const THREAD_LIST_TAIL = ' · more: cortex thread list';
/** The Rule 9 budget cuts, in order, after the initial OPEN_TITLE_MAX render. */
const OPEN_BUDGET_CUTS = [THREAD_TITLE_MAX, BUDGET_TITLE_MAX] as const;

/**
 * `Open: <T-NNN> (<YYYY-MM-DD>) <key text cut to titleMax> (<path>)` — the key
 * text whitespace-collapsed and cut on a word boundary with a trailing `…`; the
 * id, the date and the path are never cut. No imperative, no second person, no
 * body beyond the key text (`pulse.usage` Rule 11 counts it by its prefix).
 */
export function openLine(id: string, openedIso: string, keyText: string, relPath: string, titleMax: number = OPEN_TITLE_MAX): string {
  const text = cutTitle(keyText.replace(/\s+/g, ' ').trim(), titleMax);
  return `Open: ${id} (${openedIso.slice(0, 10)}) ${text} (${relPath})`;
}

/** One thread the router wants to name: what `openLine` needs, before the budget. */
export interface OpenLineItem {
  id: string;
  /** iso-datetime (or date) the thread was opened. */
  opened: string;
  /** `keyText(thread)` — the question, offer or approval text, uncut. */
  keyText: string;
  /** The thread file's project-relative POSIX path. */
  relPath: string;
}

/**
 * Rule 9's budget, in the spec's order. Up to POINTER_MAX_LINES lines are
 * rendered at 80; while the joined payload (the tail on the last line when
 * `more`) exceeds POINTER_BUDGET_CHARS: re-render at 40, then 20; then drop
 * the second line — something is now unshown, so `more` becomes true and the
 * tail moves to the first line; then drop the tail. Ids, dates and paths are
 * never cut, so a pathological path can still leave one line over budget —
 * the caller emits it as is rather than truncating a path.
 */
export function fitOpenLines(items: OpenLineItem[], more: boolean): string[] {
  let kept = items.slice(0, POINTER_MAX_LINES);
  if (kept.length === 0) return [];
  let titleMax: number = OPEN_TITLE_MAX;
  let tail = more ? THREAD_LIST_TAIL : '';
  const renderAll = (): string[] => kept.map((it, i) => openLine(it.id, it.opened, it.keyText, it.relPath, titleMax) + (i === kept.length - 1 ? tail : ''));
  const overBudget = (): boolean => renderAll().join('\n').length > POINTER_BUDGET_CHARS;

  for (const cut of OPEN_BUDGET_CUTS) {
    if (!overBudget()) break;
    titleMax = cut;
  }
  if (overBudget() && kept.length > 1) {
    kept = kept.slice(0, 1);
    tail = THREAD_LIST_TAIL;
  }
  if (overBudget()) tail = '';
  return renderAll();
}

/**
 * The per-session fired memory (`pulse/state/recall-fired/<session-id>`):
 * newline-separated subject keys, entry ids and thread ids, blank lines
 * skipped. An absent or unreadable file is the empty set — never a throw.
 * Written by `hooks.search-annotate` Rule 9 and `hooks.prompt-route` Rule 8,
 * read by both, so a thread pointed at by either is pointed at by neither again.
 */
export function readFiredKeys(memPath: string): Set<string> {
  try {
    return new Set(fs.readFileSync(memPath, 'utf-8').split('\n').filter((l) => l.length > 0));
  } catch {
    return new Set();
  }
}
