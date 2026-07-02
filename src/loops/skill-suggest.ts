/**
 * `cortex loop-skill-suggest` — distil's workflow-mining sibling (spec
 * loops.skill-suggest, design §11.4 item 12). Mines the shared session corpus
 * (`pulse/.session-corpus.json`, produced by distil's collect — reused, never
 * re-collected while fresh, design §11.5) for multi-step workflows Claude
 * re-derived across sessions, and proposes each as a §4.5 section whose
 * `**Target:**` is a NEW `.claude/skills/<name>/SKILL.md` and whose fenced
 * block is a complete draft SKILL.md. Skill creation happens only via
 * `pulse-accept` (pulse.review-cli Rule 4) — never here.
 *
 * WRITES only: pulse/skill-suggestions.md and pulse/.suggestion-counter
 * (plus the shared corpus when Rule 1's absent-corpus collect fires).
 * Core halves are deterministic (R-001).
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
import {
  collectCorpus,
  normaliseText,
  readPendingSections,
  readUnexpiredDismissals,
  isDismissed,
  readThresholdN,
  parseCandidatesFromOutput,
  CORPUS_FILE,
} from '../pulse/distil.js';
import type { CollectOptions, CollectResult } from '../pulse/distil.js';
import { allocateSuggestionIds } from '../pulse/suggestion-ids.js';
import { AUTH_FAILURE_PATTERN } from '../cli/claude-auth.js';
import { writePulseReport } from './report.js';

export const SKILL_SUGGESTIONS_FILE = 'skill-suggestions.md';
const DEFAULT_TIMEOUT_MS = 300_000;

/** Valid skill directory slug (spec Rule 2). */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

// ---------------------------------------------------------------------------
// candidate validation (spec Rule 2)
// ---------------------------------------------------------------------------

export interface SkillCandidate {
  workflowName: string;
  occurrences: number;
  sessionIds: string[];
  draftSkillMd: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Rule 2: `workflowName` is a valid skill dir slug; `draftSkillMd` parses with
 * `name:` matching the slug and a non-empty description and body. Malformed →
 * null (skipped + counted).
 */
export function validateSkillCandidate(raw: unknown): SkillCandidate | null {
  if (!isRecord(raw)) return null;
  const { workflowName, occurrences, sessionIds, draftSkillMd } = raw;
  if (typeof workflowName !== 'string' || !SLUG_RE.test(workflowName)) return null;
  if (typeof occurrences !== 'number' || !Number.isFinite(occurrences)) return null;
  if (!Array.isArray(sessionIds) || !sessionIds.every((v) => typeof v === 'string')) return null;
  if (typeof draftSkillMd !== 'string' || draftSkillMd.trim() === '') return null;
  let parsed: { data: Record<string, unknown>; content: string };
  try {
    const file = matter(draftSkillMd);
    parsed = { data: file.data as Record<string, unknown>, content: file.content };
  } catch {
    return null;
  }
  if (parsed.data['name'] !== workflowName) return null;
  const description = parsed.data['description'];
  if (typeof description !== 'string' || description.trim() === '') return null;
  if (parsed.content.trim() === '') return null;
  return { workflowName, occurrences, sessionIds, draftSkillMd };
}

// ---------------------------------------------------------------------------
// dedup (spec Rule 3b)
// ---------------------------------------------------------------------------

function packageSkillsDir(): string {
  // src/loops/skill-suggest.ts → package root is two levels up (same in dist/).
  return path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'), 'skills');
}

/** A skill of this name already exists project-locally or ships in the package. */
export function skillNameExists(root: string, name: string): boolean {
  return (
    fs.existsSync(path.join(root, '.claude', 'skills', name)) ||
    fs.existsSync(path.join(packageSkillsDir(), name))
  );
}

// ---------------------------------------------------------------------------
// propose — deterministic half
// ---------------------------------------------------------------------------

export interface SkillProposeCounts {
  received: number;
  proposed: number;
  carried: number;
  malformed: number;
  belowThreshold: number;
  covered: number;
  dismissed: number;
}

function sectionText(id: string, source: string, c: SkillCandidate): string {
  return [
    `## ${id}: ${c.workflowName}`,
    '',
    `**Source:** ${source}`,
    `**Target:** .claude/skills/${c.workflowName}/SKILL.md`,
    `**Workflow:** ${c.workflowName}`,
    `**Occurrences:** ${c.occurrences}`,
    '',
    '**Proposed addition:**',
    '',
    '```',
    c.draftSkillMd.replace(/\n+$/, ''),
    '```',
  ].join('\n');
}

interface ReportOptions {
  root: string;
  nowIso: string;
  sections: string[];
  counts: SkillProposeCounts | null;
  thresholdN: number;
  notices: string[];
}

/** Always-write (§4.5 / spec Rule 5): overwrite skill-suggestions.md each run. */
function writeSkillSuggestionsReport(opts: ReportOptions): void {
  const lines: string[] = ['# Skill suggestions', ''];
  if (opts.sections.length === 0) {
    lines.push('No new workflow patterns this cycle.', '');
  } else {
    for (const section of opts.sections) lines.push(section, '');
  }
  lines.push('---', '');
  if (opts.counts !== null) {
    const c = opts.counts;
    lines.push(
      `Candidates: ${c.received} received; ${c.proposed} proposed (${c.carried} carried forward with original ids). ` +
        `Dropped: ${c.malformed} malformed, ${c.belowThreshold} below-threshold (occurrences < ${opts.thresholdN}), ` +
        `${c.covered} covered (skill name already exists), ${c.dismissed} dismissed (unexpired).`,
    );
  }
  lines.push(
    `Recurrence threshold N=${opts.thresholdN} (\`pulse.distilThresholdN\`, reused). Accepted proposals create a NEW ` +
      `\`.claude/skills/<name>/SKILL.md\` via \`cortex pulse-accept\` only — this loop never creates skills.`,
  );
  for (const notice of opts.notices) lines.push('', notice);
  writePulseReport(
    opts.root,
    SKILL_SUGGESTIONS_FILE,
    'pulse-skill-suggestions',
    'cortex-loop-skill-suggest',
    opts.nowIso,
    lines.join('\n'),
  );
}

export interface SkillProposeOptions {
  now?: Date;
  notices?: string[];
}

/**
 * Spec Rules 2-5: validate, filter (threshold → dedup-covered → dismissed),
 * allocate S-ids from the shared counter (no collisions with distil), carry
 * forward still-pending workflows with their original ids and Source, and
 * always-write the report.
 */
export function proposeSkillCandidates(
  root: string,
  rawCandidates: unknown,
  opts: SkillProposeOptions = {},
): SkillProposeCounts {
  const now = opts.now ?? new Date();
  const thresholdN = readThresholdN(root);
  const rawList: unknown[] = Array.isArray(rawCandidates) ? rawCandidates : [];
  const counts: SkillProposeCounts = {
    received: rawList.length,
    proposed: 0,
    carried: 0,
    malformed: 0,
    belowThreshold: 0,
    covered: 0,
    dismissed: 0,
  };

  const dismissals = readUnexpiredDismissals(root, now.getTime());
  const reportPath = path.join(root, '.cortex', 'pulse', SKILL_SUGGESTIONS_FILE);
  const pending = readPendingSections(reportPath);

  const passing: SkillCandidate[] = [];
  for (const raw of rawList) {
    const candidate = validateSkillCandidate(raw);
    if (candidate === null) {
      counts.malformed++;
      continue;
    }
    if (candidate.occurrences < thresholdN) {
      counts.belowThreshold++;
      continue;
    }
    if (skillNameExists(root, candidate.workflowName)) {
      counts.covered++;
      continue;
    }
    if (isDismissed(candidate.workflowName, dismissals)) {
      counts.dismissed++;
      continue;
    }
    passing.push(candidate);
  }

  // Carry-forward (Rule 5 — identical conventions to distil Rule 6).
  const usedPriorIds = new Set<string>();
  const resolved: ({ id: string; source: string } | null)[] = [];
  let freshCount = 0;
  for (const candidate of passing) {
    const norm = normaliseText(candidate.workflowName);
    const prior = pending.find(
      (p) => !usedPriorIds.has(p.id) && normaliseText(p.fields['workflow'] ?? p.title) === norm,
    );
    if (prior) {
      usedPriorIds.add(prior.id);
      counts.carried++;
      resolved.push({
        id: prior.id,
        source: prior.source ?? `skill-suggest (sessions: ${candidate.sessionIds.join(', ')})`,
      });
    } else {
      freshCount++;
      resolved.push(null);
    }
  }
  const freshIds = allocateSuggestionIds(root, freshCount);
  let freshIdx = 0;
  const sections: string[] = [];
  for (let i = 0; i < passing.length; i++) {
    const candidate = passing[i] as SkillCandidate;
    const r = resolved[i];
    const id = r ? r.id : (freshIds[freshIdx++] as string);
    const source = r ? r.source : `skill-suggest (sessions: ${candidate.sessionIds.join(', ')})`;
    sections.push(sectionText(id, source, candidate));
  }
  counts.proposed = sections.length;

  writeSkillSuggestionsReport({
    root,
    nowIso: now.toISOString(),
    sections,
    counts,
    thresholdN,
    notices: opts.notices ?? [],
  });
  return counts;
}

/** Degraded run: re-emit pending sections verbatim with the skip notice. */
export function writeDegradedSkillReport(root: string, notice: string, now: Date): void {
  const reportPath = path.join(root, '.cortex', 'pulse', SKILL_SUGGESTIONS_FILE);
  const pending = readPendingSections(reportPath);
  writeSkillSuggestionsReport({
    root,
    nowIso: now.toISOString(),
    sections: pending.map((p) => p.raw),
    counts: null,
    thresholdN: readThresholdN(root),
    notices: [notice],
  });
}

// ---------------------------------------------------------------------------
// bare mode — subprocess semantics identical to pulse.distil Rule 1
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

function judgmentPrompt(): string {
  return (
    `Read .cortex/pulse/${CORPUS_FILE} — this project's session messages. Mine it for repeated multi-step ` +
    `workflows Claude re-derived across sessions that deserve to become one-invocation skills. Be conservative: ` +
    `filter one-offs; cite the session ids each workflow was seen in. Output ONLY a JSON array of candidates, ` +
    `each shaped {"workflowName": "<slug>", "occurrences": number, "sessionIds": [string], ` +
    `"draftSkillMd": "<complete SKILL.md: --- name/description frontmatter + body>"}. Do not write any files.`
  );
}

// ---------------------------------------------------------------------------
// entry — same three modes as pulse.distil Rule 1
// ---------------------------------------------------------------------------

export interface SkillSuggestOptions {
  collect?: boolean;
  proposeFile?: string;
  noLlm?: boolean;
  /** Testability seams. */
  home?: string;
  claudeBin?: string;
  timeoutMs?: number;
  now?: Date;
  /** Seam for the shared collect (spec Rule 1 / "Reuses the shared corpus" AC). */
  collectFn?: (root: string, opts: CollectOptions) => CollectResult;
}

export async function runSkillSuggest(root = '.', opts: SkillSuggestOptions = {}): Promise<number> {
  const absRoot = path.resolve(root);
  const now = opts.now ?? new Date();
  const collect = opts.collectFn ?? collectCorpus;
  const collectOpts: CollectOptions = { now, ...(opts.home !== undefined ? { home: opts.home } : {}) };

  if (opts.collect && opts.proposeFile !== undefined) {
    console.error('cortex loop-skill-suggest: --collect and --propose are mutually exclusive.');
    return 1;
  }

  // Mode 1 — collect only: the SHARED collect (distil's, never re-implemented).
  if (opts.collect) {
    const result = collect(absRoot, collectOpts);
    console.log(
      `cortex loop-skill-suggest: collected ${result.messageCount} message(s) from ${result.sessionCount} session(s) ` +
        `into .cortex/pulse/${CORPUS_FILE} (shared corpus).`,
    );
    return 0;
  }

  // Mode 2 — propose only (the shipped skill's last step).
  if (opts.proposeFile !== undefined) {
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(opts.proposeFile, 'utf-8')) as unknown;
    } catch (err) {
      console.error(
        `cortex loop-skill-suggest: cannot read candidates file ${opts.proposeFile}: ${(err as Error).message}`,
      );
      return 1;
    }
    if (!Array.isArray(raw)) {
      console.error(`cortex loop-skill-suggest: candidates file ${opts.proposeFile} must hold a JSON array.`);
      return 1;
    }
    const counts = proposeSkillCandidates(absRoot, raw, { now });
    console.log(
      `cortex loop-skill-suggest: wrote .cortex/pulse/${SKILL_SUGGESTIONS_FILE} (${counts.proposed} proposal(s), ` +
        `${counts.carried} carried forward; dropped ${counts.malformed} malformed, ${counts.belowThreshold} below-threshold, ` +
        `${counts.covered} covered, ${counts.dismissed} dismissed).`,
    );
    return 0;
  }

  // Mode 3 — bare: reuse the fresh shared corpus; collect only when absent
  // (spec Rule 1 — session-reading is NOT re-invoked while the corpus is fresh).
  const corpusPath = path.join(absRoot, '.cortex', 'pulse', CORPUS_FILE);
  if (!fs.existsSync(corpusPath)) collect(absRoot, collectOpts);

  const degrade = (notice: string, exitCode: number): number => {
    writeDegradedSkillReport(absRoot, notice, now);
    console.log(`cortex loop-skill-suggest: ${notice}`);
    return exitCode;
  };

  if (opts.noLlm) {
    return degrade(
      `judgment pass skipped (--no-llm); corpus retained at .cortex/pulse/${CORPUS_FILE} for the scheduled skill run.`,
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
      return degrade(
        `judgment pass failed: ${outcome.detail}. Authenticate the Claude CLI (run \`claude\` and log in via /login), ` +
          `then re-run — corpus retained at .cortex/pulse/${CORPUS_FILE}.`,
        3,
      );
    case 'no-binary':
    case 'timeout':
    case 'error':
      return degrade(
        `judgment pass skipped (${outcome.detail}); corpus retained at .cortex/pulse/${CORPUS_FILE} for the scheduled skill run.`,
        0,
      );
    case 'ok': {
      const candidates = parseCandidatesFromOutput(outcome.stdout);
      if (candidates === null) {
        return degrade(
          `judgment pass produced no usable candidates JSON; corpus retained at .cortex/pulse/${CORPUS_FILE} for the scheduled skill run.`,
          0,
        );
      }
      const counts = proposeSkillCandidates(absRoot, candidates, { now });
      console.log(
        `cortex loop-skill-suggest: wrote .cortex/pulse/${SKILL_SUGGESTIONS_FILE} (${counts.proposed} proposal(s), ` +
          `${counts.carried} carried forward).`,
      );
      return 0;
    }
  }
}
