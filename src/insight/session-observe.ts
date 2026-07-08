/**
 * `cortex loop-session-observe` — the v3 successor to v2's insight-gaps loop
 * (spec insight.session-observe; design §9, §8.2). Deterministic Core
 * bookends around the agentic middle run by the shipped
 * `skills/cortex-loop-session-observe/` bundle:
 *
 *  - `--collect` REUSES the shared session corpus (`pulse/.session-corpus.json`,
 *    the same file `cortex pulse-distil --collect` builds — spec Rule 1: shared
 *    machinery, never double-built; a missing corpus is collected via distil's
 *    own `collectCorpus`). It emits a worklist of corpus sessions not yet
 *    observed (tracked in `pulse/.session-observe-state.json`) for the
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
 *    into the always-write report `pulse/session-observe.md`; still-pending
 *    prior sections are carried forward verbatim. Finally the observed-state
 *    file advances.
 *
 * Core halves are deterministic — no LLM here, ever (spec Rule 8, R-001).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import {
  collectCorpus,
  CORPUS_FILE,
  readPendingSections,
  readUnexpiredDismissals,
  isDismissed,
  normaliseText,
  type SessionCorpus,
} from '../pulse/distil.js';
import { allocateSuggestionIds } from '../pulse/suggestion-ids.js';
import { chooseOuterFence } from '../pulse/fences.js';
import { writePulseReport } from '../loops/report.js';
import { parseEntry } from './entry.js';

export const SESSION_OBSERVE_WORKLIST_FILE = '.session-observe-worklist.json';
export const SESSION_OBSERVE_STATE_FILE = '.session-observe-state.json';
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

function pulseDir(root: string): string {
  return path.join(root, '.cortex', 'pulse');
}

// ---------------------------------------------------------------------------
// observed-state file
// ---------------------------------------------------------------------------

export interface ObserveState {
  kind: 'session-observe-state';
  updated: string;
  /** Session ids already observed by a completed apply. */
  observed: string[];
}

export function readObserveState(root: string): ObserveState {
  const p = path.join(pulseDir(root), SESSION_OBSERVE_STATE_FILE);
  try {
    const doc = JSON.parse(fs.readFileSync(p, 'utf-8')) as ObserveState;
    if (doc.kind === 'session-observe-state' && Array.isArray(doc.observed)) {
      return { kind: 'session-observe-state', updated: doc.updated ?? '', observed: doc.observed.filter((s) => typeof s === 'string') };
    }
  } catch {
    /* missing/unparseable → fresh state */
  }
  return { kind: 'session-observe-state', updated: '', observed: [] };
}

function writeObserveState(root: string, observed: string[], nowIso: string): void {
  fs.mkdirSync(pulseDir(root), { recursive: true });
  const state: ObserveState = { kind: 'session-observe-state', updated: nowIso, observed: [...new Set(observed)].sort() };
  fs.writeFileSync(path.join(pulseDir(root), SESSION_OBSERVE_STATE_FILE), JSON.stringify(state, null, 2) + '\n', 'utf-8');
}

// ---------------------------------------------------------------------------
// collect — deterministic first bookend (spec Rules 1, 8)
// ---------------------------------------------------------------------------

export interface ObserveWorklistSession {
  id: string;
  mtime: string;
  message_count: number;
}

export interface ObserveWorklist {
  kind: 'session-observe-worklist';
  generated: string;
  /** The shared corpus this worklist was derived from. */
  corpus_generated: string;
  /** True when an existing corpus was reused (coordination with distil). */
  corpus_reused: boolean;
  sessions: ObserveWorklistSession[];
}

export function observeWorklistPath(root: string): string {
  return path.join(pulseDir(root), SESSION_OBSERVE_WORKLIST_FILE);
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

function readCorpus(root: string): SessionCorpus | null {
  const p = path.join(pulseDir(root), CORPUS_FILE);
  if (!fs.existsSync(p)) return null;
  try {
    const doc = JSON.parse(fs.readFileSync(p, 'utf-8')) as SessionCorpus;
    return doc.kind === 'session-corpus' && Array.isArray(doc.sessions) ? doc : null;
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
}

/**
 * Reuse the shared corpus (build it via distil's `collectCorpus` only when
 * absent — one corpus, two readers, spec Rule 1) and emit the worklist of
 * sessions not yet observed.
 */
export function collectObserve(root: string, opts: ObserveCollectOptions = {}): ObserveCollectResult {
  const absRoot = path.resolve(root);
  const now = opts.now ?? new Date();

  let corpus = readCorpus(absRoot);
  const corpusReused = corpus !== null;
  if (corpus === null) {
    collectCorpus(absRoot, { now, ...(opts.home !== undefined ? { home: opts.home } : {}) });
    corpus = readCorpus(absRoot);
  }
  if (corpus === null) {
    throw new Error(`could not build or read the shared session corpus (.cortex/pulse/${CORPUS_FILE})`);
  }

  const observed = new Set(readObserveState(absRoot).observed);
  const sessions: ObserveWorklistSession[] = corpus.sessions
    .filter((s) => !observed.has(s.id))
    .map((s) => ({ id: s.id, mtime: s.mtime, message_count: s.messages.length }));

  const worklist: ObserveWorklist = {
    kind: 'session-observe-worklist',
    generated: now.toISOString(),
    corpus_generated: corpus.generated,
    corpus_reused: corpusReused,
    sessions,
  };
  fs.mkdirSync(pulseDir(absRoot), { recursive: true });
  const p = observeWorklistPath(absRoot);
  fs.writeFileSync(p, JSON.stringify(worklist, null, 2) + '\n', 'utf-8');
  return {
    worklistPath: p,
    sessions: sessions.length,
    alreadyObserved: corpus.sessions.length - sessions.length,
    corpusReused,
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
 * `## Query pointers` carries the claude-sessions provenance trailer; and no
 * gated path (`compass/`, `atlas/`, `RULES.md`) was touched directly.
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
      /** The observed convention, verbatim enough for dismissal matching. */
      pattern: string;
      proposedTarget: string;
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
    const { pattern, proposedTarget, proposedText, sessionIds } = raw;
    if (typeof pattern !== 'string' || pattern.trim() === '') return null;
    if (typeof proposedTarget !== 'string' || !proposedTarget.startsWith('.cortex/compass/') || proposedTarget.includes('..')) return null;
    if (typeof proposedText !== 'string' || proposedText.trim() === '') return null;
    if (!isNonEmptyStringArray(sessionIds)) return null;
    return { type: 'rule-candidate', pattern, proposedTarget, proposedText, sessionIds };
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

function candidateSectionText(id: string, candidate: ObserveCandidate, now: Date, user: string): string {
  const source = `session-observe (sessions: ${candidate.sessionIds.join(', ')})`;
  if (candidate.type === 'rule-candidate') {
    const title = candidate.pattern.length > 80 ? `${candidate.pattern.slice(0, 77)}...` : candidate.pattern;
    const fence = chooseOuterFence(candidate.proposedText);
    return [
      `## ${id}: ${title}`,
      '',
      '**Type:** rule-candidate',
      `**Source:** ${source}`,
      `**Target:** ${candidate.proposedTarget}`,
      `**Pattern:** ${candidate.pattern}`,
      '',
      '**Proposed addition:**',
      '',
      fence,
      candidate.proposedText,
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
  /** The skill's gated-candidates JSON (array of ObserveCandidate). */
  proposalsFile?: string;
  /** Provenance user override (tests); defaults to the OS username. */
  user?: string;
}

export interface ObserveApplyResult {
  reportPath: string;
  observed: number;
  entriesValidated: number;
  violations: number;
  counts: ObserveProposeCounts;
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
    throw new Error(`no .cortex/pulse/${SESSION_OBSERVE_WORKLIST_FILE} — run \`cortex loop-session-observe --collect\` first`);
  }

  const audit = auditEnrichments(absRoot);

  // Gated candidates → typed proposal sections (spec Rules 3, 4, 7).
  const counts: ObserveProposeCounts = { received: 0, proposed: 0, carried: 0, malformed: 0, dismissed: 0 };
  const reportPath = path.join(pulseDir(absRoot), SESSION_OBSERVE_REPORT_FILE);
  const pending = readPendingSections(reportPath);
  const dismissals = readUnexpiredDismissals(absRoot, now.getTime());

  let rawCandidates: unknown[] = [];
  if (opts.proposalsFile !== undefined) {
    const parsed = JSON.parse(fs.readFileSync(opts.proposalsFile, 'utf-8')) as unknown;
    if (!Array.isArray(parsed)) throw new Error(`proposals file ${opts.proposalsFile} must hold a JSON array`);
    rawCandidates = parsed;
  }
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
  const sections: SectionDraft[] = fresh.map((candidate, i) => ({
    id: ids[i] as string,
    text: candidateSectionText(ids[i] as string, candidate, now, user),
    norm: normaliseText(candidate.type === 'rule-candidate' ? candidate.pattern : candidate.title),
  }));
  counts.proposed = sections.length;

  // Advance the observed state (the worklist sessions are now observed).
  const state = readObserveState(absRoot);
  const observedIds = worklist.sessions.map((s) => s.id);
  writeObserveState(absRoot, [...state.observed, ...observedIds], nowIso);

  // Always-write report (§4.5): audit summary + carried-forward pending
  // sections + fresh typed proposal sections.
  const body: string[] = ['# Session-observe report', ''];
  body.push(
    `Sessions observed this run: ${observedIds.length}${observedIds.length > 0 ? ` (${observedIds.join(', ')})` : ''}.`,
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
        `cortex loop-session-observe: ${r.observed} session(s) marked observed, ` +
          `${r.entriesValidated} entr${r.entriesValidated === 1 ? 'y' : 'ies'} enriched cleanly, ` +
          `${r.counts.proposed} proposal(s) written (${r.counts.carried} carried, ${r.counts.malformed} malformed, ` +
          `${r.counts.dismissed} dismissed), ${r.violations} violation(s) — ` +
          `report at .cortex/pulse/${SESSION_OBSERVE_REPORT_FILE}.`,
      );
      return r.violations > 0 ? 1 : 0;
    }
    // --collect, and the bare form (the judgment middle is the shipped skill's
    // job — Core never runs it, spec Rule 8).
    const collectOpts = { now, ...(opts.home !== undefined ? { home: opts.home } : {}) };
    const r = collectObserve(absRoot, collectOpts);
    console.log(
      `cortex loop-session-observe: ${r.sessions} unobserved session(s) in the worklist ` +
        `(${r.alreadyObserved} already observed; corpus ${r.corpusReused ? 'reused' : 'collected'}) — ` +
        `worklist at .cortex/pulse/${SESSION_OBSERVE_WORKLIST_FILE}.` +
        (opts.collect ? '' : ' The observation judgment runs in the cortex-loop-session-observe skill.'),
    );
    return 0;
  } catch (err) {
    console.error(`cortex loop-session-observe: ${(err as Error).message}`);
    return 1;
  }
}
