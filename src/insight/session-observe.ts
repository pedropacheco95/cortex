/**
 * `cortex loop-session-observe` — the v3 successor to v2's insight-gaps loop
 * (spec insight.session-observe; design §9, §8.2). Deterministic Core
 * bookends around the agentic middle run by the shipped
 * `skills/cortex-loop-session-observe/` bundle:
 *
 *  - `--collect` REUSES the shared session corpus (`pulse/state/session-corpus.json`,
 *    the same file `cortex pulse-distil --collect` builds — spec Rule 1: shared
 *    machinery, never double-built; a missing corpus is collected via distil's
 *    own `collectCorpus`). It emits a worklist of corpus sessions not yet
 *    observed (tracked in `pulse/state/session-observe-state.json`) for the
 *    in-session judgment.
 *  - `--apply [--proposals <f>]` audits the skill's ungated enrichments —
 *    touched per-file entries must still parse (§4.10.2), only the
 *    `## Insights` / `## Query pointers` sections may differ from the git
 *    baseline (spec Rule 2: `## Purpose` / `## Main players` / `## File map`
 *    / `## Connections` are extraction-owned), and every appended line must
 *    carry a trailing `(claude-sessions/<user>/<id>)` provenance marker
 *    (schema §4.10.2, A6). It verifies the loop-write invariant (spec Rule 5 /
 *    RULES 7): no direct working-tree change under `.cortex/compass/`,
 *    `.cortex/atlas/`, or `RULES.md`. Gated candidates from the skill's
 *    proposals JSON are validated, dismissal-suppressed (spec Rule 7), given
 *    S-ids from the shared counter, and written as typed §4.5.1 sections
 *    (`rule-candidate` → compass, `decision-candidate` → atlas/decisions)
 *    into the always-write report `pulse/reports/session-observe.md`; still-pending
 *    prior sections are carried forward verbatim. Finally the observed-state
 *    file advances.
 *
 * Core halves are deterministic — no LLM here, ever (spec Rule 8, R-001).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import type { SessionKind } from '../pulse/distil.js';
import {
  collectCorpus,
  CORPUS_FILE,
  readPendingSections,
  readUnexpiredDismissals,
  isDismissed,
  normaliseText,
  type SessionCorpus,
  readCorpus,
  refreshCorpus,
} from '../pulse/distil.js';
import { allocateSuggestionIds } from '../pulse/suggestion-ids.js';
import { chooseOuterFence } from '../pulse/fences.js';
import { writePulseReport } from '../loops/report.js';
import { parseEntry } from './entry.js';
import { checkInsightObservations } from '../schema/checks/insight.js';

export const SESSION_OBSERVE_WORKLIST_FILE = 'session-observe-worklist.json';
export const SESSION_OBSERVE_STATE_FILE = 'session-observe-state.json';
export const SESSION_OBSERVE_REPORT_FILE = 'session-observe.md';
export const SESSION_OBSERVE_REPORT_KIND = 'pulse-session-observe';
export const SESSION_OBSERVE_LOOP_NAME = 'cortex-loop-session-observe';

/** Extraction-owned sections this loop must never change (spec Rule 2). */
export const EXTRACTION_OWNED_SECTIONS = ['Purpose', 'Main players', 'File map', 'Connections'] as const;
/** The two sections this loop may enrich directly (§4.10.2, addendum A7.3). */
export const LOOP_WRITABLE_SECTIONS = ['Insights', 'Query pointers'] as const;

/**
 * The per-item provenance trailer an enrichment line must end with
 * (spec AC "provenance trailer"; exact syntax is this implementation's call):
 * `... (claude-sessions/<user>/<session-id>)`.
 */
export const PROVENANCE_TRAILER_RE = /\(claude-sessions\/[^/\s)]+\/[^/\s)]+\)\s*$/;

/** Machine working state (worklist, observed-state, shared corpus) under
 *  `pulse/state/`; the report lands under `pulse/reports/` (pulse reorg). */
function stateDir(root: string): string {
  return path.join(root, '.cortex', 'pulse', 'state');
}
function reportsDir(root: string): string {
  return path.join(root, '.cortex', 'pulse', 'reports');
}

// ---------------------------------------------------------------------------
// observed-state file
// ---------------------------------------------------------------------------

/** Spec Rule 13: an unclaimed worklist session is marked observed anyway on this many unclaimed applies. */
export const OBSERVE_MAX_ATTEMPTS = 3;

export interface ObserveState {
  kind: 'session-observe-state';
  updated: string;
  /** Session ids already observed by a completed apply. */
  observed: string[];
  /** Spec Rule 13: worklist sessions left unclaimed → how many applies passed them over (absent in older files → 0). */
  attempts: Record<string, number>;
}

export function readObserveState(root: string): ObserveState {
  const p = path.join(stateDir(root), SESSION_OBSERVE_STATE_FILE);
  try {
    const doc = JSON.parse(fs.readFileSync(p, 'utf-8')) as Partial<ObserveState>;
    if (doc.kind === 'session-observe-state' && Array.isArray(doc.observed)) {
      const attempts: Record<string, number> = {};
      if (typeof doc.attempts === 'object' && doc.attempts !== null) {
        for (const [id, n] of Object.entries(doc.attempts)) {
          if (typeof n === 'number' && Number.isFinite(n) && n > 0) attempts[id] = Math.floor(n);
        }
      }
      return {
        kind: 'session-observe-state',
        updated: doc.updated ?? '',
        observed: doc.observed.filter((s): s is string => typeof s === 'string'),
        attempts,
      };
    }
  } catch {
    /* missing/unparseable → fresh state */
  }
  return { kind: 'session-observe-state', updated: '', observed: [], attempts: {} };
}

function writeObserveState(root: string, observed: string[], attempts: Record<string, number>, nowIso: string): void {
  fs.mkdirSync(stateDir(root), { recursive: true });
  const state: ObserveState = {
    kind: 'session-observe-state',
    updated: nowIso,
    observed: [...new Set(observed)].sort(),
    attempts: Object.fromEntries(Object.entries(attempts).sort(([a], [b]) => a.localeCompare(b))),
  };
  fs.writeFileSync(path.join(stateDir(root), SESSION_OBSERVE_STATE_FILE), JSON.stringify(state, null, 2) + '\n', 'utf-8');
}

// ---------------------------------------------------------------------------
// collect — deterministic first bookend (spec Rules 1, 8)
// ---------------------------------------------------------------------------

export interface ObserveWorklistSession {
  id: string;
  mtime: string;
  /** Spec Rule 12: how the session was driven; the worklist lists `interactive` first. */
  kind: SessionKind;
  message_count: number;
}

export interface ObserveWorklist {
  kind: 'session-observe-worklist';
  generated: string;
  /** The shared corpus this worklist was derived from. */
  corpus_generated: string;
  /** True when an existing corpus was reused (and refreshed, spec Rule 11) rather than rebuilt. */
  corpus_reused: boolean;
  /** Spec Rule 11: sessions the refresh appended to a reused corpus (0 when rebuilt). */
  corpus_appended: number;
  sessions: ObserveWorklistSession[];
}

export function observeWorklistPath(root: string): string {
  return path.join(stateDir(root), SESSION_OBSERVE_WORKLIST_FILE);
}

export function readObserveWorklist(root: string): ObserveWorklist | null {
  const p = observeWorklistPath(root);
  if (!fs.existsSync(p)) return null;
  try {
    const doc = JSON.parse(fs.readFileSync(p, 'utf-8')) as ObserveWorklist;
    return doc.kind === 'session-observe-worklist' ? doc : null;
  } catch {
    return null;
  }
}

export interface ObserveCollectOptions {
  home?: string;
  now?: Date;
}

export interface ObserveCollectResult {
  worklistPath: string;
  sessions: number;
  alreadyObserved: number;
  corpusReused: boolean;
  /** Spec Rule 11: sessions appended to a reused corpus by the refresh. */
  corpusAppended: number;
}

/**
 * Reuse the shared corpus — refreshed with every session newer than its
 * `generated` stamp (spec Rule 11, distil's `refreshCorpus`), built via
 * distil's `collectCorpus` only when absent (one corpus, two readers, spec
 * Rule 1) — and emit the worklist of sessions not yet observed, interactive
 * sessions first (spec Rule 12).
 */
export function collectObserve(root: string, opts: ObserveCollectOptions = {}): ObserveCollectResult {
  const absRoot = path.resolve(root);
  const now = opts.now ?? new Date();
  const corpusOpts = { now, ...(opts.home !== undefined ? { home: opts.home } : {}) };

  const refreshed = refreshCorpus(absRoot, corpusOpts);
  const corpusReused = refreshed !== null;
  let corpus: SessionCorpus | null = refreshed?.corpus ?? null;
  if (corpus === null) {
    collectCorpus(absRoot, corpusOpts);
    corpus = readCorpus(absRoot);
  }
  if (corpus === null) {
    throw new Error(`could not build or read the shared session corpus (.cortex/pulse/state/${CORPUS_FILE})`);
  }

  const observed = new Set(readObserveState(absRoot).observed);
  const unobserved: ObserveWorklistSession[] = corpus.sessions
    .filter((s) => !observed.has(s.id))
    .map((s) => ({ id: s.id, mtime: s.mtime, kind: s.kind, message_count: s.messages.length }));
  // Interactive first, corpus order preserved within each kind (stable partition).
  const sessions = [...unobserved.filter((s) => s.kind === 'interactive'), ...unobserved.filter((s) => s.kind !== 'interactive')];

  const worklist: ObserveWorklist = {
    kind: 'session-observe-worklist',
    generated: now.toISOString(),
    corpus_generated: corpus.generated,
    corpus_reused: corpusReused,
    corpus_appended: refreshed?.appended ?? 0,
    sessions,
  };
  fs.mkdirSync(stateDir(absRoot), { recursive: true });
  const p = observeWorklistPath(absRoot);
  fs.writeFileSync(p, JSON.stringify(worklist, null, 2) + '\n', 'utf-8');
  return {
    worklistPath: p,
    sessions: sessions.length,
    alreadyObserved: corpus.sessions.length - sessions.length,
    corpusReused,
    corpusAppended: refreshed?.appended ?? 0,
  };
}

// ---------------------------------------------------------------------------
// entry section-boundary audit (spec Rule 2 / "extraction-owned" AC)
// ---------------------------------------------------------------------------

interface EntrySplit {
  /** The raw frontmatter block (`---`…`---`), '' when absent. */
  frontmatter: string;
  /** `## <name>` → the section's exact text (heading line through the line before the next `## `). */
  sections: Map<string, string>;
}

/** Byte-preserving split of an entry into frontmatter + `## ` sections. */
export function splitEntrySections(raw: string): EntrySplit {
  let frontmatter = '';
  let body = raw;
  const fm = /^---\r?\n[\s\S]*?\r?\n---/.exec(raw);
  if (fm) {
    frontmatter = fm[0];
    body = raw.slice(fm[0].length);
  }
  const lines = body.split('\n');
  const sections = new Map<string, string>();
  let currentName: string | null = null;
  let start = 0;
  const close = (end: number): void => {
    if (currentName !== null) sections.set(currentName, lines.slice(start, end).join('\n'));
  };
  for (let i = 0; i < lines.length; i++) {
    const m = /^##\s+(.+?)\s*$/.exec(lines[i] as string);
    if (m?.[1]) {
      close(i);
      currentName = m[1];
      start = i;
    }
  }
  close(lines.length);
  return { frontmatter, sections };
}

/** Non-blank lines present in `current` but not in `baseline` (set difference). */
function addedLines(baseline: string | undefined, current: string | undefined): string[] {
  const base = new Set((baseline ?? '').split('\n').map((l) => l.trim()));
  return (current ?? '')
    .split('\n')
    .filter((l) => l.trim() !== '' && !/^##\s/.test(l) && !base.has(l.trim()));
}

// ---------------------------------------------------------------------------
// git working-tree inspection (baseline = HEAD; deterministic file I/O)
// ---------------------------------------------------------------------------

function isGitRepo(absRoot: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: absRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

interface StatusEntry {
  status: string;
  rel: string;
}

function gitStatus(absRoot: string, pathspecs: string[]): StatusEntry[] {
  try {
    const out = execFileSync('git', ['status', '--porcelain', '--', ...pathspecs], {
      cwd: absRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out
      .split('\n')
      .filter((l) => l.length > 3)
      .map((line) => {
        let rel = line.slice(3);
        const arrow = rel.indexOf(' -> ');
        if (arrow >= 0) rel = rel.slice(arrow + 4);
        return { status: line.slice(0, 2), rel };
      });
  } catch {
    return [];
  }
}

function gitShowHead(absRoot: string, rel: string): string | null {
  try {
    return execFileSync('git', ['show', `HEAD:${rel}`], {
      cwd: absRoot,
      encoding: 'utf-8',
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

/** True for a per-file understanding entry path (flat or scoped layout). */
function isEntryPath(rel: string): boolean {
  if (!rel.endsWith('.md')) return false;
  return /^\.cortex\/insight\/(anatomy|scopes\/[^/]+\/anatomy)\//.test(rel);
}

// ---------------------------------------------------------------------------
// enrichment audit (spec Rules 2, 5)
// ---------------------------------------------------------------------------

export interface EnrichmentAudit {
  /** Modified entries that passed all checks. */
  valid: string[];
  /** Boundary/parse/provenance violations (each fails the run). */
  violations: string[];
  /** Non-fatal observations (no baseline, untracked entries, no git repo). */
  notes: string[];
}

/**
 * Audit the working tree after the skill's ungated writes: touched entries
 * still parse (§4.10.2); frontmatter and extraction-owned sections are
 * byte-identical to the HEAD baseline; every line added to `## Insights` /
 * `## Query pointers` carries the claude-sessions provenance trailer; every
 * `insight/observations/` entry file still satisfies the §4.10.11 frontmatter
 * shape (spec Rule 2, reusing check.insight-observations — the same contract
 * the standalone validator enforces, never re-implemented here); and no gated
 * path (`compass/`, `atlas/`, `RULES.md`) was touched directly.
 */
export function auditEnrichments(absRoot: string): EnrichmentAudit {
  const audit: EnrichmentAudit = { valid: [], violations: [], notes: [] };

  if (!isGitRepo(absRoot)) {
    audit.notes.push('not a git repository — no baseline available; the section-boundary audit was skipped.');
    return audit;
  }

  // Loop-write invariant (spec Rule 5 / RULES 7): gated roots must be clean.
  for (const entry of gitStatus(absRoot, ['.cortex/compass', '.cortex/atlas', 'RULES.md'])) {
    audit.violations.push(
      `gated path modified directly: ${entry.rel} (${entry.status.trim() || 'changed'}) — ` +
        'this loop proposes via pulse, never writes compass/atlas/RULES.md (RULES 7).',
    );
  }

  // Project-context observations (spec Rule 2, schema §4.10.11): whatever the
  // loop wrote this run must still satisfy the per-entry frontmatter shape —
  // reuse the validator check wholesale rather than re-deriving its rules.
  for (const violation of checkInsightObservations(absRoot)) {
    if (violation.severity === 'error') {
      audit.violations.push(`${path.relative(absRoot, violation.location.path)}: ${violation.message}`);
    }
  }

  for (const entry of gitStatus(absRoot, ['.cortex/insight'])) {
    if (!isEntryPath(entry.rel)) continue;
    if (entry.status === '??') {
      audit.notes.push(
        `new entry ${entry.rel} is untracked — this loop never creates entries (extraction owns creation); ` +
          'verify its author before committing.',
      );
      continue;
    }

    const abs = path.join(absRoot, entry.rel);
    let raw: string;
    try {
      raw = fs.readFileSync(abs, 'utf-8');
    } catch {
      continue; // deleted/moved — not an enrichment
    }
    const parsed = parseEntry(raw);
    if (!parsed.ok) {
      audit.violations.push(`${entry.rel}: no longer a valid §4.10.2 entry (${(parsed.errors ?? []).join('; ')})`);
      continue;
    }

    const baselineRaw = gitShowHead(absRoot, entry.rel);
    if (baselineRaw === null) {
      audit.notes.push(`${entry.rel}: no HEAD baseline — section-boundary audit skipped for this entry.`);
      continue;
    }
    const current = splitEntrySections(raw);
    const baseline = splitEntrySections(baselineRaw);

    let ok = true;
    if (current.frontmatter !== baseline.frontmatter) {
      audit.violations.push(`${entry.rel}: frontmatter changed — the loop may only touch ## Insights / ## Query pointers.`);
      ok = false;
    }
    for (const section of EXTRACTION_OWNED_SECTIONS) {
      if ((current.sections.get(section) ?? '') !== (baseline.sections.get(section) ?? '')) {
        audit.violations.push(
          `${entry.rel}: extraction-owned section "## ${section}" changed — ` +
            'session-observe may only touch ## Insights / ## Query pointers (spec Rule 2).',
        );
        ok = false;
      }
    }
    for (const section of LOOP_WRITABLE_SECTIONS) {
      for (const line of addedLines(baseline.sections.get(section), current.sections.get(section))) {
        if (!PROVENANCE_TRAILER_RE.test(line)) {
          audit.violations.push(
            `${entry.rel}: line added to "## ${section}" without a (claude-sessions/<user>/<id>) provenance trailer: ` +
              `"${line.trim().slice(0, 80)}"`,
          );
          ok = false;
        }
      }
    }
    if (ok) audit.valid.push(entry.rel);
  }

  return audit;
}

// ---------------------------------------------------------------------------
// gated candidates → typed pulse proposals (spec Rules 3, 4, 7)
// ---------------------------------------------------------------------------

/** The judgment output contract for the gated routes. */
export type ObserveCandidate =
  | {
      type: 'rule-candidate';
      /** The observed convention, verbatim enough for dismissal/carry-forward matching
       *  (the matching key — NOT the display title, per B-010). */
      pattern: string;
      /** Display title for the section heading and the drafted rule's `title`
       *  frontmatter; derived from `pattern` (truncated) when absent. */
      title?: string;
      /** Glob list for the drafted rule's `governs:` frontmatter — the one field
       *  Core cannot infer (R-001: no LLM judgment in Core); supplied by the skill.
       *  Falls back to `["**\/*"]` when absent/malformed so old/malformed proposals
       *  never hard-fail. */
      governedGlobs?: string[];
      proposedText: string;
      sessionIds: string[];
    }
  | {
      type: 'decision-candidate';
      title: string;
      /** Optional explicit slug; derived from the title when absent. */
      slug?: string;
      /** The decision narrative (the reasoning worth preserving). */
      reasoning: string;
      sessionIds: string[];
    };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === 'string' && s.trim() !== '');
}

/** Shape-validate one candidate; malformed → null (skipped + counted). */
export function validateObserveCandidate(raw: unknown): ObserveCandidate | null {
  if (!isRecord(raw)) return null;
  if (raw['type'] === 'rule-candidate') {
    const { pattern, title, governedGlobs, proposedText, sessionIds } = raw;
    if (typeof pattern !== 'string' || pattern.trim() === '') return null;
    if (typeof proposedText !== 'string' || proposedText.trim() === '') return null;
    if (!isNonEmptyStringArray(sessionIds)) return null;
    // title/governedGlobs are TOLERANTLY shape-checked: absent or malformed →
    // dropped rather than failing the candidate (Core computes/falls back).
    const validTitle = typeof title === 'string' && title.trim() !== '' ? title : undefined;
    const validGlobs = isNonEmptyStringArray(governedGlobs) ? governedGlobs : undefined;
    return {
      type: 'rule-candidate',
      pattern,
      ...(validTitle !== undefined ? { title: validTitle } : {}),
      ...(validGlobs !== undefined ? { governedGlobs: validGlobs } : {}),
      proposedText,
      sessionIds,
    };
  }
  if (raw['type'] === 'decision-candidate') {
    const { title, slug, reasoning, sessionIds } = raw;
    if (typeof title !== 'string' || title.trim() === '') return null;
    if (typeof reasoning !== 'string' || reasoning.trim() === '') return null;
    if (!isNonEmptyStringArray(sessionIds)) return null;
    if (slug !== undefined && (typeof slug !== 'string' || slug.includes('..') || slug.includes('/'))) return null;
    return { type: 'decision-candidate', title, ...(typeof slug === 'string' ? { slug } : {}), reasoning, sessionIds };
  }
  return null;
}

/** Lowercased-hyphenated slug for a decision filename (§4.3). */
export function decisionSlug(candidate: { title: string; slug?: string }): string {
  const source = candidate.slug ?? candidate.title;
  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || 'decision';
}

/** The provenance `<user>` segment: the OS username, sanitised for the ref grammar. */
export function provenanceUser(): string {
  let name = '';
  try {
    name = os.userInfo().username;
  } catch {
    /* fall through */
  }
  const clean = name.replace(/[/\s)]+/g, '-').replace(/^-+|-+$/g, '');
  return clean || 'user';
}

/**
 * The full proposed decision file (§4.3): schema-conformant frontmatter —
 * `id: decision.<YYYY-MM-DD>-<slug>`, `title`, `date`, plus `provenance`
 * carrying the claude-sessions refs — and the reasoning as the body. Accept
 * writes this verbatim to `atlas/decisions/YYYY-MM-DD-<slug>.md`.
 */
export function decisionFilePayload(
  candidate: Extract<ObserveCandidate, { type: 'decision-candidate' }>,
  now: Date,
  user: string,
): { targetRel: string; payload: string } {
  const date = now.toISOString().slice(0, 10);
  const slug = decisionSlug(candidate);
  const targetRel = `.cortex/atlas/decisions/${date}-${slug}.md`;
  const provenance = candidate.sessionIds
    .map((sid) => `  - derives_from: claude-sessions/${user}/${sid}`)
    .join('\n');
  const payload = [
    '---',
    `id: decision.${date}-${slug}`,
    `title: ${JSON.stringify(candidate.title)}`,
    `date: ${now.toISOString()}`,
    'provenance:',
    provenance,
    '---',
    '',
    candidate.reasoning.replace(/\n+$/, ''),
    '',
  ].join('\n');
  return { targetRel, payload };
}

interface SectionDraft {
  id: string;
  text: string;
  /** Normalised dismissal/carry-forward matching key. */
  norm: string;
}

/** Display title for a rule-candidate: the explicit `title` when present, else
 *  `pattern` truncated (never the reverse — `pattern` stays the untruncated
 *  dismissal-matching key, B-010). */
function ruleTitle(candidate: Extract<ObserveCandidate, { type: 'rule-candidate' }>): string {
  if (candidate.title !== undefined && candidate.title.trim() !== '') return candidate.title.trim();
  const p = candidate.pattern.trim();
  return p.length > 80 ? `${p.slice(0, 77)}...` : p;
}

/** Lowercased-hyphenated filename slug for a rule (mirrors `decisionSlug`). */
function ruleSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || 'rule';
}

/**
 * Next unused `R-NNN` id: scans `.cortex/compass/rules/` on disk for existing
 * `R-NNN[-slug].md` files AND ids already allocated earlier in the SAME apply
 * batch (`allocatedInBatch`, mutated in place) — so two rule-candidates
 * proposed in one run never collide even before either lands on disk (B-010).
 */
function nextRuleId(absRoot: string, allocatedInBatch: Set<string>): string {
  const rulesDir = path.join(absRoot, '.cortex', 'compass', 'rules');
  let existing: string[] = [];
  try {
    existing = fs.readdirSync(rulesDir);
  } catch {
    existing = [];
  }
  let max = 0;
  for (const name of existing) {
    const m = /^R-(\d{3,})(?:-|\.md$)/.exec(name);
    if (m?.[1]) max = Math.max(max, parseInt(m[1], 10));
  }
  for (const id of allocatedInBatch) {
    const m = /^R-(\d{3,})$/.exec(id);
    if (m?.[1]) max = Math.max(max, parseInt(m[1], 10));
  }
  const id = `R-${String(max + 1).padStart(3, '0')}`;
  allocatedInBatch.add(id);
  return id;
}

/**
 * The full proposed rule file (schema §4.2), mirroring `decisionFilePayload()`:
 * Core computes the `R-NNN` id and filename deterministically, builds
 * schema-conformant frontmatter — `id`, `title`, a `source` list pointing at
 * the pulse report itself (the one artefact guaranteed to exist and back a
 * session-mined convention; `resolveRelativePath()` resolves it), `governs`
 * from the candidate's `governedGlobs` (falling back to `["**\/*"]`), and a
 * `provenance` block carrying the claude-sessions refs (cited-not-resolved,
 * schema §6/A6) — and the proposed text as the body. Accept writes this
 * verbatim to `.cortex/compass/rules/R-NNN-<slug>.md` (B-010 fix).
 */
export function ruleFilePayload(
  candidate: Extract<ObserveCandidate, { type: 'rule-candidate' }>,
  absRoot: string,
  user: string,
  allocatedRuleIds: Set<string>,
): { targetRel: string; payload: string } {
  const id = nextRuleId(absRoot, allocatedRuleIds);
  const title = ruleTitle(candidate);
  const slug = ruleSlug(title);
  const targetRel = `.cortex/compass/rules/${id}-${slug}.md`;

  const reportAbs = path.join(reportsDir(absRoot), SESSION_OBSERVE_REPORT_FILE);
  const ruleFileAbs = path.join(absRoot, targetRel);
  const sourceRel = path.relative(path.dirname(ruleFileAbs), reportAbs).split(path.sep).join('/');

  const governs = candidate.governedGlobs && candidate.governedGlobs.length > 0 ? candidate.governedGlobs : ['**/*'];
  const governsYaml = governs.map((g) => `  - ${JSON.stringify(g)}`).join('\n');
  const provenance = candidate.sessionIds
    .map((sid) => `  - derives_from: claude-sessions/${user}/${sid}`)
    .join('\n');

  const payload = [
    '---',
    `id: ${id}`,
    `title: ${JSON.stringify(title)}`,
    'source:',
    `  - ${sourceRel}`,
    'governs:',
    governsYaml,
    'provenance:',
    provenance,
    'confidence: INFERRED',
    '---',
    '',
    `# ${id} — ${title}`,
    '',
    candidate.proposedText.replace(/\n+$/, ''),
    '',
  ].join('\n');
  return { targetRel, payload };
}

function candidateSectionText(
  id: string,
  candidate: ObserveCandidate,
  now: Date,
  user: string,
  absRoot: string,
  allocatedRuleIds: Set<string>,
): string {
  const source = `session-observe (sessions: ${candidate.sessionIds.join(', ')})`;
  if (candidate.type === 'rule-candidate') {
    const title = ruleTitle(candidate);
    const { targetRel, payload } = ruleFilePayload(candidate, absRoot, user, allocatedRuleIds);
    const fence = chooseOuterFence(payload);
    return [
      `## ${id}: ${title}`,
      '',
      '**Type:** rule-candidate',
      `**Source:** ${source}`,
      `**Target:** ${targetRel}`,
      `**Pattern:** ${candidate.pattern}`,
      '',
      '**Proposed file:**',
      '',
      fence,
      payload,
      fence,
    ].join('\n');
  }
  const { targetRel, payload } = decisionFilePayload(candidate, now, user);
  const fence = chooseOuterFence(payload);
  return [
    `## ${id}: ${candidate.title}`,
    '',
    '**Type:** decision-candidate',
    `**Source:** ${source}`,
    `**Target:** ${targetRel}`,
    '',
    '**Proposed file:**',
    '',
    fence,
    payload,
    fence,
  ].join('\n');
}

export interface ObserveProposeCounts {
  received: number;
  proposed: number;
  carried: number;
  malformed: number;
  dismissed: number;
}

// ---------------------------------------------------------------------------
// apply — deterministic last bookend
// ---------------------------------------------------------------------------

export interface ObserveApplyOptions {
  now?: Date;
  /**
   * The skill's proposals JSON (spec Rule 13): either the legacy bare array of
   * ObserveCandidate (claims every worklist session) or
   * `{ observed: string[], candidates: ObserveCandidate[] }` (claims exactly
   * the listed worklist ids).
   */
  proposalsFile?: string;
  /** Provenance user override (tests); defaults to the OS username. */
  user?: string;
}

export interface ObserveApplyResult {
  reportPath: string;
  /** Sessions marked observed this run (claimed + expired). */
  observed: number;
  /** Worklist sessions left unclaimed and carried to the next worklist (spec Rule 13). */
  unobserved: number;
  /** Unclaimed sessions marked observed anyway after OBSERVE_MAX_ATTEMPTS (spec Rule 13). */
  expired: number;
  entriesValidated: number;
  violations: number;
  counts: ObserveProposeCounts;
}

interface ParsedProposals {
  candidates: unknown[];
  /** null → claim every worklist session (legacy array / no file); otherwise the explicit claim list. */
  claimed: string[] | null;
}

/** Spec Rule 13: accept the legacy bare array or the `{observed, candidates}` object. */
function parseProposalsFile(file: string): ParsedProposals {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown;
  if (Array.isArray(parsed)) return { candidates: parsed, claimed: null };
  if (typeof parsed === 'object' && parsed !== null) {
    const doc = parsed as { observed?: unknown; candidates?: unknown };
    if (doc.observed !== undefined && !Array.isArray(doc.observed)) {
      throw new Error(`proposals file ${file}: "observed" must be an array of session ids`);
    }
    if (doc.candidates !== undefined && !Array.isArray(doc.candidates)) {
      throw new Error(`proposals file ${file}: "candidates" must be an array`);
    }
    const claimed = Array.isArray(doc.observed) ? doc.observed.filter((id): id is string => typeof id === 'string') : [];
    return { candidates: Array.isArray(doc.candidates) ? doc.candidates : [], claimed };
  }
  throw new Error(`proposals file ${file} must hold a JSON array or an {"observed", "candidates"} object`);
}

/**
 * `--apply`: audit the ungated enrichments, land the gated candidates as
 * typed pulse proposals, advance the observed-state file, and always-write
 * the report. Violations are reported AND fail the run (exit 1 upstream).
 */
export function applyObserve(root: string, opts: ObserveApplyOptions = {}): ObserveApplyResult {
  const absRoot = path.resolve(root);
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const user = opts.user ?? provenanceUser();

  const worklist = readObserveWorklist(absRoot);
  if (worklist === null) {
    throw new Error(`no .cortex/pulse/state/${SESSION_OBSERVE_WORKLIST_FILE} — run \`cortex loop-session-observe --collect\` first`);
  }

  const audit = auditEnrichments(absRoot);

  // Gated candidates → typed proposal sections (spec Rules 3, 4, 7).
  const counts: ObserveProposeCounts = { received: 0, proposed: 0, carried: 0, malformed: 0, dismissed: 0 };
  const reportPath = path.join(reportsDir(absRoot), SESSION_OBSERVE_REPORT_FILE);
  const pending = readPendingSections(reportPath);
  const dismissals = readUnexpiredDismissals(absRoot, now.getTime());

  const proposals: ParsedProposals =
    opts.proposalsFile !== undefined ? parseProposalsFile(opts.proposalsFile) : { candidates: [], claimed: null };
  const rawCandidates = proposals.candidates;
  counts.received = rawCandidates.length;

  const fresh: ObserveCandidate[] = [];
  const pendingNorms = new Set(pending.map((p) => normaliseText(p.fields['pattern'] ?? p.title)));
  for (const raw of rawCandidates) {
    const candidate = validateObserveCandidate(raw);
    if (candidate === null) {
      counts.malformed++;
      continue;
    }
    const matchText = candidate.type === 'rule-candidate' ? candidate.pattern : candidate.title;
    if (isDismissed(matchText, dismissals)) {
      counts.dismissed++;
      continue;
    }
    if (pendingNorms.has(normaliseText(matchText))) {
      counts.carried++; // an identical still-pending section is re-emitted below
      continue;
    }
    fresh.push(candidate);
  }

  const ids = allocateSuggestionIds(absRoot, fresh.length);
  const allocatedRuleIds = new Set<string>();
  const sections: SectionDraft[] = fresh.map((candidate, i) => ({
    id: ids[i] as string,
    text: candidateSectionText(ids[i] as string, candidate, now, user, absRoot, allocatedRuleIds),
    norm: normaliseText(candidate.type === 'rule-candidate' ? candidate.pattern : candidate.title),
  }));
  counts.proposed = sections.length;

  // Advance the observed state for the sessions the skill claims it read
  // (spec Rule 13); unclaimed ones count an attempt and expire on the third.
  const state = readObserveState(absRoot);
  const worklistIds = worklist.sessions.map((s) => s.id);
  const claimedSet = proposals.claimed === null ? new Set(worklistIds) : new Set(proposals.claimed);
  const claimedIds = worklistIds.filter((id) => claimedSet.has(id));
  const attempts = { ...state.attempts };
  const unobservedIds: string[] = [];
  const expiredIds: string[] = [];
  for (const id of worklistIds) {
    if (claimedSet.has(id)) {
      delete attempts[id];
      continue;
    }
    const n = (attempts[id] ?? 0) + 1;
    if (n >= OBSERVE_MAX_ATTEMPTS) {
      delete attempts[id];
      expiredIds.push(id);
    } else {
      attempts[id] = n;
      unobservedIds.push(id);
    }
  }
  const observedIds = [...claimedIds, ...expiredIds];
  writeObserveState(absRoot, [...state.observed, ...observedIds], attempts, nowIso);

  // Always-write report (§4.5): audit summary + carried-forward pending
  // sections + fresh typed proposal sections.
  const body: string[] = ['# Session-observe report', ''];
  body.push(
    `Sessions observed this run: ${observedIds.length}${observedIds.length > 0 ? ` (${observedIds.join(', ')})` : ''}.`,
  );
  if (unobservedIds.length > 0) {
    body.push(
      `Sessions left unobserved: ${unobservedIds.length} (${unobservedIds.map((id) => `${id}, attempt ${attempts[id]} of ${OBSERVE_MAX_ATTEMPTS}`).join('; ')}) — ` +
        'not claimed in the proposals file; carried to the next worklist.',
    );
  }
  if (expiredIds.length > 0) {
    body.push(
      `Sessions expired unobserved: ${expiredIds.length} (${expiredIds.join(', ')}) — ` +
        `left unclaimed on ${OBSERVE_MAX_ATTEMPTS} applies and marked observed without being read.`,
    );
  }
  body.push(
    `Enrichment audit: ${audit.valid.length} entr${audit.valid.length === 1 ? 'y' : 'ies'} enriched cleanly, ` +
      `${audit.violations.length} violation(s).`,
    `Gated candidates: ${counts.received} received; ${counts.proposed} proposed, ${counts.carried} carried forward, ` +
      `${counts.malformed} malformed, ${counts.dismissed} dismissed (unexpired).`,
    '',
  );
  if (audit.violations.length > 0) {
    body.push('## Enrichment violations', '');
    for (const v of audit.violations) body.push(`- ${v}`);
    body.push('');
  }
  if (audit.notes.length > 0) {
    body.push('## Notes', '');
    for (const n of audit.notes) body.push(`- ${n}`);
    body.push('');
  }
  const emitted = [...pending.map((p) => p.raw), ...sections.map((s) => s.text)];
  if (emitted.length === 0) {
    body.push('No gated proposals this cycle.', '');
  } else {
    for (const section of emitted) body.push(section, '');
  }
  body.push(
    '---',
    '',
    'Ungated observations were written directly to insight per-file entries (## Insights / ## Query pointers ' +
      'only, with claude-sessions provenance trailers). Every compass/atlas change above is a typed proposal — ' +
      'apply via `cortex pulse-accept <S-NNN>`; this loop never writes gated content (RULES 7).',
  );
  writePulseReport(absRoot, SESSION_OBSERVE_REPORT_FILE, SESSION_OBSERVE_REPORT_KIND, SESSION_OBSERVE_LOOP_NAME, nowIso, body.join('\n'));

  return {
    reportPath,
    observed: observedIds.length,
    unobserved: unobservedIds.length,
    expired: expiredIds.length,
    entriesValidated: audit.valid.length,
    violations: audit.violations.length,
    counts,
  };
}

// ---------------------------------------------------------------------------
// entry — the modes
// ---------------------------------------------------------------------------

export interface SessionObserveOptions {
  collect?: boolean;
  apply?: boolean;
  proposalsFile?: string;
  home?: string;
  now?: Date;
  user?: string;
}

export async function runSessionObserve(root = '.', opts: SessionObserveOptions = {}): Promise<number> {
  const absRoot = path.resolve(root);
  const now = opts.now ?? new Date();

  if (opts.collect && opts.apply) {
    console.error('cortex loop-session-observe: --collect and --apply are mutually exclusive.');
    return 1;
  }
  if (opts.proposalsFile !== undefined && !opts.apply) {
    console.error('cortex loop-session-observe: --proposals requires --apply.');
    return 1;
  }

  try {
    if (opts.apply) {
      const r = applyObserve(absRoot, {
        now,
        ...(opts.proposalsFile !== undefined ? { proposalsFile: opts.proposalsFile } : {}),
        ...(opts.user !== undefined ? { user: opts.user } : {}),
      });
      console.log(
        `cortex loop-session-observe: ${r.observed} session(s) marked observed` +
          (r.unobserved > 0 ? ` (${r.unobserved} left unobserved)` : '') +
          (r.expired > 0 ? ` (${r.expired} expired unobserved)` : '') +
          ', ' +
          `${r.entriesValidated} entr${r.entriesValidated === 1 ? 'y' : 'ies'} enriched cleanly, ` +
          `${r.counts.proposed} proposal(s) written (${r.counts.carried} carried, ${r.counts.malformed} malformed, ` +
          `${r.counts.dismissed} dismissed), ${r.violations} violation(s) — ` +
          `report at .cortex/pulse/reports/${SESSION_OBSERVE_REPORT_FILE}.`,
      );
      return r.violations > 0 ? 1 : 0;
    }
    // --collect, and the bare form (the judgment middle is the shipped skill's
    // job — Core never runs it, spec Rule 8).
    const collectOpts = { now, ...(opts.home !== undefined ? { home: opts.home } : {}) };
    const r = collectObserve(absRoot, collectOpts);
    console.log(
      `cortex loop-session-observe: ${r.sessions} unobserved session(s) in the worklist ` +
        `(${r.alreadyObserved} already observed; corpus ${r.corpusReused ? `refreshed, ${r.corpusAppended} appended` : 'collected'}) — ` +
        `worklist at .cortex/pulse/state/${SESSION_OBSERVE_WORKLIST_FILE}.` +
        (opts.collect ? '' : ' The observation judgment runs in the cortex-loop-session-observe skill.'),
    );
    return 0;
  } catch (err) {
    console.error(`cortex loop-session-observe: ${(err as Error).message}`);
    return 1;
  }
}
