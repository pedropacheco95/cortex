/**
 * `cortex loop-bug-triage` — the daily bug-ledger triage loop (spec
 * loops.bug-triage, design §11.4 item 13). Deterministic bookends around an
 * agentic middle, same shape as distil: `--collect` partitions open bugs into
 * unclassified/classified and writes `pulse/.triage-worklist.json`;
 * `--report <results.json>` applies the judgment's results deterministically
 * and always-writes `pulse/bug-triage.md`. Bare CLI = collect → headless
 * Claude judgment (core-cli.init Rule 6 subprocess semantics) → report. The
 * shipped skill does the judgment in-session instead.
 *
 * Rule 3 — fill-only mutation, the loop's single sanctioned cerebrum write:
 * absent `type:`/`severity:`/`proposed_fix:` frontmatter fields on OPEN bugs
 * are filled from results; present fields are NEVER overwritten — divergences
 * are reported with both readings. WRITES only: bug-triage.md, the worklist,
 * and (fill-only) open bug files. Core halves deterministic (R-001).
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import matter from 'gray-matter';
import { parseCandidatesFromOutput } from '../pulse/distil.js';
import { AUTH_FAILURE_PATTERN } from '../cli/claude-auth.js';
import { writePulseReport } from './report.js';

export const TRIAGE_WORKLIST_FILE = '.triage-worklist.json';
export const BUG_TRIAGE_REPORT_FILE = 'bug-triage.md';

/** Aged threshold (spec Rule 5): open longer than this is reported. */
export const BUG_AGED_DAYS = 30;

/** The seven-type taxonomy (schema §4.3, design §2) — the ONLY legal types. */
export const BUG_TYPES = [
  'missing-criterion',
  'incomplete-rule',
  'wrong-rule',
  'missing-dev-spec',
  'missing-business-spec',
  'layer-drift',
  'test-defect',
] as const;

const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;

const DEFAULT_TIMEOUT_MS = 300_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The three classification fields Rule 3 may fill (frontmatter keys). */
const CLASSIFICATION_FIELDS = ['type', 'severity', 'proposed_fix'] as const;
type ClassificationField = (typeof CLASSIFICATION_FIELDS)[number];

// ---------------------------------------------------------------------------
// ledger scan + collect (deterministic first bookend)
// ---------------------------------------------------------------------------

export interface OpenBug {
  id: string;
  /** Project-relative bug file path. */
  file: string;
  title: string | null;
  /** Present classification-field values (absent → null). */
  type: string | null;
  severity: string | null;
  proposedFix: string | null;
  /** `opened:` frontmatter when parseable, else the file's mtime. */
  openedIso: string | null;
}

export interface TriageWorklist {
  kind: 'triage-worklist';
  generated: string;
  /** Any of type/severity/proposed_fix absent → needs classification. */
  unclassified: OpenBug[];
  /** All three present → compare-only (Rule 3). */
  classified: OpenBug[];
}

function stringField(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** All `status: open` bugs in the ledger, sorted by filename. */
export function scanOpenBugs(root: string): OpenBug[] {
  const bugsDir = path.join(root, '.cortex', 'cerebrum', 'bugs');
  if (!fs.existsSync(bugsDir)) return [];
  const files = fs
    .readdirSync(bugsDir)
    .filter((f) => /^B-\d{3,}(-[A-Za-z0-9-]+)?\.md$/.test(f))
    .sort();
  const bugs: OpenBug[] = [];
  for (const filename of files) {
    const filePath = path.join(bugsDir, filename);
    let data: Record<string, unknown>;
    try {
      data = matter(fs.readFileSync(filePath, 'utf-8')).data as Record<string, unknown>;
    } catch {
      continue; // unparseable frontmatter → not this loop's problem (hygiene's)
    }
    // Spec Entities: the loop READS `status: open` bugs only — resolved (and
    // triaged) entries never enter the worklist.
    if (data['status'] !== 'open') continue;
    const id = stringField(data, 'id') ?? filename.replace(/\.md$/, '');
    // YAML parses a bare ISO timestamp as a Date; a quoted one stays a string.
    const openedRaw = data['opened'] instanceof Date ? (data['opened'] as Date).toISOString() : stringField(data, 'opened');
    let openedIso: string;
    if (openedRaw !== null && !Number.isNaN(Date.parse(openedRaw))) {
      openedIso = new Date(Date.parse(openedRaw)).toISOString();
    } else {
      openedIso = new Date(fs.statSync(filePath).mtimeMs).toISOString();
    }
    bugs.push({
      id,
      file: path.relative(root, filePath),
      title: stringField(data, 'title'),
      type: stringField(data, 'type'),
      severity: stringField(data, 'severity'),
      proposedFix: stringField(data, 'proposed_fix'),
      openedIso,
    });
  }
  return bugs;
}

/** Rule 1 partition: unclassified (any classification field absent) vs classified. */
export function partitionWorklist(bugs: OpenBug[], nowIso: string): TriageWorklist {
  const unclassified: OpenBug[] = [];
  const classified: OpenBug[] = [];
  for (const bug of bugs) {
    if (bug.type === null || bug.severity === null || bug.proposedFix === null) unclassified.push(bug);
    else classified.push(bug);
  }
  return { kind: 'triage-worklist', generated: nowIso, unclassified, classified };
}

export interface CollectResult {
  worklistPath: string;
  unclassified: number;
  classified: number;
}

/** `--collect`: partition open bugs and write the worklist (Rule 1). */
export function collectTriageWorklist(root: string, now: Date = new Date()): CollectResult {
  const worklist = partitionWorklist(scanOpenBugs(root), now.toISOString());
  const pulseDir = path.join(root, '.cortex', 'pulse');
  fs.mkdirSync(pulseDir, { recursive: true });
  const worklistPath = path.join(pulseDir, TRIAGE_WORKLIST_FILE);
  fs.writeFileSync(worklistPath, JSON.stringify(worklist, null, 2) + '\n', 'utf-8');
  return { worklistPath, unclassified: worklist.unclassified.length, classified: worklist.classified.length };
}

// ---------------------------------------------------------------------------
// result validation (spec Rule 2)
// ---------------------------------------------------------------------------

export interface TriageResult {
  bugId: string;
  type: string;
  severity: string | null;
  proposedFix: string | null;
  reasoning: string | null;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * Rule 2: `{bugId, type, severity, proposedFix, reasoning}`; `type` must be
 * one of the seven (§4.3). A `severity` outside the schema enum is equally
 * invalid — the loop never writes schema-invalid values into the ledger.
 * Invalid → null (skipped + counted).
 */
export function validateTriageResult(raw: unknown): TriageResult | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const bugId = optionalString(r['bugId']);
  if (bugId === null || !/^B-\d{3,}$/.test(bugId.trim())) return null;
  const type = optionalString(r['type']);
  if (type === null || !(BUG_TYPES as readonly string[]).includes(type.trim())) return null;
  const severity = optionalString(r['severity']);
  if (severity !== null && !(SEVERITIES as readonly string[]).includes(severity.trim())) return null;
  return {
    bugId: bugId.trim(),
    type: type.trim(),
    severity: severity === null ? null : severity.trim(),
    proposedFix: optionalString(r['proposedFix']),
    reasoning: optionalString(r['reasoning']),
  };
}

// ---------------------------------------------------------------------------
// fill-only apply (spec Rule 3 — the narrow sanctioned cerebrum write)
// ---------------------------------------------------------------------------

/** YAML-safe scalar for the simple `key: value` frontmatter lines we insert. */
function yamlScalar(value: string): string {
  if (/^[A-Za-z0-9][A-Za-z0-9 ._/-]*$/.test(value) && !/^(true|false|null|yes|no)$/i.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

/**
 * Insert `fields` at the end of the leading frontmatter block, touching no
 * other byte of the file. Returns null when the file has no frontmatter.
 */
export function fillFrontmatterFields(content: string, fields: Partial<Record<ClassificationField, string>>): string | null {
  const m = /^---\r?\n[\s\S]*?\r?\n---(\r?\n|$)/.exec(content);
  if (!m) return null;
  const block = m[0];
  const closeIdx = block.lastIndexOf('---');
  const insert = (Object.entries(fields) as [ClassificationField, string][])
    .map(([key, value]) => `${key}: ${yamlScalar(value)}\n`)
    .join('');
  const nextBlock = block.slice(0, closeIdx) + insert + block.slice(closeIdx);
  return nextBlock + content.slice(block.length);
}

export interface FilledBug {
  bugId: string;
  fields: { field: ClassificationField; value: string }[];
}

export interface Divergence {
  bugId: string;
  field: ClassificationField;
  /** The ledger's (human) reading — untouched. */
  ledger: string;
  /** The loop's independent re-derivation. */
  loop: string;
  reasoning: string | null;
}

export interface Agreement {
  bugId: string;
  fields: ClassificationField[];
}

export interface TriageApplication {
  received: number;
  invalid: number;
  /** Result bugIds with no matching open bug file. */
  unmatched: string[];
  filled: FilledBug[];
  agreements: Agreement[];
  divergences: Divergence[];
}

/**
 * Rule 3, per field: absent → filled from the result; present → compared —
 * equal is an agreement, different is a reported divergence (both readings +
 * the loop's reasoning) and the entry is untouched. Repeated runs converge
 * (Rule 4): a bug is filled at most once, then compare-only forever.
 */
export function applyTriageResults(root: string, rawResults: unknown[]): TriageApplication {
  const app: TriageApplication = {
    received: rawResults.length,
    invalid: 0,
    unmatched: [],
    filled: [],
    agreements: [],
    divergences: [],
  };
  const openBugs = scanOpenBugs(root);
  const byId = new Map(openBugs.map((b) => [b.id, b]));
  const seen = new Set<string>();

  for (const raw of rawResults) {
    const result = validateTriageResult(raw);
    if (result === null) {
      app.invalid++;
      continue;
    }
    const bug = byId.get(result.bugId);
    if (bug === undefined || seen.has(result.bugId)) {
      app.unmatched.push(result.bugId);
      continue;
    }
    seen.add(result.bugId);

    const pairs: { field: ClassificationField; current: string | null; proposed: string | null }[] = [
      { field: 'type', current: bug.type, proposed: result.type },
      { field: 'severity', current: bug.severity, proposed: result.severity },
      { field: 'proposed_fix', current: bug.proposedFix, proposed: result.proposedFix },
    ];

    const toFill: Partial<Record<ClassificationField, string>> = {};
    const agreed: ClassificationField[] = [];
    let diverged = false;
    for (const { field, current, proposed } of pairs) {
      if (current === null) {
        if (proposed !== null) toFill[field] = proposed;
        continue;
      }
      if (proposed === null) continue; // nothing to compare against
      if (current.trim() === proposed.trim()) {
        agreed.push(field);
      } else {
        diverged = true;
        app.divergences.push({ bugId: bug.id, field, ledger: current, loop: proposed, reasoning: result.reasoning });
      }
    }

    const fillEntries = Object.entries(toFill) as [ClassificationField, string][];
    if (fillEntries.length > 0) {
      const abs = path.join(root, bug.file);
      const next = fillFrontmatterFields(fs.readFileSync(abs, 'utf-8'), toFill);
      if (next !== null) {
        fs.writeFileSync(abs, next, 'utf-8');
        app.filled.push({ bugId: bug.id, fields: fillEntries.map(([field, value]) => ({ field, value })) });
      }
    }
    if (agreed.length > 0 && !diverged) {
      app.agreements.push({ bugId: bug.id, fields: agreed });
    }
  }
  return app;
}

// ---------------------------------------------------------------------------
// report (spec Rule 5 — always-write, four sections with explicit empty states)
// ---------------------------------------------------------------------------

function agedBugs(bugs: OpenBug[], nowMs: number): { id: string; days: number }[] {
  const aged: { id: string; days: number }[] = [];
  for (const bug of bugs) {
    if (bug.openedIso === null) continue;
    const days = Math.floor((nowMs - Date.parse(bug.openedIso)) / DAY_MS);
    if (days > BUG_AGED_DAYS) aged.push({ id: bug.id, days });
  }
  return aged;
}

export function writeBugTriageReport(
  root: string,
  app: TriageApplication | null,
  now: Date,
  notices: string[] = [],
): void {
  const openBugs = scanOpenBugs(root); // post-fill state
  const aged = agedBugs(openBugs, now.getTime());
  const lines: string[] = ['# Bug triage', ''];

  if (openBugs.length === 0) {
    lines.push('No open bugs — the ledger is clean this run.', '');
  }

  lines.push('## Filled', '');
  if (app === null || app.filled.length === 0) {
    lines.push('No classification fields filled this run.', '');
  } else {
    for (const f of app.filled) {
      lines.push(`- ${f.bugId}: filled ${f.fields.map((x) => `\`${x.field}: ${x.value}\``).join(', ')}`);
    }
    lines.push('');
  }

  lines.push('## Agreements', '');
  if (app === null || app.agreements.length === 0) {
    lines.push('No agreements to report this run.', '');
  } else {
    for (const a of app.agreements) {
      lines.push(`- ${a.bugId}: independent re-derivation agrees on ${a.fields.map((f) => `\`${f}\``).join(', ')}`);
    }
    lines.push('');
  }

  lines.push('## Divergences', '');
  if (app === null || app.divergences.length === 0) {
    lines.push('No divergences this run.', '');
  } else {
    for (const d of app.divergences) {
      lines.push(
        `- ${d.bugId} \`${d.field}\` — ledger: \`${d.ledger}\` / loop: \`${d.loop}\`` +
          (d.reasoning !== null ? ` — reasoning: ${d.reasoning}` : ''),
      );
    }
    lines.push('', 'Divergences are calibration signal both ways; the ledger entry is untouched (Rule 3).', '');
  }

  lines.push(`## Aged (open > ${BUG_AGED_DAYS} days)`, '');
  if (aged.length === 0) {
    lines.push(`No open bugs older than ${BUG_AGED_DAYS} days.`, '');
  } else {
    for (const a of aged) lines.push(`- ${a.id} — open ${a.days} days`);
    lines.push('');
  }

  lines.push('---', '');
  if (app !== null) {
    lines.push(
      `Results: ${app.received} received; ${app.filled.length} bug(s) filled, ${app.agreements.length} agreement(s), ` +
        `${app.divergences.length} divergence(s); ${app.invalid} skipped (invalid shape or taxonomy value)` +
        (app.unmatched.length > 0 ? `; ${app.unmatched.length} unmatched bug id(s): ${app.unmatched.join(', ')}` : '') +
        '.',
    );
  }
  lines.push(
    `Open bugs: ${openBugs.length}. Fill-only semantics (Rule 3): absent \`type\`/\`severity\`/\`proposed_fix\` are ` +
      'filled; present fields are NEVER overwritten — divergences land here, not in the ledger.',
  );
  for (const notice of notices) lines.push('', notice);

  writePulseReport(root, BUG_TRIAGE_REPORT_FILE, 'pulse-bug-triage', 'cortex-loop-bug-triage', now.toISOString(), lines.join('\n'));
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

function judgmentPrompt(): string {
  return (
    `Read .cortex/pulse/${TRIAGE_WORKLIST_FILE} — this project's open bugs partitioned into unclassified and ` +
    `classified. Classify EVERY listed bug against the seven-type taxonomy ` +
    `(${BUG_TYPES.join(', ')}) with the specflow-bugs diagnostic discipline: walk the spec-model layers to the ` +
    `root cause before naming a type. Output ONLY a JSON array of results, each shaped ` +
    `{"bugId": "B-NNN", "type": "<one of the seven>", "severity": "critical|high|medium|low", ` +
    `"proposedFix": string, "reasoning": string}. Do not write any files.`
  );
}

// ---------------------------------------------------------------------------
// entry — the three modes (spec Rule 1)
// ---------------------------------------------------------------------------

export interface BugTriageOptions {
  collect?: boolean;
  reportFile?: string;
  noLlm?: boolean;
  /** Testability seams (never LLM behaviour — the subprocess stays opaque). */
  claudeBin?: string;
  timeoutMs?: number;
  now?: Date;
}

export async function runBugTriage(root = '.', opts: BugTriageOptions = {}): Promise<number> {
  const absRoot = path.resolve(root);
  const now = opts.now ?? new Date();

  if (opts.collect && opts.reportFile !== undefined) {
    console.error('cortex loop-bug-triage: --collect and --report are mutually exclusive.');
    return 1;
  }

  // Mode 1 — collect only (the shipped skill's first step).
  if (opts.collect) {
    const result = collectTriageWorklist(absRoot, now);
    console.log(
      `cortex loop-bug-triage: worklist written to .cortex/pulse/${TRIAGE_WORKLIST_FILE} ` +
        `(${result.unclassified} unclassified, ${result.classified} classified open bug(s)).`,
    );
    return 0;
  }

  // Mode 2 — report only (the shipped skill's last step).
  if (opts.reportFile !== undefined) {
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(opts.reportFile, 'utf-8')) as unknown;
    } catch (err) {
      console.error(`cortex loop-bug-triage: cannot read results file ${opts.reportFile}: ${(err as Error).message}`);
      return 1;
    }
    if (!Array.isArray(raw)) {
      console.error(`cortex loop-bug-triage: results file ${opts.reportFile} must hold a JSON array.`);
      return 1;
    }
    const app = applyTriageResults(absRoot, raw);
    writeBugTriageReport(absRoot, app, now);
    console.log(
      `cortex loop-bug-triage: wrote .cortex/pulse/${BUG_TRIAGE_REPORT_FILE} (${app.filled.length} filled, ` +
        `${app.agreements.length} agreement(s), ${app.divergences.length} divergence(s), ${app.invalid} skipped).`,
    );
    return 0;
  }

  // Mode 3 — bare: collect → headless judgment subprocess → report.
  const collected = collectTriageWorklist(absRoot, now);

  const degrade = (notice: string, exitCode: number): number => {
    // Always-write (Rule 5): the deterministic bookends still report — the
    // aged section and empty-state sections carry the run's evidence.
    writeBugTriageReport(absRoot, null, now, [notice]);
    console.log(`cortex loop-bug-triage: ${notice}`);
    return exitCode;
  };

  if (collected.unclassified === 0 && collected.classified === 0) {
    writeBugTriageReport(absRoot, null, now);
    console.log('cortex loop-bug-triage: no open bugs — clean run.');
    return 0;
  }

  if (opts.noLlm) {
    return degrade(
      `judgment pass skipped (--no-llm); worklist retained at .cortex/pulse/${TRIAGE_WORKLIST_FILE} for the scheduled skill run.`,
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
          `then re-run — worklist retained at .cortex/pulse/${TRIAGE_WORKLIST_FILE}.`,
        3,
      );
    case 'no-binary':
    case 'timeout':
    case 'error':
      return degrade(
        `judgment pass skipped (${outcome.detail}); worklist retained at .cortex/pulse/${TRIAGE_WORKLIST_FILE} for the scheduled skill run.`,
        0,
      );
    case 'ok': {
      const results = parseCandidatesFromOutput(outcome.stdout);
      if (results === null) {
        return degrade(
          `judgment pass produced no usable results JSON; worklist retained at .cortex/pulse/${TRIAGE_WORKLIST_FILE} for the scheduled skill run.`,
          0,
        );
      }
      const app = applyTriageResults(absRoot, results);
      writeBugTriageReport(absRoot, app, now);
      console.log(
        `cortex loop-bug-triage: wrote .cortex/pulse/${BUG_TRIAGE_REPORT_FILE} (${app.filled.length} filled, ` +
          `${app.agreements.length} agreement(s), ${app.divergences.length} divergence(s), ${app.invalid} skipped).`,
      );
      return 0;
    }
  }
}
