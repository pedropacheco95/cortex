/**
 * `cortex pulse-distil` — the weekly session-distillation loop (spec
 * pulse.distil, design §10.3). Two deterministic halves around an agentic
 * middle: `--collect` extracts this project's transcript messages since the
 * last run into `pulse/state/session-corpus.json` (the shared corpus, also read by
 * `cortex-loop-session-observe`, design §11.5); `--propose <candidates.json>`
 * deterministically filters the judgment's candidates and writes §4.5 proposal
 * sections to `pulse/suggestions.md` — rule-candidate/promotion additions plus,
 * via the folded-in workflow-mining lens, `skill-proposal` new-skill files.
 * Bare `cortex pulse-distil` = collect → spawn the
 * Claude CLI headless for the pattern judgment (core-cli.init Rule 6
 * subprocess boundary) → propose. The shipped skill runs the judgment
 * in-session instead — never a nested subprocess.
 *
 * WRITES only: suggestions.md (pulse root), state/session-corpus.json,
 * state/distil-last-run, state/suggestion-counter (spec Entities). Core halves
 * are deterministic (R-001).
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { listSessions, readSessionFile, extractMessages } from '../sessions/read.js';
import type { ExtractedMessage } from '../sessions/read.js';
import { allocateSuggestionIds } from './suggestion-ids.js';
import { AUTH_FAILURE_PATTERN } from '../cli/claude-auth.js';
import { writePulseReport } from '../loops/report.js';
import { openingFence, closesFence, chooseOuterFence, headingLinesOutsideFences } from './fences.js';
import type { FenceOpen } from './fences.js';

/** Engineering call (spec Rule 7): a first run bounds itself to the last 30 days. */
export const DISTIL_FIRST_RUN_WINDOW_DAYS = 30;
const DEFAULT_THRESHOLD_N = 3;
const DEFAULT_TIMEOUT_MS = 300_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const CORPUS_FILE = 'session-corpus.json';
export const DISTIL_LAST_RUN_FILE = 'distil-last-run';
export const SUGGESTIONS_FILE = 'suggestions.md';

/** Machine working state lives under `pulse/state/` (dots dropped, pulse reorg). */
function stateDir(root: string): string {
  return path.join(root, '.cortex', 'pulse', 'state');
}
/** `suggestions.md` stays at the pulse root (distil's user-facing output). */
function pulseRootDir(root: string): string {
  return path.join(root, '.cortex', 'pulse');
}

// ---------------------------------------------------------------------------
// shared helpers (also consumed by insight.session-observe via the corpus)
// ---------------------------------------------------------------------------

/** Normalise free text for pattern matching: lowercase, collapsed whitespace. */
export function normaliseText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** One `## S-NNN` section parsed out of a loop's own prior report (§4.5). */
export interface PriorSection {
  id: string;
  title: string;
  status: 'pending' | 'accepted' | 'rejected';
  /** `**Source:**` line value, when present. */
  source: string | null;
  /** Evidence field lines (`**Pattern:**`, `**Workflow:**`, …), lowercased keys. */
  fields: Record<string, string>;
  /** The raw section text (heading through the line before the next section). */
  raw: string;
}

const SECTION_HEADING_RE = /^##\s+(S-\d{3,})\s*:?\s*(.*)$/;
const FIELD_LINE_RE = /^\*\*([A-Za-z][A-Za-z -]*):\*\*\s*(.*)$/;

/**
 * Parse every `## S-NNN` section of a §4.5 report body. Fence-aware (§4.5
 * fence grammar, B-003): heading- or field-looking lines INSIDE a fenced
 * payload are payload — never section boundaries or field lines. A fenced
 * block closes only on a fence of at least the opening length.
 */
export function parseSuggestionSections(content: string): PriorSection[] {
  const lines = content.split('\n');
  const headings = headingLinesOutsideFences(lines, SECTION_HEADING_RE);
  const sections: PriorSection[] = [];
  for (let h = 0; h < headings.length; h++) {
    const start = headings[h] as number;
    const end = h + 1 < headings.length ? (headings[h + 1] as number) : lines.length;
    const match = (lines[start] as string).match(SECTION_HEADING_RE);
    if (!match) continue;
    const section: PriorSection = {
      id: match[1] as string,
      title: (match[2] ?? '').trim(),
      status: 'pending',
      source: null,
      fields: {},
      raw: lines.slice(start, end).join('\n').replace(/\n+$/, ''),
    };
    let inFence: FenceOpen | null = null;
    for (let i = start + 1; i < end; i++) {
      const line = lines[i] as string;
      if (inFence !== null) {
        if (closesFence(line, inFence)) inFence = null;
        continue;
      }
      const fence = openingFence(line);
      if (fence !== null) {
        inFence = fence;
        continue;
      }
      const fm = line.match(FIELD_LINE_RE);
      if (!fm) continue;
      const key = (fm[1] as string).toLowerCase();
      const value = (fm[2] ?? '').trim();
      if (key === 'status') {
        if (value === 'accepted' || value === 'rejected' || value === 'pending') section.status = value;
      } else if (key === 'source') {
        if (section.source === null) section.source = value;
      } else if (!(key in section.fields)) {
        section.fields[key] = value;
      }
    }
    sections.push(section);
  }
  return sections;
}

/** Still-pending sections of a report file (carry-forward inputs, spec Rule 6). */
export function readPendingSections(reportPath: string): PriorSection[] {
  if (!fs.existsSync(reportPath)) return [];
  return parseSuggestionSections(fs.readFileSync(reportPath, 'utf-8')).filter((s) => s.status === 'pending');
}

interface DismissalRecord {
  id: string;
  expires: number | null;
  /** Normalised recorded text: the heading title + free (non-field) lines. */
  normText: string;
}

/**
 * Rejection memory (design §10.3): each unexpired `dismissed.md` entry's
 * recorded text suppresses re-proposal of a matching pattern (spec Rule 3c).
 */
export function readUnexpiredDismissals(root: string, nowMs: number): DismissalRecord[] {
  const dismissedPath = path.join(root, '.cortex', 'pulse', 'dismissed.md');
  if (!fs.existsSync(dismissedPath)) return [];
  const sections = parseSuggestionSections(fs.readFileSync(dismissedPath, 'utf-8'));
  const records: DismissalRecord[] = [];
  for (const s of sections) {
    const expiresRaw = s.fields['expires'];
    const expires = expiresRaw !== undefined ? Date.parse(expiresRaw) : NaN;
    if (Number.isNaN(expires) || expires <= nowMs) continue; // expired → resurfaces
    const freeLines = s.raw
      .split('\n')
      .slice(1)
      .filter((l) => !FIELD_LINE_RE.test(l));
    records.push({
      id: s.id,
      expires,
      normText: normaliseText(`${s.title} ${freeLines.join(' ')}`),
    });
  }
  return records;
}

/** True when an unexpired dismissal's recorded text matches this pattern. */
export function isDismissed(pattern: string, dismissals: DismissalRecord[]): boolean {
  const norm = normaliseText(pattern);
  if (norm === '') return false;
  return dismissals.some((d) => d.normText === norm || d.normText.includes(norm));
}

/** `pulse.distilThresholdN` from cortex.config.json (default 3). */
export function readThresholdN(root: string): number {
  try {
    const config = JSON.parse(
      fs.readFileSync(path.join(root, '.cortex', 'cortex.config.json'), 'utf-8'),
    ) as { pulse?: { distilThresholdN?: unknown } };
    const value = config.pulse?.distilThresholdN;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 1) return Math.floor(value);
  } catch {
    /* missing/unparseable config → default */
  }
  return DEFAULT_THRESHOLD_N;
}

// ---------------------------------------------------------------------------
// collect — deterministic first half
// ---------------------------------------------------------------------------

export interface CorpusSession {
  id: string;
  mtime: string;
  messages: ExtractedMessage[];
}

export interface SessionCorpus {
  kind: 'session-corpus';
  generated: string;
  since: string;
  sessions: CorpusSession[];
}

export interface CollectOptions {
  home?: string;
  now?: Date;
}

export interface CollectResult {
  corpusPath: string;
  sessionCount: number;
  messageCount: number;
  sinceIso: string;
  firstRun: boolean;
}

/**
 * Spec Rule 1 (collect half) + Rule 7: extract this project's messages since
 * `state/distil-last-run` (first run: the last 30 days) into
 * `pulse/state/session-corpus.json` via the session-reading layer — never
 * re-implemented (loops.session-reading Rules 2-4).
 */
export function collectCorpus(root: string, opts: CollectOptions = {}): CollectResult {
  const now = opts.now ?? new Date();
  const lastRunPath = path.join(stateDir(root), DISTIL_LAST_RUN_FILE);

  let since: Date | null = null;
  if (fs.existsSync(lastRunPath)) {
    const parsed = Date.parse(fs.readFileSync(lastRunPath, 'utf-8').trim());
    if (!Number.isNaN(parsed)) since = new Date(parsed);
  }
  const firstRun = since === null;
  if (since === null) since = new Date(now.getTime() - DISTIL_FIRST_RUN_WINDOW_DAYS * DAY_MS);

  const listOpts = opts.home !== undefined ? { home: opts.home, since } : { since };
  const sessions = listSessions(root, listOpts);
  const corpusSessions: CorpusSession[] = [];
  let messageCount = 0;
  for (const session of sessions) {
    const { entries } = readSessionFile(session.path);
    const messages = extractMessages(entries);
    messageCount += messages.length;
    corpusSessions.push({ id: session.id, mtime: session.mtime.toISOString(), messages });
  }

  const corpus: SessionCorpus = {
    kind: 'session-corpus',
    generated: now.toISOString(),
    since: since.toISOString(),
    sessions: corpusSessions,
  };
  fs.mkdirSync(stateDir(root), { recursive: true });
  const corpusPath = path.join(stateDir(root), CORPUS_FILE);
  fs.writeFileSync(corpusPath, JSON.stringify(corpus, null, 2) + '\n', 'utf-8');
  return { corpusPath, sessionCount: corpusSessions.length, messageCount, sinceIso: corpus.since, firstRun };
}

// ---------------------------------------------------------------------------
// propose — deterministic second half
// ---------------------------------------------------------------------------

/**
 * Spec Rule 2 — the judgment output contract. `type` is the workflow-mining
 * lens folded in from the retired skill-suggest loop: absent (or
 * `rule-candidate`) is the default rule/preference path (compass target);
 * `skill-proposal` marks a workflow-shaped pattern whose target is a NEW
 * `.claude/skills/<name>/SKILL.md` and whose `proposedText` is a complete
 * draft SKILL.md (schema §4.5.1 skill-proposal type; src/pulse/types.ts).
 */
export type DistilCandidateType = 'rule-candidate' | 'skill-proposal';

export interface DistilCandidate {
  type: DistilCandidateType;
  pattern: string;
  occurrences: number;
  sessionIds: string[];
  proposedTarget: string;
  proposedText: string;
  confidence: string | number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/** A skill-proposal Target is exactly a NEW `.claude/skills/<slug>/SKILL.md`
 *  (the review CLI's SKILL root, src/pulse/types.ts; slug per skill dir rules). */
const SKILL_PROPOSAL_TARGET_RE = /^\.claude\/skills\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\/SKILL\.md$/;

/** Rule 2: validate one candidate's shape; malformed → null (skipped + counted). */
export function validateDistilCandidate(raw: unknown): DistilCandidate | null {
  if (!isRecord(raw)) return null;
  const { type, pattern, occurrences, sessionIds, proposedTarget, proposedText, confidence } = raw;
  if (typeof pattern !== 'string' || pattern.trim() === '') return null;
  if (typeof occurrences !== 'number' || !Number.isFinite(occurrences)) return null;
  if (!isStringArray(sessionIds)) return null;
  if (typeof proposedTarget !== 'string' || proposedTarget.trim() === '') return null;
  if (typeof proposedText !== 'string' || proposedText.trim() === '') return null;
  if (typeof confidence !== 'string' && typeof confidence !== 'number') return null;
  // Rule 5 / §4.5.1: the Target must satisfy the review CLI's target roots for
  // its type — a target the gate would refuse is a malformed judgment output.
  // Absent/`rule-candidate` → compass additions (the historical distil path);
  // `skill-proposal` (the folded-in workflow-mining lens) → a new skill file.
  const candidateType: DistilCandidateType = type === 'skill-proposal' ? 'skill-proposal' : 'rule-candidate';
  if (candidateType === 'skill-proposal') {
    if (!SKILL_PROPOSAL_TARGET_RE.test(proposedTarget)) return null;
  } else {
    if (typeof type === 'string' && type !== 'rule-candidate') return null; // unknown type is malformed
    if (!proposedTarget.startsWith('.cortex/compass/') || proposedTarget.includes('..')) return null;
  }
  return { type: candidateType, pattern, occurrences, sessionIds, proposedTarget, proposedText, confidence };
}

/** All curated compass text, normalised, for the already-covered filter (Rule 3b). */
function readCompassNormalised(root: string): string {
  const compassDir = path.join(root, '.cortex', 'compass');
  const chunks: string[] = [];
  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md')) {
        try {
          chunks.push(fs.readFileSync(full, 'utf-8'));
        } catch {
          /* unreadable file adds nothing */
        }
      }
    }
  };
  walk(compassDir);
  return normaliseText(chunks.join('\n'));
}

/**
 * Insight corpus for the already-covered filter (v2 design §6; v3 spec
 * insight.session-observe Rule 6): each insight file's normalised content,
 * project-relative path retained. A candidate already present in insight is
 * proposed as a `promotion` of that file — not fresh compass text (the
 * graduation path: a session-observation loop captures once, distil later
 * detects the repetition and proposes promotion — the no-double-propose
 * boundary). Covers the v2 `insight/map/*.md` prose AND the v3 per-file
 * entries under `insight/anatomy/**` / `insight/scopes/<s>/anatomy/**`
 * (where `cortex-loop-session-observe` writes its enrichments).
 */
interface InsightProseFile {
  rel: string;
  norm: string;
}

function readInsightProse(root: string): InsightProseFile[] {
  const insightRoot = path.join(root, '.cortex', 'insight');
  const out: InsightProseFile[] = [];

  const collectDir = (dir: string, relBase: string, recursive: boolean): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = `${relBase}/${entry.name}`;
      if (entry.isDirectory()) {
        if (recursive) collectDir(full, rel, true);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      try {
        out.push({ rel, norm: normaliseText(fs.readFileSync(full, 'utf-8')) });
      } catch {
        /* unreadable file covers nothing */
      }
    }
  };

  // v2 prose layout (retained for pre-migration projects).
  collectDir(path.join(insightRoot, 'map'), '.cortex/insight/map', false);
  // v3 per-file entries — flat layout.
  collectDir(path.join(insightRoot, 'anatomy'), '.cortex/insight/anatomy', true);
  // v3 per-file entries — scoped layout.
  const scopesDir = path.join(insightRoot, 'scopes');
  let scopes: fs.Dirent[] = [];
  try {
    scopes = fs.readdirSync(scopesDir, { withFileTypes: true });
  } catch {
    /* unscoped layout */
  }
  for (const scope of scopes) {
    if (!scope.isDirectory()) continue;
    collectDir(
      path.join(scopesDir, scope.name, 'anatomy'),
      `.cortex/insight/scopes/${scope.name}/anatomy`,
      true,
    );
  }
  return out;
}

/** The insight file whose prose already contains `text` (Rule 7), or null. */
function insightFileCovering(prose: InsightProseFile[], text: string): string | null {
  const norm = normaliseText(text);
  if (norm === '') return null;
  for (const file of prose) if (file.norm.includes(norm)) return file.rel;
  return null;
}

export interface ProposeCounts {
  received: number;
  proposed: number;
  carried: number;
  malformed: number;
  belowThreshold: number;
  covered: number;
  dismissed: number;
}

interface ProposalDraft {
  id: string;
  source: string;
  candidate: DistilCandidate;
  /** Rule 7: when set, the insight file this candidate graduates FROM (→ `promotion`). */
  promoteFrom?: string;
}

function distilSectionText(p: ProposalDraft): string {
  const title = p.candidate.pattern.length > 80 ? `${p.candidate.pattern.slice(0, 77)}...` : p.candidate.pattern;
  // §4.5 fence grammar (B-003): the outer fence is strictly longer than any
  // backtick run inside the payload.
  const fence = chooseOuterFence(p.candidate.proposedText);

  // Workflow-mining lens (folded-in skill-suggest): a `skill-proposal` targets
  // a NEW `.claude/skills/<name>/SKILL.md` and carries a `**Proposed file:**`
  // create shape whose block is the complete draft SKILL.md (§4.5.1/§4.5.2).
  if (p.candidate.type === 'skill-proposal') {
    return [
      `## ${p.id}: ${title}`,
      '',
      '**Type:** skill-proposal',
      `**Source:** ${p.source}`,
      `**Target:** ${p.candidate.proposedTarget}`,
      `**Pattern:** ${p.candidate.pattern}`,
      `**Occurrences:** ${p.candidate.occurrences}`,
      `**Confidence:** ${p.candidate.confidence}`,
      '',
      '**Proposed file:**',
      '',
      fence,
      p.candidate.proposedText,
      fence,
    ].join('\n');
  }

  // Rule 7 — a pattern already in insight prose graduates via a `promotion`
  // (referencing the insight file in Source), not a fresh rule-candidate.
  const isPromotion = p.promoteFrom !== undefined;
  const source = isPromotion ? `distil (already in insight ${p.promoteFrom}; ${p.source})` : p.source;
  return [
    `## ${p.id}: ${title}`,
    '',
    ...(isPromotion ? ['**Type:** promotion'] : []),
    `**Source:** ${source}`,
    `**Target:** ${p.candidate.proposedTarget}`,
    `**Pattern:** ${p.candidate.pattern}`,
    `**Occurrences:** ${p.candidate.occurrences}`,
    `**Confidence:** ${p.candidate.confidence}`,
    '',
    '**Proposed addition:**',
    '',
    fence,
    p.candidate.proposedText,
    fence,
  ].join('\n');
}

interface WriteReportOptions {
  root: string;
  nowIso: string;
  sections: string[];
  counts: ProposeCounts | null;
  thresholdN: number;
  notices: string[];
}

/** Always-write (§4.5 / spec Rule 6): overwrite suggestions.md with a fresh header. */
function writeSuggestionsReport(opts: WriteReportOptions): void {
  const lines: string[] = ['# Distil suggestions', ''];
  if (opts.sections.length === 0) {
    lines.push('No new patterns this cycle.', '');
  } else {
    for (const section of opts.sections) lines.push(section, '');
  }
  lines.push('---', '');
  if (opts.counts !== null) {
    const c = opts.counts;
    lines.push(
      `Candidates: ${c.received} received; ${c.proposed} proposed (${c.carried} carried forward with original ids). ` +
        `Dropped: ${c.malformed} malformed, ${c.belowThreshold} below-threshold (occurrences < ${opts.thresholdN}), ` +
        `${c.covered} covered by compass, ${c.dismissed} dismissed (unexpired).`,
    );
  }
  lines.push(
    `Threshold N=${opts.thresholdN} (\`pulse.distilThresholdN\`). First runs bound collection to the last ` +
      `${DISTIL_FIRST_RUN_WINDOW_DAYS} days (engineering call). Proposals flow through \`cortex pulse-list\` / ` +
      `\`pulse-accept\` — this loop never touches compass.`,
  );
  for (const notice of opts.notices) lines.push('', notice);
  writePulseReport(opts.root, SUGGESTIONS_FILE, 'pulse-suggestions', 'cortex-pulse-distil', opts.nowIso, lines.join('\n'), {
    dir: pulseRootDir(opts.root),
  });
}

export interface ProposeOptions {
  now?: Date;
  /** Extra footer notices (e.g. subprocess degradation, spec Rule 1). */
  notices?: string[];
}

/**
 * Spec Rules 3-6: validate shape, filter (threshold → covered → dismissed, in
 * order), allocate S-ids from the shared counter, carry forward still-pending
 * recurring patterns with their original ids and Source, and always-write the
 * report. Records `state/distil-last-run` (Rule 7 — a successful run's moment).
 */
export function proposeFromCandidates(root: string, rawCandidates: unknown, opts: ProposeOptions = {}): ProposeCounts {
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const thresholdN = readThresholdN(root);

  const rawList: unknown[] = Array.isArray(rawCandidates) ? rawCandidates : [];
  const counts: ProposeCounts = {
    received: rawList.length,
    proposed: 0,
    carried: 0,
    malformed: 0,
    belowThreshold: 0,
    covered: 0,
    dismissed: 0,
  };

  const compass = readCompassNormalised(root);
  const insightProse = readInsightProse(root);
  const dismissals = readUnexpiredDismissals(root, now.getTime());
  const suggestionsPath = path.join(root, '.cortex', 'pulse', SUGGESTIONS_FILE);
  const pending = readPendingSections(suggestionsPath);

  interface Passing {
    candidate: DistilCandidate;
    promoteFrom?: string;
  }
  const passing: Passing[] = [];
  for (const raw of rawList) {
    const candidate = validateDistilCandidate(raw);
    if (candidate === null) {
      counts.malformed++;
      continue;
    }
    if (candidate.occurrences < thresholdN) {
      counts.belowThreshold++;
      continue;
    }
    if (compass !== '' && compass.includes(normaliseText(candidate.proposedText))) {
      counts.covered++;
      continue;
    }
    if (isDismissed(candidate.pattern, dismissals)) {
      counts.dismissed++;
      continue;
    }
    // Rule 7 (v2 design §6): already in insight prose → propose a `promotion` of
    // that file, not a fresh rule-candidate. Skipped for skill-proposals — a
    // draft SKILL.md never graduates to a compass promotion.
    const promoteFrom =
      candidate.type === 'skill-proposal' ? null : insightFileCovering(insightProse, candidate.proposedText);
    passing.push(promoteFrom !== null ? { candidate, promoteFrom } : { candidate });
  }

  // Carry-forward (Rule 6): match still-pending prior sections by normalised
  // pattern text; carried sections keep their ids and Source (no id churn).
  const drafts: (ProposalDraft | null)[] = [];
  const usedPriorIds = new Set<string>();
  let freshCount = 0;
  for (const { candidate, promoteFrom } of passing) {
    const norm = normaliseText(candidate.pattern);
    const prior = pending.find(
      (p) => !usedPriorIds.has(p.id) && normaliseText(p.fields['pattern'] ?? p.title) === norm,
    );
    if (prior) {
      usedPriorIds.add(prior.id);
      counts.carried++;
      drafts.push({
        id: prior.id,
        source: prior.source ?? `distil (sessions: ${candidate.sessionIds.join(', ')})`,
        candidate,
        ...(promoteFrom !== undefined ? { promoteFrom } : {}),
      });
    } else {
      freshCount++;
      drafts.push(null); // placeholder — filled from the allocator below, in order
    }
  }
  const freshIds = allocateSuggestionIds(root, freshCount);
  let freshIdx = 0;
  const sections: string[] = [];
  for (let i = 0; i < passing.length; i++) {
    let draft = drafts[i];
    if (draft === null || draft === undefined) {
      const { candidate, promoteFrom } = passing[i] as Passing;
      draft = {
        id: freshIds[freshIdx++] as string,
        source: `distil (sessions: ${candidate.sessionIds.join(', ')})`,
        candidate,
        ...(promoteFrom !== undefined ? { promoteFrom } : {}),
      };
    }
    sections.push(distilSectionText(draft));
  }
  counts.proposed = sections.length;

  writeSuggestionsReport({
    root,
    nowIso,
    sections,
    counts,
    thresholdN,
    notices: opts.notices ?? [],
  });

  // Rule 7 — timestamp memory: a successful (proposing) run records its moment.
  fs.mkdirSync(stateDir(root), { recursive: true });
  fs.writeFileSync(path.join(stateDir(root), DISTIL_LAST_RUN_FILE), `${nowIso}\n`, 'utf-8');
  return counts;
}

/**
 * Degraded bare run (spec Rule 1 / "Subprocess degradation" AC): the judgment
 * pass did not happen, so no evidence exists to decide anything — still-pending
 * prior sections are re-emitted verbatim, the report states the skip, and the
 * collect output is retained for the scheduled skill run. `state/distil-last-run`
 * is NOT advanced (the window must stay open for the skill run).
 */
export function writeDegradedReport(root: string, notice: string, now: Date): void {
  const suggestionsPath = path.join(root, '.cortex', 'pulse', SUGGESTIONS_FILE);
  const pending = readPendingSections(suggestionsPath);
  writeSuggestionsReport({
    root,
    nowIso: now.toISOString(),
    sections: pending.map((p) => p.raw),
    counts: null,
    thresholdN: readThresholdN(root),
    notices: [notice],
  });
}

// ---------------------------------------------------------------------------
// bare mode — the Rule 6 subprocess boundary (Core makes NO LLM calls)
// ---------------------------------------------------------------------------

interface SubprocessOutcome {
  kind: 'ok' | 'no-binary' | 'timeout' | 'auth' | 'error';
  stdout: string;
  detail: string;
}

function runClaudeJudgment(bin: string, prompt: string, cwd: string, timeoutMs: number): Promise<SubprocessOutcome> {
  return new Promise((resolve) => {
    execFile(
      bin,
      ['-p', prompt],
      { cwd, timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const out = stdout ?? '';
        const combined = `${out}\n${stderr ?? ''}`;
        if (AUTH_FAILURE_PATTERN.test(combined)) {
          resolve({ kind: 'auth', stdout: out, detail: 'the Claude CLI reported it is not authenticated' });
          return;
        }
        if (!error) {
          resolve({ kind: 'ok', stdout: out, detail: '' });
          return;
        }
        const err = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string; code?: unknown };
        if (err.code === 'ENOENT') {
          resolve({ kind: 'no-binary', stdout: out, detail: `claude binary not found (${bin})` });
        } else if (err.killed || err.signal === 'SIGKILL' || err.signal === 'SIGTERM') {
          resolve({ kind: 'timeout', stdout: out, detail: `subprocess timed out after ${timeoutMs}ms` });
        } else {
          resolve({ kind: 'error', stdout: out, detail: `subprocess exited with code ${String(err.code ?? 'unknown')}` });
        }
      },
    );
  });
}

/** Extract the first JSON array embedded in the judgment's stdout. */
export function parseCandidatesFromOutput(output: string): unknown[] | null {
  const start = output.indexOf('[');
  const end = output.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(output.slice(start, end + 1)) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function judgmentPrompt(): string {
  return (
    `Read .cortex/pulse/state/${CORPUS_FILE} — this project's session messages since the last distil run. ` +
    `Extract recurring patterns the user keeps stating: corrections, preferences, environment facts. ` +
    `Be conservative: filter one-offs; every candidate must cite the session ids it was seen in. ` +
    `Output ONLY a JSON array of candidates, each shaped ` +
    `{"pattern": string, "occurrences": number, "sessionIds": [string], ` +
    `"proposedTarget": ".cortex/compass/<file>.md", "proposedText": string, "confidence": string}. ` +
    `Do not write any files.`
  );
}

// ---------------------------------------------------------------------------
// entry — the three modes (spec Rule 1)
// ---------------------------------------------------------------------------

export interface DistilOptions {
  collect?: boolean;
  proposeFile?: string;
  noLlm?: boolean;
  /** Testability seams (never LLM behaviour — the subprocess stays opaque). */
  home?: string;
  claudeBin?: string;
  timeoutMs?: number;
  now?: Date;
}

export async function runDistil(root = '.', opts: DistilOptions = {}): Promise<number> {
  const absRoot = path.resolve(root);
  const now = opts.now ?? new Date();

  if (opts.collect && opts.proposeFile !== undefined) {
    console.error('cortex pulse-distil: --collect and --propose are mutually exclusive.');
    return 1;
  }

  // Mode 1 — collect only (the shipped skill's first step).
  if (opts.collect) {
    const collectOpts = { now, ...(opts.home !== undefined ? { home: opts.home } : {}) };
    const result = collectCorpus(absRoot, collectOpts);
    console.log(
      `cortex pulse-distil: collected ${result.messageCount} message(s) from ${result.sessionCount} session(s) ` +
        `since ${result.sinceIso} into .cortex/pulse/state/${CORPUS_FILE}${result.firstRun ? ' (first run: last 30 days)' : ''}.`,
    );
    return 0;
  }

  // Mode 2 — propose only (the shipped skill's last step).
  if (opts.proposeFile !== undefined) {
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(opts.proposeFile, 'utf-8')) as unknown;
    } catch (err) {
      console.error(`cortex pulse-distil: cannot read candidates file ${opts.proposeFile}: ${(err as Error).message}`);
      return 1;
    }
    if (!Array.isArray(raw)) {
      console.error(`cortex pulse-distil: candidates file ${opts.proposeFile} must hold a JSON array.`);
      return 1;
    }
    const counts = proposeFromCandidates(absRoot, raw, { now });
    console.log(
      `cortex pulse-distil: wrote .cortex/pulse/${SUGGESTIONS_FILE} (${counts.proposed} proposal(s), ` +
        `${counts.carried} carried forward; dropped ${counts.malformed} malformed, ${counts.belowThreshold} below-threshold, ` +
        `${counts.covered} covered, ${counts.dismissed} dismissed).`,
    );
    return 0;
  }

  // Mode 3 — bare: collect → headless judgment subprocess → propose.
  const collectOpts = { now, ...(opts.home !== undefined ? { home: opts.home } : {}) };
  const collected = collectCorpus(absRoot, collectOpts);

  const degrade = (notice: string, exitCode: number): number => {
    writeDegradedReport(absRoot, notice, now);
    console.log(`cortex pulse-distil: ${notice}`);
    return exitCode;
  };

  if (opts.noLlm) {
    return degrade(
      `judgment pass skipped (--no-llm); collect output retained at .cortex/pulse/state/${CORPUS_FILE} for the scheduled skill run.`,
      0,
    );
  }

  const outcome = await runClaudeJudgment(
    opts.claudeBin ?? 'claude',
    judgmentPrompt(),
    absRoot,
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  switch (outcome.kind) {
    case 'auth':
      // Named failure (core-cli.init Rule 6 semantics: auth is exit 3, actionable).
      return degrade(
        `judgment pass failed: ${outcome.detail}. Authenticate the Claude CLI (run \`claude\` and log in via /login), ` +
          `then re-run — collect output retained at .cortex/pulse/state/${CORPUS_FILE}.`,
        3,
      );
    case 'no-binary':
    case 'timeout':
    case 'error':
      return degrade(
        `judgment pass skipped (${outcome.detail}); collect output retained at .cortex/pulse/state/${CORPUS_FILE} for the scheduled skill run.`,
        0,
      );
    case 'ok': {
      const candidates = parseCandidatesFromOutput(outcome.stdout);
      if (candidates === null) {
        return degrade(
          `judgment pass produced no usable candidates JSON; collect output retained at .cortex/pulse/state/${CORPUS_FILE} for the scheduled skill run.`,
          0,
        );
      }
      const counts = proposeFromCandidates(absRoot, candidates, { now });
      console.log(
        `cortex pulse-distil: collected ${collected.messageCount} message(s), wrote .cortex/pulse/${SUGGESTIONS_FILE} ` +
          `(${counts.proposed} proposal(s), ${counts.carried} carried forward).`,
      );
      return 0;
    }
  }
}
