/**
 * `cortex why <ref> [--json]` and `cortex recall <word…> [--kind k]` — the
 * pull side of recall (spec `recall.why`; schema §4.11 "Consumers"). The
 * pointer lines the hooks inject end with `more: cortex why <ref>`; this is
 * what that promise resolves to: for one subject, the current decisions, the
 * evidence, the open threads and the observation themes the recall index
 * holds, as a short deterministic listing of ids, dates, titles and paths.
 * `recall` is the same index searched by keyword.
 *
 * Index-only (Rule 2): every fact printed is already a name, a date or a path
 * in `.cortex/recall-index.json`, read through the shared loader in
 * `query.ts`. The ONE exception is Rule 4's evidence sub-line: the first three
 * `findings` of each evidence file the listing names, read from that file's
 * frontmatter — bounded by the entries listed, never a directory scan, and
 * `(findings unreadable)` on any failure. No rule body, decision narrative or
 * thread body is ever opened.
 *
 * Exit codes: 0 listed (or "Nothing bears on" / "No matches."), 1 no or
 * malformed index (stderr names the file and `cortex scan`), 2 grammar
 * (one usage line on stderr, nothing on stdout).
 *
 * Deterministic Core (R-001, Rule 7): index read, string matching, sorting,
 * one frontmatter parse per listed evidence file. No LLM, no network, no
 * subprocess; two runs over the same index print the same bytes.
 */
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { RECALL_ENTRY_KINDS, recallIndexPath, type RecallEntry, type RecallEntryKind, type RecallIndex, type RecallSubject } from './index.js';
import { candidateKeys, clearRecallIndexCache, keywordMatches, loadRecallIndex, tokenise } from './query.js';
import { classifyRef, normalisePathRef } from '../schema/refs.js';
import { CLAUSE_REF_RE, SCHEMA_DOC_FILENAME } from '../schema/clauses.js';

export interface RecallCliOptions {
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

/** Rule 6: the keyword listing prints at most this many lines. */
export const RECALL_TOP_N = 5;
/** Rule 4: the evidence sub-line carries at most this many findings. */
export const FINDINGS_SHOWN = 3;

const USAGE_WHY = 'usage: cortex why <ref> [--json]';
const USAGE_RECALL = `usage: cortex recall <word…> [--kind ${RECALL_ENTRY_KINDS.join('|')}]`;
const INDEX_REL = '.cortex/recall-index.json';

// ---------------------------------------------------------------------------
// Rule 1 — grammar
// ---------------------------------------------------------------------------

interface Parsed {
  positional: string[];
  flags: Map<string, string>;
}

/**
 * The thread-cli flag idiom, adapted: boolean flags take no value (so
 * `--json R-001` keeps `R-001` an operand), valued flags take the next token,
 * and an unknown flag is a grammar error. Flags may precede or follow operands.
 */
function parseFlags(argv: string[], booleans: readonly string[], valued: readonly string[]): Parsed | string {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (!a.startsWith('-')) {
      positional.push(a);
      continue;
    }
    if (booleans.includes(a)) {
      flags.set(a, '');
      continue;
    }
    if (valued.includes(a)) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('-')) return `${a} requires a value.`;
      flags.set(a, next);
      i++;
      continue;
    }
    return `unknown flag ${a}.`;
  }
  return { positional, flags };
}

function isKind(v: string): v is RecallEntryKind {
  return (RECALL_ENTRY_KINDS as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Rule 2 — the index
// ---------------------------------------------------------------------------

/** The loaded index, or the exit code (1) after the stderr line. */
function requireIndex(root: string, verb: string, stderr: (line: string) => void): RecallIndex | number {
  // A human verb runs once per process; an earlier cached `null` (or a stale
  // index) from the same process must not outlive the file on disk.
  clearRecallIndexCache();
  const present = fs.existsSync(recallIndexPath(root));
  const index = present ? loadRecallIndex(root) : null;
  if (index !== null) return index;
  stderr(`cortex ${verb}: ${present ? 'malformed' : 'no'} recall index at ${INDEX_REL} — run \`cortex scan\`.`);
  return 1;
}

// ---------------------------------------------------------------------------
// Rule 3 — ref to subject
// ---------------------------------------------------------------------------

interface Resolved {
  /** The subject key shown, or `null` when no candidate is present. */
  key: string | null;
  /** `(<kind>)` in the heading — a ref kind, or `all clauses` for the schema document. */
  kindLabel: string;
  subject: RecallSubject;
}

const EMPTY_SUBJECT: RecallSubject = { decided: [], evidence: [], threads: [], observations: [] };

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

/** The schema document: every `schema:§…` subject (and the path subject, if any) merged into one. */
function aggregateClauses(index: RecallIndex): RecallSubject | null {
  const keys = Object.keys(index.subjects).filter((k) => CLAUSE_REF_RE.test(k) || k === SCHEMA_DOC_FILENAME);
  if (keys.length === 0) return null;
  const merged: RecallSubject = { decided: [], evidence: [], threads: [], observations: [] };
  for (const key of keys) {
    const s = index.subjects[key] as RecallSubject;
    merged.decided.push(...s.decided);
    merged.evidence.push(...s.evidence);
    merged.threads.push(...s.threads);
    merged.observations.push(...s.observations);
  }
  return {
    decided: sortedUnique(merged.decided),
    evidence: sortedUnique(merged.evidence),
    threads: sortedUnique(merged.threads),
    observations: sortedUnique(merged.observations),
  };
}

function resolveSubject(root: string, ref: string, index: RecallIndex): Resolved {
  const kind = classifyRef(ref);
  if (kind === 'path' || ref === SCHEMA_DOC_FILENAME) {
    const rel = normalisePathRef(ref.trim()).replace(/\/+$/, '');
    if (rel === SCHEMA_DOC_FILENAME) {
      const subject = aggregateClauses(index);
      return subject === null
        ? { key: null, kindLabel: 'all clauses', subject: EMPTY_SUBJECT }
        : { key: SCHEMA_DOC_FILENAME, kindLabel: 'all clauses', subject };
    }
    const key = candidateKeys(root, ref, index)[0];
    return key === undefined
      ? { key: null, kindLabel: kind, subject: EMPTY_SUBJECT }
      : { key, kindLabel: classifyRef(key), subject: index.subjects[key] as RecallSubject };
  }
  const subject = index.subjects[ref];
  return subject === undefined ? { key: null, kindLabel: kind, subject: EMPTY_SUBJECT } : { key: ref, kindLabel: kind, subject };
}

// ---------------------------------------------------------------------------
// Rule 4 — the listing
// ---------------------------------------------------------------------------

/** The entry an id in a subject list names; observation themes are keyed `observation.<theme>`. */
function entryFor(index: RecallIndex, id: string): [id: string, entry: RecallEntry] | null {
  const direct = index.entries[id];
  if (direct !== undefined) return [id, direct];
  const themed = index.entries[`observation.${id}`];
  return themed === undefined ? null : [`observation.${id}`, themed];
}

/** The present entries of a list, `date` descending then id ascending. */
function listed(index: RecallIndex, ids: string[]): [id: string, entry: RecallEntry][] {
  const present: [string, RecallEntry][] = [];
  for (const id of [...new Set(ids)]) {
    const found = entryFor(index, id);
    if (found !== null) present.push(found);
  }
  return present.sort(([ia, a], [ib, b]) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : ia < ib ? -1 : ia > ib ? 1 : 0));
}

export interface Finding {
  metric: string;
  value: number | string;
  unit?: string;
}

/**
 * Rule 4's one read outside the index: the first three typed `findings` of an
 * evidence file's frontmatter. `null` when the file is missing, unparseable,
 * or carries no `findings` list.
 */
function readFindings(root: string, entryPath: string): Finding[] | null {
  try {
    const parsed = matter(fs.readFileSync(path.join(root, entryPath), 'utf-8'), {});
    const raw = (parsed.data as Record<string, unknown>)['findings'];
    if (!Array.isArray(raw)) return null;
    const findings: Finding[] = [];
    for (const item of raw.slice(0, FINDINGS_SHOWN)) {
      if (typeof item !== 'object' || item === null) return null;
      const f = item as Record<string, unknown>;
      if (typeof f['metric'] !== 'string') return null;
      if (typeof f['value'] !== 'number' && typeof f['value'] !== 'string') return null;
      const finding: Finding = { metric: f['metric'], value: f['value'] };
      if (typeof f['unit'] === 'string') finding.unit = f['unit'];
      findings.push(finding);
    }
    return findings;
  } catch {
    return null;
  }
}

function findingsLine(findings: Finding[] | null): string | null {
  if (findings === null) return '    (findings unreadable)';
  if (findings.length === 0) return null;
  return '    ' + findings.map((f) => `${f.metric}=${String(f.value)}${f.unit === undefined ? '' : ` ${f.unit}`}`).join('  ');
}

function entryLine(id: string, entry: RecallEntry): string {
  return `  ${entry.date.slice(0, 10)}  ${id} — ${entry.title}  (${entry.path})`;
}

function renderListing(root: string, ref: string, resolved: Resolved, index: RecallIndex): string[] {
  const { key, kindLabel, subject } = resolved;
  const decided = listed(index, subject.decided);
  const evidence = listed(index, subject.evidence);
  const threads = listed(index, subject.threads);
  const observations = listed(index, subject.observations);
  const shown = key === ref ? `${key} (${kindLabel})` : `${key} (${kindLabel}, for ${ref})`;
  const heading = key === SCHEMA_DOC_FILENAME ? `${SCHEMA_DOC_FILENAME} (all clauses)` : shown;
  const lines = [
    `${heading} — ${decided.length} decided · ${evidence.length} evidence · ${threads.length} open · ${observations.length} observation themes`,
  ];
  if (decided.length > 0) lines.push('Decided:', ...decided.map(([id, e]) => entryLine(id, e)));
  if (evidence.length > 0) {
    lines.push('Evidence:');
    for (const [id, e] of evidence) {
      lines.push(entryLine(id, e));
      const sub = findingsLine(readFindings(root, e.path));
      if (sub !== null) lines.push(sub);
    }
  }
  if (threads.length > 0) lines.push('Open:', ...threads.map(([id, e]) => `  ${id}  ${e.kind} — ${e.title}  (${e.path})`));
  if (observations.length > 0) lines.push(`Observations: ${observations.map(([id]) => id.replace(/^observation\./, '')).join(', ')}`);
  return lines;
}

// ---------------------------------------------------------------------------
// Rule 5 — --json
// ---------------------------------------------------------------------------

/** Plain objects with their keys inserted in sorted order, recursively — `JSON.stringify` then emits sorted keys. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) out[k] = sortKeys((value as Record<string, unknown>)[k]);
    return out;
  }
  return value;
}

function renderJson(root: string, ref: string, resolved: Resolved, index: RecallIndex): string {
  const { key, subject } = resolved;
  const entries: Record<string, RecallEntry> = {};
  const findings: Record<string, Finding[]> = {};
  for (const list of [subject.decided, subject.evidence, subject.threads, subject.observations]) {
    for (const [id, entry] of listed(index, list)) entries[id] = entry;
  }
  for (const [id, entry] of listed(index, subject.evidence)) findings[id] = readFindings(root, entry.path) ?? [];
  const subjectOut: RecallSubject = key === null ? EMPTY_SUBJECT : subject;
  // The sink terminates the document — Rule 5's trailing newline.
  return JSON.stringify(sortKeys({ ref, key, subject: subjectOut, entries, findings }), null, 2);
}

// ---------------------------------------------------------------------------
// the verbs
// ---------------------------------------------------------------------------

function whyVerb(argv: string[], root: string, stdout: (l: string) => void, stderr: (l: string) => void): number {
  const parsed = parseFlags(argv, ['--json'], []);
  if (typeof parsed === 'string') return grammar('why', parsed, USAGE_WHY, stderr);
  const [ref, extra] = parsed.positional;
  if (ref === undefined) return grammar('why', 'missing <ref>.', USAGE_WHY, stderr);
  if (extra !== undefined) return grammar('why', `one <ref> expected (got "${parsed.positional.join(' ')}").`, USAGE_WHY, stderr);

  const index = requireIndex(root, 'why', stderr);
  if (typeof index === 'number') return index;

  const resolved = resolveSubject(root, ref, index);
  if (parsed.flags.has('--json')) {
    stdout(renderJson(root, ref, resolved, index));
    return 0;
  }
  if (resolved.key === null) {
    stdout(`Nothing bears on ${ref}.`);
    return 0;
  }
  for (const line of renderListing(root, ref, resolved, index)) stdout(line);
  return 0;
}

function recallVerb(argv: string[], root: string, stdout: (l: string) => void, stderr: (l: string) => void): number {
  const parsed = parseFlags(argv, [], ['--kind']);
  if (typeof parsed === 'string') return grammar('recall', parsed, USAGE_RECALL, stderr);
  if (parsed.positional.length === 0) return grammar('recall', 'missing <word…>.', USAGE_RECALL, stderr);
  const kindValue = parsed.flags.get('--kind');
  let kind: RecallEntryKind | undefined;
  if (kindValue !== undefined) {
    if (!isKind(kindValue)) return grammar('recall', `--kind must be one of ${RECALL_ENTRY_KINDS.join('|')} (got "${kindValue}").`, USAGE_RECALL, stderr);
    kind = kindValue;
  }

  const index = requireIndex(root, 'recall', stderr);
  if (typeof index === 'number') return index;

  const { tokens, refs } = tokenise(parsed.positional.join(' '), index);
  const hits = keywordMatches(index, tokens, refs, kind).slice(0, RECALL_TOP_N);
  if (hits.length === 0) {
    stdout('No matches.');
    return 0;
  }
  for (const { id } of hits) {
    const entry = index.entries[id] as RecallEntry;
    stdout(`${entry.kind} ${entry.date.slice(0, 10)} ${id} — ${entry.title} (${entry.path})`);
  }
  return 0;
}

function grammar(verb: string, message: string, usage: string, stderr: (l: string) => void): number {
  stderr(`cortex ${verb}: ${message} ${usage}`);
  return 2;
}

/**
 * Entry point: `argv[0]` is the verb (`why` or `recall`) as the dispatcher
 * passes it through; the rest is the verb's own grammar. Returns the exit code.
 */
export async function recallCli(argv: string[], root = '.', opts: RecallCliOptions = {}): Promise<number> {
  const stdout = opts.stdout ?? ((line: string) => console.log(line));
  const stderr = opts.stderr ?? ((line: string) => console.error(line));
  const [verb, ...rest] = argv;
  if (verb === 'why') return whyVerb(rest, root, stdout, stderr);
  if (verb === 'recall') return recallVerb(rest, root, stdout, stderr);
  stderr(`cortex recall: unknown verb "${verb ?? ''}". ${USAGE_WHY} | ${USAGE_RECALL}`);
  return 2;
}
