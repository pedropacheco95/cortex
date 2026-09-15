/**
 * The recall index compiler — `.cortex/recall-index.json` (schema §4.11, new
 * at 3.4; spec `recall.recall-index`).
 *
 * `bears_on` (§6) is the forward edge from a conclusion to the subject it
 * constrains. A session starts from the other end — "what bears on R-001, on
 * this file, on §5?" — so the inversion is compiled ONCE, here, into one JSON
 * file next to `constellation.json`: per subject, the current decisions, the
 * evidence, the open threads and the observation themes that bear on it, plus
 * a title-and-keywords row per scanned artefact. The three entailment rules
 * live here and nowhere else:
 *
 *   1. current decisions only — a decision another decision's `supersedes`
 *      resolves to keeps its `entries` row and reaches no subject;
 *   2. open threads only — answered / dropped / expired threads keep their
 *      row and reach no subject;
 *   3. evidence is inherited through the decision that cites it (`sources:`
 *      under `atlas/evidence/`, the decision current or not) and directly;
 *      evidence another evidence file's `supersedes` resolves to is dropped
 *      from every `evidence` list in favour of its superseder.
 *
 * Observations contribute their theme with no currency condition. Transitive
 * `depends_on` is deliberately NOT closed over (Rule 7).
 *
 * Inputs (each optional; absent → nothing, never an error): `atlas/decisions`,
 * `atlas/evidence`, `pulse/threads`, `insight/observations`; the project index
 * and the clause index for resolution. Unparseable frontmatter and a
 * `bears_on` that is not a list of strings skip the file (Rule 10). A ref that
 * does not resolve produces no subject and is counted in `droppedRefs` —
 * complaining is `check.bears-on`'s job, not this compiler's.
 *
 * WRITES `.cortex/recall-index.json` — nothing else, ever (`writeRecallIndex`).
 * Builders: `cortex scan`, `cortex init`, the post-commit fast tier. `cortex
 * validate` only reads it (`check.recall-index`). Deterministic (R-001, Rule 9):
 * sorted keys, sorted and deduplicated lists, byte-identical modulo `generated`.
 * Evidence files are read by frontmatter only — nothing here imports from
 * `src/atlas/`.
 */
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { buildIndex, type ProjectIndex } from '../schema/index-build.js';
import { loadClauseIndex, type ClauseIndex } from '../schema/clauses.js';
import { normalisePathRef, resolveRef } from '../schema/refs.js';
import { SUPPORTED_VERSION } from '../schema/version.js';
import { keyText, listThreads, THREADS_DIR } from '../pulse/threads.js';

// ---------------------------------------------------------------------------
// shape (spec Rule 1, schema §4.11)
// ---------------------------------------------------------------------------

export const RECALL_ENTRY_KINDS = ['decision', 'evidence', 'thread', 'observation'] as const;
export type RecallEntryKind = (typeof RECALL_ENTRY_KINDS)[number];

export interface RecallSubject {
  /** Decision ids — current decisions only (entailment 1). */
  decided: string[];
  /** Evidence ids — direct and inherited through citing decisions, superseded files removed (entailment 3). */
  evidence: string[];
  /** Thread ids — open threads only (entailment 2). */
  threads: string[];
  /** Observation themes (the entry file's stem). */
  observations: string[];
}

export interface RecallEntry {
  kind: RecallEntryKind;
  title: string;
  /** Project-relative POSIX path. */
  path: string;
  /** `date` (decision, evidence), `opened` (thread) or `updated` (observation), as an iso string. */
  date: string;
  /** Title tokens (lowercase, ≥3 chars) plus every `bears_on` ref verbatim — sorted, deduplicated; never body text. */
  keywords: string[];
}

export interface RecallIndex {
  schemaVersion: string;
  generated: string;
  subjects: Record<string, RecallSubject>;
  entries: Record<string, RecallEntry>;
  counters: { subjects: number; entries: number; droppedRefs: number };
}

/** One scanned artefact, before inversion. `supersedes` and `sources` are resolved absolute paths. */
export interface Carrier {
  kind: RecallEntryKind;
  id: string;
  /** Project-relative POSIX path. */
  path: string;
  absPath: string;
  date: string;
  title: string;
  bearsOn: string[];
  /** Absolute paths this artefact's `supersedes` entries resolve to (relative to the file). */
  supersedes: string[];
  /** Absolute paths this artefact's `sources` entries resolve to (relative to the file). */
  sources: string[];
  /** Thread status — only threads carry one. */
  status?: string;
  /** Observation theme — only observations carry one. */
  theme?: string;
}

export const RECALL_INDEX_FILE = 'recall-index.json';

/** The absolute path of the index file for `root`. */
export function recallIndexPath(root: string): string {
  return path.join(root, '.cortex', RECALL_INDEX_FILE);
}

const DECISIONS_DIR = ['.cortex', 'atlas', 'decisions'];
const EVIDENCE_DIR = ['.cortex', 'atlas', 'evidence'];
const OBSERVATIONS_DIR = ['.cortex', 'insight', 'observations'];
const OBSERVATION_ID_PREFIX = 'observation.';
/** Rule 8: a thread's key text is cut to this many characters. */
const THREAD_TITLE_MAX = 80;
/** Rule 8: title tokens shorter than this are dropped. */
const KEYWORD_MIN_CHARS = 3;
/**
 * gray-matter caches the file object BEFORE parsing when called without
 * options, so a frontmatter that threw on its first parse (e.g. inside
 * `buildIndex`) comes back as empty data on the second. Any options object
 * bypasses that cache; the compiler must see the throw itself (Rule 10).
 */
const NO_CACHE = {};

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

function toPosixRelative(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join('/');
}

/** `*.md` entry files directly under `dir`, sorted; `_index.md` excluded; absent dir → []. */
function entryFiles(dir: string): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== '_index.md')
      .map((e) => e.name);
  } catch {
    return [];
  }
  return names.sort().map((name) => path.join(dir, name));
}

/** iso string out of a YAML scalar (js-yaml turns unquoted timestamps into Dates); '' when absent or unusable. */
function isoOf(v: unknown): string {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString();
  if (typeof v === 'string') return v;
  return '';
}

/** A list of strings, `undefined` for absent, `null` for any other shape. */
function stringListOf(v: unknown): string[] | null | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) return null;
  return v.every((e) => typeof e === 'string') ? (v as string[]) : null;
}

/** Entries of a list field resolved as paths relative to the carrier file (absolute), non-strings ignored. */
function relativePathsOf(filePath: string, v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((e): e is string => typeof e === 'string' && e !== '').map((e) => path.resolve(path.dirname(filePath), e));
}

function sortedUnique(items: string[]): string[] {
  return [...new Set(items)].sort();
}

// ---------------------------------------------------------------------------
// carriers (Rules 8, 10)
// ---------------------------------------------------------------------------

/** The two atlas carriers share one frontmatter shape: id, title, date, bears_on, supersedes, sources. */
function scanAtlasKind(root: string, kind: 'decision' | 'evidence', dirParts: string[]): Carrier[] {
  const out: Carrier[] = [];
  for (const filePath of entryFiles(path.join(root, ...dirParts))) {
    let data: Record<string, unknown>;
    try {
      data = matter(fs.readFileSync(filePath, 'utf-8'), NO_CACHE).data as Record<string, unknown>;
    } catch {
      continue; // unparseable frontmatter → skipped (Rule 10)
    }
    if (typeof data !== 'object' || data === null) continue;
    const bearsOn = stringListOf(data['bears_on']);
    if (bearsOn === null) continue; // not a list of strings → skipped (Rule 10)
    const stem = path.basename(filePath, '.md');
    const id = typeof data['id'] === 'string' && data['id'] !== '' ? data['id'] : `${kind}.${stem}`;
    out.push({
      kind,
      id,
      path: toPosixRelative(root, filePath),
      absPath: filePath,
      date: isoOf(data['date']),
      title: typeof data['title'] === 'string' ? data['title'] : stem,
      bearsOn: bearsOn ?? [],
      supersedes: relativePathsOf(filePath, data['supersedes']),
      sources: relativePathsOf(filePath, data['sources']),
    });
  }
  return out;
}

function scanThreads(root: string): Carrier[] {
  const dir = path.join(root, '.cortex', ...THREADS_DIR.split('/'));
  // Filename per id — `listThreads` parses but does not report the file it read.
  const fileOf = new Map<string, string>();
  for (const filePath of entryFiles(dir)) {
    const m = /^(T-\d{3,})-/.exec(path.basename(filePath));
    if (m?.[1] !== undefined && !fileOf.has(m[1])) fileOf.set(m[1], filePath);
  }
  const out: Carrier[] = [];
  for (const t of listThreads(root).threads) {
    const filePath = fileOf.get(t.id);
    if (filePath === undefined) continue;
    out.push({
      kind: 'thread',
      id: t.id,
      path: toPosixRelative(root, filePath),
      absPath: filePath,
      date: t.opened,
      title: keyText(t).replace(/\s+/g, ' ').trim().slice(0, THREAD_TITLE_MAX),
      bearsOn: t.bears_on,
      supersedes: [],
      sources: [],
      status: t.status,
    });
  }
  return out;
}

function scanObservations(root: string): Carrier[] {
  const out: Carrier[] = [];
  for (const filePath of entryFiles(path.join(root, ...OBSERVATIONS_DIR))) {
    let data: Record<string, unknown>;
    try {
      data = matter(fs.readFileSync(filePath, 'utf-8'), NO_CACHE).data as Record<string, unknown>;
    } catch {
      continue;
    }
    if (typeof data !== 'object' || data === null) continue;
    const bearsOn = stringListOf(data['bears_on']);
    if (bearsOn === null) continue;
    const theme = path.basename(filePath, '.md');
    out.push({
      kind: 'observation',
      id: `${OBSERVATION_ID_PREFIX}${theme}`,
      path: toPosixRelative(root, filePath),
      absPath: filePath,
      date: isoOf(data['updated']),
      title: theme,
      bearsOn: bearsOn ?? [],
      supersedes: [],
      sources: [],
      theme,
    });
  }
  return out;
}

/** Every scannable artefact of the four kinds, in kind order then path order. Absent directories contribute nothing. */
export function scanCarriers(root: string): Carrier[] {
  const absRoot = path.resolve(root);
  return [
    ...scanAtlasKind(absRoot, 'decision', DECISIONS_DIR),
    ...scanAtlasKind(absRoot, 'evidence', EVIDENCE_DIR),
    ...scanThreads(absRoot),
    ...scanObservations(absRoot),
  ];
}

/**
 * Rule 8 keywords: the title's lowercase tokens of `KEYWORD_MIN_CHARS` or
 * more characters split on non-alphanumerics, plus every `bears_on` ref
 * verbatim (resolving or not) — sorted, deduplicated. Never body text.
 */
export function keywordsOf(title: string, bearsOn: string[]): string[] {
  const tokens = title.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= KEYWORD_MIN_CHARS);
  return sortedUnique([...tokens, ...bearsOn]);
}

/** One `entries` row (Rule 8). */
export function entryOf(carrier: Carrier): RecallEntry {
  return {
    kind: carrier.kind,
    title: carrier.title,
    path: carrier.path,
    date: carrier.date,
    keywords: keywordsOf(carrier.title, carrier.bearsOn),
  };
}

// ---------------------------------------------------------------------------
// assembly (Rules 1–7, 9)
// ---------------------------------------------------------------------------

function readSchemaVersion(root: string): string {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(root, '.cortex', 'cortex.config.json'), 'utf-8')) as Record<string, unknown>;
    if (typeof config['schemaVersion'] === 'string' && config['schemaVersion'] !== '') return config['schemaVersion'];
  } catch {
    /* absent or unreadable config → the package's version */
  }
  return SUPPORTED_VERSION;
}

function emptySubject(): RecallSubject {
  return { decided: [], evidence: [], threads: [], observations: [] };
}

/** Rule 2: the subject keys a carrier's refs resolve to (path refs normalised), and how many did not resolve. */
function subjectsOf(root: string, index: ProjectIndex, clauses: ClauseIndex, carrier: Carrier): { keys: string[]; dropped: number } {
  const keys: string[] = [];
  let dropped = 0;
  for (const ref of carrier.bearsOn) {
    if (ref === '') {
      dropped++;
      continue;
    }
    const { kind, resolved } = resolveRef(root, index, clauses, ref);
    if (!resolved) {
      dropped++;
      continue;
    }
    keys.push(kind === 'path' ? normalisePathRef(ref) : ref);
  }
  return { keys: sortedUnique(keys), dropped };
}

export interface CompileRecallOptions {
  /** The `generated` timestamp; defaults to now. */
  now?: Date;
}

/** Pure assembly (Rule 11): reads the four carriers and the two resolvers, writes nothing. */
export async function compileRecallIndex(root: string, opts: CompileRecallOptions = {}): Promise<RecallIndex> {
  const absRoot = path.resolve(root);
  const index = await buildIndex(absRoot);
  const clauses = loadClauseIndex(absRoot);
  const carriers = scanCarriers(absRoot);

  const decisions = carriers.filter((c) => c.kind === 'decision');
  const evidence = carriers.filter((c) => c.kind === 'evidence');
  const evidenceByPath = new Map(evidence.map((e) => [e.absPath, e]));

  // Entailment 1 and 3's supersession sets — one hop each, by resolved path.
  const supersededDecisions = new Set(decisions.flatMap((d) => d.supersedes));
  const supersededEvidence = new Set(evidence.flatMap((e) => e.supersedes));

  const subjects: Record<string, RecallSubject> = {};
  const entries: Record<string, RecallEntry> = {};
  let droppedRefs = 0;

  const subjectOf = (key: string): RecallSubject => {
    const existing = subjects[key];
    if (existing !== undefined) return existing;
    const created = emptySubject();
    subjects[key] = created;
    return created;
  };

  const resolvedKeys = new Map<Carrier, string[]>();
  for (const carrier of carriers) {
    entries[carrier.id] = entryOf(carrier);
    const { keys, dropped } = subjectsOf(absRoot, index, clauses, carrier);
    droppedRefs += dropped;
    resolvedKeys.set(carrier, keys);

    for (const key of keys) {
      const subject = subjectOf(key); // a resolving ref is a subject key (Rule 2), contribution or not
      switch (carrier.kind) {
        case 'decision':
          if (!supersededDecisions.has(carrier.absPath)) subject.decided.push(carrier.id);
          break;
        case 'thread':
          if (carrier.status === 'open') subject.threads.push(carrier.id);
          break;
        case 'evidence':
          if (!supersededEvidence.has(carrier.absPath)) subject.evidence.push(carrier.id);
          break;
        case 'observation':
          if (carrier.theme !== undefined) subject.observations.push(carrier.theme);
          break;
      }
    }
  }

  // Entailment 3, the inherited half: a decision's `sources:` under atlas/evidence/
  // carries that evidence to every subject the decision bears on — current or not.
  for (const decision of decisions) {
    const keys = resolvedKeys.get(decision) ?? [];
    if (keys.length === 0) continue;
    for (const source of decision.sources) {
      const cited = evidenceByPath.get(source);
      if (cited === undefined || supersededEvidence.has(cited.absPath)) continue;
      for (const key of keys) subjectOf(key).evidence.push(cited.id);
    }
  }

  // Rule 9: sorted keys, sorted and deduplicated lists.
  const sortedSubjects: Record<string, RecallSubject> = {};
  for (const key of Object.keys(subjects).sort()) {
    const s = subjects[key] as RecallSubject;
    sortedSubjects[key] = {
      decided: sortedUnique(s.decided),
      evidence: sortedUnique(s.evidence),
      threads: sortedUnique(s.threads),
      observations: sortedUnique(s.observations),
    };
  }
  const sortedEntries: Record<string, RecallEntry> = {};
  for (const key of Object.keys(entries).sort()) sortedEntries[key] = entries[key] as RecallEntry;

  return {
    schemaVersion: readSchemaVersion(absRoot),
    generated: (opts.now ?? new Date()).toISOString(),
    subjects: sortedSubjects,
    entries: sortedEntries,
    counters: {
      subjects: Object.keys(sortedSubjects).length,
      entries: Object.keys(sortedEntries).length,
      droppedRefs,
    },
  };
}

/** Assemble and write `.cortex/recall-index.json` (two-space indent, trailing newline) — the only write this module makes. */
export async function writeRecallIndex(root: string, opts: CompileRecallOptions = {}): Promise<RecallIndex> {
  const absRoot = path.resolve(root);
  const recall = await compileRecallIndex(absRoot, opts);
  fs.mkdirSync(path.join(absRoot, '.cortex'), { recursive: true });
  fs.writeFileSync(recallIndexPath(absRoot), JSON.stringify(recall, null, 2) + '\n', 'utf-8');
  return recall;
}
