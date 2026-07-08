/**
 * `cortex loop-insight-gaps` — the session-observation capturer (spec
 * insight.gaps-loop; cortex-schema.md §4.10/§4.10.1/§4.10.3, v2 design §5/§6).
 * Same deterministic-bookends idiom as distil: two Core halves around an
 * agentic middle.
 *
 *  - `--collect`   gathers this project's session transcripts for the daily
 *                  window (distil's corpus machinery — the same session-reading
 *                  layer, its own watermark `pulse/.gaps-last-run`) into
 *                  `pulse/.gaps-corpus.json`.
 *  - `--propose <classification.json>` (deterministic close) routes the
 *                  five-signal judgment: signals 1–3 and 4-in-insight are direct
 *                  prose writes to `insight/map/*.md` (append / rewrite-in-place
 *                  + `## Corrections`); signals 4-in-gated and 5 become typed
 *                  pulse proposals in `pulse/insight-gaps.md` (gated-layer-update
 *                  edit / user-directed-capture) with S-ids from the shared
 *                  counter. Writes only `.md` in `map/` (+ the one file-list line
 *                  in `insight/_index.md` on new-file creation); REFUSES any
 *                  `.json` path (§4.10.3 write-lane, defence in depth).
 *  - bare          collect → spawn the Claude CLI headless for the five-signal
 *                  judgment (core-cli.init Rule 6 subprocess boundary; distil's
 *                  degradation: `--no-llm`/absent/timeout → exit 0 + notice,
 *                  retain corpus; auth → named exit 3) → propose.
 *
 * The shipped `skills/cortex-loop-insight-gaps/SKILL.md` runs collect, does the
 * five-signal judgment in-session (no nested subprocess), then `--propose`.
 *
 * Core halves are deterministic (R-001): file I/O, schema shapes, S-id
 * allocation — never an LLM call.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import matter from 'gray-matter';
import { listSessions, readSessionFile, extractMessages } from '../sessions/read.js';
import type { ExtractedMessage } from '../sessions/read.js';
import { allocateSuggestionIds } from '../pulse/suggestion-ids.js';
import { readPendingSections } from '../pulse/distil.js';
import { chooseOuterFence } from '../pulse/fences.js';
import { AUTH_FAILURE_PATTERN } from '../cli/claude-auth.js';
import { writePulseReport } from '../loops/report.js';
import { INSIGHT_PROSE_KIND } from './formats.js';

/** Nominal cadence: the previous day's transcripts (spec Notes — window is watermark-based). */
export const GAPS_FIRST_RUN_WINDOW_DAYS = 1;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 300_000;

export const GAPS_CORPUS_FILE = '.gaps-corpus.json';
export const GAPS_LAST_RUN_FILE = '.gaps-last-run';
export const GAPS_REPORT_FILE = 'insight-gaps.md';

/** The best-guess landing layer for a signal-5 capture when the judgment gives none. */
const DEFAULT_CAPTURE_TARGET = '.cortex/compass/preferences.md';

function insightDir(root: string): string {
  return path.join(root, '.cortex', 'insight');
}
function mapDir(root: string): string {
  return path.join(insightDir(root), 'map');
}
function pulseDir(root: string): string {
  return path.join(root, '.cortex', 'pulse');
}

// ---------------------------------------------------------------------------
// collect — deterministic first bookend (distil's corpus machinery, daily window)
// ---------------------------------------------------------------------------

interface CorpusSession {
  id: string;
  mtime: string;
  messages: ExtractedMessage[];
}

interface GapsCorpus {
  kind: 'gaps-corpus';
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
 * `--collect` (spec Rule 1): extract this project's messages since
 * `pulse/.gaps-last-run` (first run: the last 24h — the nominal daily window)
 * into `pulse/.gaps-corpus.json` via the session-reading layer (never
 * re-implemented). Watermark-based window (spec Notes / schema Decision 20).
 */
export function collectCorpus(root: string, opts: CollectOptions = {}): CollectResult {
  const now = opts.now ?? new Date();
  const lastRunPath = path.join(pulseDir(root), GAPS_LAST_RUN_FILE);

  let since: Date | null = null;
  if (fs.existsSync(lastRunPath)) {
    const parsed = Date.parse(fs.readFileSync(lastRunPath, 'utf-8').trim());
    if (!Number.isNaN(parsed)) since = new Date(parsed);
  }
  const firstRun = since === null;
  if (since === null) since = new Date(now.getTime() - GAPS_FIRST_RUN_WINDOW_DAYS * DAY_MS);

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

  const corpus: GapsCorpus = {
    kind: 'gaps-corpus',
    generated: now.toISOString(),
    since: since.toISOString(),
    sessions: corpusSessions,
  };
  fs.mkdirSync(pulseDir(root), { recursive: true });
  const corpusPath = path.join(pulseDir(root), GAPS_CORPUS_FILE);
  fs.writeFileSync(corpusPath, JSON.stringify(corpus, null, 2) + '\n', 'utf-8');
  return { corpusPath, sessionCount: corpusSessions.length, messageCount, sinceIso: corpus.since, firstRun };
}

// ---------------------------------------------------------------------------
// propose — deterministic second bookend (the five-signal routing, spec Rule 2)
// ---------------------------------------------------------------------------

/**
 * One classified observation from the in-session judgment (spec Rule 2). The
 * concretized classification.json shape: an array of these. `signal` selects the
 * route; a signal outside 1–5 (or evidence the judgment couldn't place) is
 * reported and produces no write.
 */
export interface GapObservation {
  signal: number;
  sessionIds: string[];
  /** Signals 1–3 + 4-in-insight: destination prose topic (stem → `map/<stem>.md`). */
  topic?: string;
  /** Explicit `map/`-relative basename override (defence-in-depth `.json` refusal path). */
  file?: string;
  /** Signals 1–3: the prose to append. Signal 5: the user's own words to capture. */
  text?: string;
  /** Signal 4: where the corrected content lives. */
  location?: 'insight' | 'gated';
  /** Signal 4-in-insight: the exact prior assertion, its correction, and why. */
  was?: string;
  now?: string;
  why?: string;
  /** Signal 4-in-gated: the gated file + byte-exact edit. Signal 5: best-guess landing. */
  target?: string;
  current?: string;
  replacement?: string;
  /** Optional section title for gated/capture proposals. */
  title?: string;
}

export interface ProposeCounts {
  appended: number;
  rewritten: number;
  gated: number;
  captured: number;
  created: number;
  unmatched: number;
}

export interface ProposeResult {
  ok: boolean;
  /** Set when a write-lane violation refused the whole run (spec Rule 4). */
  refusal?: string;
  counts: ProposeCounts;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/** Filename stem → slug, mirroring the refresh loop's cluster slug rule. */
function slugify(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'notes' : slug;
}

/**
 * The `map/`-relative basename an observation writes prose to. `file` (explicit)
 * wins over `topic` (slugged). The `.json` refusal (spec Rule 4) is enforced by
 * the caller against the returned basename.
 */
function proseBasename(obs: GapObservation): string {
  if (typeof obs.file === 'string' && obs.file.trim() !== '') {
    return path.posix.basename(obs.file.replace(/\\/g, '/'));
  }
  const stem = typeof obs.topic === 'string' && obs.topic.trim() !== '' ? obs.topic : 'notes';
  return `${slugify(stem)}.md`;
}

/** True when `target` addresses gated content (compass / atlas / RULES.md). */
function isGatedTarget(target: string | undefined): boolean {
  if (typeof target !== 'string') return false;
  const t = target.replace(/^\.\//, '').trim();
  return t.startsWith('.cortex/compass/') || t.startsWith('.cortex/atlas/') || t === 'RULES.md';
}

/** The provenance trailer appended to every loop-written prose entry (§4.10.1). */
function provenanceTrailer(nowIso: string, signal: number, sessionIds: string[]): string {
  const date = nowIso.slice(0, 10);
  const ids = sessionIds.length > 0 ? sessionIds.join(', ') : 'unknown';
  return `_(observed ${date}, signal ${signal}, sessions: ${ids})_`;
}

/** Rewrite/insert the frontmatter `updated:` line to `nowIso` (byte-stable body). */
function withUpdated(raw: string, nowIso: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---/.exec(raw);
  if (!m) return raw;
  const block = m[0];
  let next: string;
  if (/^updated:.*$/m.test(block)) {
    next = block.replace(/^updated:.*$/m, `updated: ${nowIso}`);
  } else {
    // Insert after the kind line, else before the closing fence.
    next = /^kind:.*$/m.test(block)
      ? block.replace(/^(kind:.*)$/m, `$1\nupdated: ${nowIso}`)
      : block.replace(/\r?\n---$/, `\nupdated: ${nowIso}\n---`);
  }
  return next + raw.slice(block.length);
}

/** A fresh prose file for a new category (§4.10.1 lean frontmatter). */
function newProseFile(topic: string, entryBody: string, nowIso: string): string {
  const title = topic.charAt(0).toUpperCase() + topic.slice(1);
  return (
    `---\n` +
    `kind: ${INSIGHT_PROSE_KIND}\n` +
    `updated: ${nowIso}\n` +
    `topic: ${topic}\n` +
    `---\n\n` +
    `# ${title}\n\n` +
    `${entryBody}\n`
  );
}

/**
 * Add the single file-list line for a newly-created prose file to
 * `insight/_index.md`'s "What's here" list (spec Rule 5 / §4.10.3 — the one
 * permitted write outside `map/`). Idempotent: never double-lists a file.
 */
function addIndexLine(root: string, basename: string, topic: string): void {
  const indexPath = path.join(insightDir(root), '_index.md');
  if (!fs.existsSync(indexPath)) return;
  const content = fs.readFileSync(indexPath, 'utf-8');
  const bullet = `- \`map/${basename}\` — observed ${topic} knowledge (gaps loop).`;
  if (content.includes(`map/${basename}\``)) return; // already listed
  const lines = content.split('\n');
  const idx = lines.findIndex((l) => /^\*\*What's here:\*\*/.test(l.trim()));
  if (idx < 0) {
    fs.writeFileSync(indexPath, content.replace(/\n*$/, '\n') + bullet + '\n', 'utf-8');
    return;
  }
  lines.splice(idx + 1, 0, bullet);
  fs.writeFileSync(indexPath, lines.join('\n'), 'utf-8');
}

/**
 * Signals 1–3: append a prose entry (text + provenance trailer) to
 * `map/<basename>`. Creates the file (+ the `insight/_index.md` line) when the
 * category is new (spec Rule 5). Returns whether a new file was created.
 */
function appendProse(root: string, obs: GapObservation, basename: string, nowIso: string): boolean {
  const filePath = path.join(mapDir(root), basename);
  const trailer = provenanceTrailer(nowIso, obs.signal, obs.sessionIds);
  const entry = `${(obs.text ?? '').trim()}\n${trailer}`;
  fs.mkdirSync(mapDir(root), { recursive: true });
  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const withNew = withUpdated(raw, nowIso).replace(/\n+$/, '') + `\n\n${entry}\n`;
    fs.writeFileSync(filePath, withNew, 'utf-8');
    return false;
  }
  const topic = typeof obs.topic === 'string' && obs.topic.trim() !== '' ? obs.topic : basename.replace(/\.md$/, '');
  fs.writeFileSync(filePath, newProseFile(topic, entry, nowIso), 'utf-8');
  addIndexLine(root, basename, topic);
  return true;
}

/**
 * Signal 4-in-insight (spec Rule 3, §4.10.1): locate the contradicted text
 * byte-exact via `was`, rewrite it to `now` IN PLACE, and — in the same write —
 * append one `## Corrections` entry (at most one heading per file). Returns
 * false when `was` is not found (reported, no write). The file is created fresh
 * only if it is missing (the correction still needs a home).
 */
function rewriteInPlace(root: string, obs: GapObservation, basename: string, nowIso: string): boolean {
  const filePath = path.join(mapDir(root), basename);
  if (!fs.existsSync(filePath)) return false; // nothing to rewrite → reported, no write
  const raw = fs.readFileSync(filePath, 'utf-8');
  const body = matter(raw).content;
  const was = obs.was ?? '';
  const nowText = obs.now ?? '';
  if (was === '' || !body.includes(was)) return false;

  const at = body.indexOf(was);
  let nextBody = body.slice(0, at) + nowText + body.slice(at + was.length);

  const date = nowIso.slice(0, 10);
  const ids = obs.sessionIds.length > 0 ? obs.sessionIds.join(', ') : 'unknown';
  const item = `- **${date}** — _was:_ "${was}" · _now:_ "${nowText}" · _why:_ ${obs.why ?? '(unspecified)'} · sessions: ${ids}`;
  if (/^##\s+Corrections\s*$/m.test(nextBody)) {
    nextBody = nextBody.replace(/\n+$/, '') + `\n${item}\n`;
  } else {
    nextBody = nextBody.replace(/\n+$/, '') + `\n\n## Corrections\n\n${item}\n`;
  }

  // Reassemble: the frontmatter region (with `updated` bumped) + the rewritten
  // body, in the same single write (spec Rule 3).
  const fm = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(raw);
  const frontRegion = fm ? withUpdated(fm[0], nowIso) : '';
  fs.writeFileSync(filePath, `${frontRegion}${nextBody.replace(/^\n+/, '')}`.replace(/\n*$/, '\n'), 'utf-8');
  return true;
}

/** A `gated-layer-update` edit-typed proposal section (§4.5.1/§4.5.2). */
function gatedEditSection(id: string, obs: GapObservation): string {
  const current = obs.current ?? '';
  const replacement = obs.replacement ?? '';
  const title = obs.title ?? `correction to ${obs.target ?? 'gated content'}`;
  const curFence = chooseOuterFence(current);
  const repFence = chooseOuterFence(replacement);
  return [
    `## ${id}: ${title}`,
    '',
    `**Type:** gated-layer-update`,
    `**Source:** insight-gaps (signal 4, sessions: ${obs.sessionIds.join(', ') || 'unknown'})`,
    `**Target:** ${obs.target ?? ''}`,
    '',
    `**Proposed edit:**`,
    '',
    'current:',
    curFence,
    current,
    curFence,
    'replacement:',
    repFence,
    replacement,
    repFence,
  ].join('\n');
}

/** A `user-directed-capture` proposal carrying the user's own words (§4.5.1). */
function captureSection(id: string, obs: GapObservation): string {
  const words = (obs.text ?? '').trim();
  const target = typeof obs.target === 'string' && obs.target.trim() !== '' ? obs.target : DEFAULT_CAPTURE_TARGET;
  const firstLine = words.split('\n')[0] ?? 'capture';
  const title = obs.title ?? `remember: ${firstLine.length > 60 ? firstLine.slice(0, 57) + '...' : firstLine}`;
  const fence = chooseOuterFence(words);
  return [
    `## ${id}: ${title}`,
    '',
    `**Type:** user-directed-capture`,
    `**Source:** insight-gaps (signal 5, sessions: ${obs.sessionIds.join(', ') || 'unknown'})`,
    `**Target:** ${target}`,
    '',
    `**Proposed addition:**`,
    '',
    fence,
    words,
    fence,
  ].join('\n');
}

/** Always-write (§4.5): overwrite insight-gaps.md with a fresh header + footer. */
function writeReport(root: string, nowIso: string, sections: string[], counts: ProposeCounts, notices: string[]): void {
  const lines: string[] = ['# Insight gaps', ''];
  if (sections.length === 0) {
    lines.push('No gated proposals this cycle.', '');
  } else {
    for (const section of sections) lines.push(section, '');
  }
  lines.push('---', '');
  lines.push(
    `Routed: ${counts.appended} prose append(s), ${counts.rewritten} rewrite(s)-in-place, ` +
      `${counts.gated} gated-layer-update proposal(s), ${counts.captured} user-directed-capture proposal(s), ` +
      `${counts.created} new file(s), ${counts.unmatched} unmatched (reported, no write).`,
  );
  lines.push(
    `Signals 1–3 and 4-in-insight are direct prose writes to \`insight/map/\` (ungated, with provenance). ` +
      `Gated proposals flow through \`cortex pulse-list\` / \`pulse-accept\` — this loop never mutates gated content.`,
  );
  for (const notice of notices) lines.push('', notice);
  writePulseReport(root, GAPS_REPORT_FILE, 'pulse-insight-gaps', 'cortex-loop-insight-gaps', nowIso, lines.join('\n'));
}

export interface ProposeOptions {
  now?: Date;
  notices?: string[];
}

/**
 * Spec Rule 2/3/4/6: route each observation by signal, allocate S-ids from the
 * shared counter for gated proposals only, always-write the report, and record
 * `.gaps-last-run`. Refuses the whole run (no writes) if any prose-lane target
 * is not `.md` (§4.10.3 write-lane, defence in depth).
 */
export function proposeRoutes(root: string, rawClassification: unknown, opts: ProposeOptions = {}): ProposeResult {
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const observations: GapObservation[] = [];
  const rawList: unknown[] = Array.isArray(rawClassification) ? rawClassification : [];
  for (const raw of rawList) {
    if (!isRecord(raw)) continue;
    const signal = typeof raw['signal'] === 'number' ? raw['signal'] : NaN;
    const sessionIds = isStringArray(raw['sessionIds']) ? raw['sessionIds'] : [];
    const obs: GapObservation = { signal, sessionIds };
    for (const k of ['topic', 'file', 'text', 'location', 'was', 'now', 'why', 'target', 'current', 'replacement', 'title'] as const) {
      const v = raw[k];
      if (typeof v === 'string') (obs as unknown as Record<string, unknown>)[k] = v;
    }
    observations.push(obs);
  }

  const counts: ProposeCounts = { appended: 0, rewritten: 0, gated: 0, captured: 0, created: 0, unmatched: 0 };

  // Write-lane pre-flight (spec Rule 4): any prose-lane target that is not `.md`
  // refuses the entire run before ANYTHING is written (defence in depth).
  for (const obs of observations) {
    const prose = obs.signal === 1 || obs.signal === 2 || obs.signal === 3 || (obs.signal === 4 && obs.location !== 'gated' && !isGatedTarget(obs.target));
    if (!prose) continue;
    const basename = proseBasename(obs);
    if (!basename.endsWith('.md') || basename.includes('/') || basename.includes('..')) {
      return {
        ok: false,
        refusal: `refused out-of-lane prose target "${obs.file ?? basename}": the gaps loop writes only .md in insight/map/ (§4.10.3)`,
        counts,
      };
    }
  }

  // Count the gated proposals needing fresh S-ids (spec Rule 6).
  const needsId = observations.filter(
    (o) => o.signal === 5 || (o.signal === 4 && (o.location === 'gated' || isGatedTarget(o.target))),
  ).length;
  const ids = allocateSuggestionIds(root, needsId);
  let idIdx = 0;

  // Carry forward still-pending prior proposals so the review gate never loses
  // them across always-write cycles (mirrors distil's carry-forward).
  const priorPending = readPendingSections(path.join(pulseDir(root), GAPS_REPORT_FILE)).map((p) => p.raw);
  const sections: string[] = [...priorPending];

  for (const obs of observations) {
    if (obs.signal === 1 || obs.signal === 2 || obs.signal === 3) {
      const basename = proseBasename(obs);
      const created = appendProse(root, obs, basename, nowIso);
      counts.appended++;
      if (created) counts.created++;
    } else if (obs.signal === 4) {
      if (obs.location === 'gated' || isGatedTarget(obs.target)) {
        const id = ids[idIdx++] as string;
        sections.push(gatedEditSection(id, obs));
        counts.gated++;
      } else {
        const basename = proseBasename(obs);
        if (rewriteInPlace(root, obs, basename, nowIso)) counts.rewritten++;
        else counts.unmatched++;
      }
    } else if (obs.signal === 5) {
      const id = ids[idIdx++] as string;
      sections.push(captureSection(id, obs));
      counts.captured++;
    } else {
      counts.unmatched++;
    }
  }

  writeReport(root, nowIso, sections, counts, opts.notices ?? []);
  fs.mkdirSync(pulseDir(root), { recursive: true });
  fs.writeFileSync(path.join(pulseDir(root), GAPS_LAST_RUN_FILE), `${nowIso}\n`, 'utf-8');
  return { ok: true, counts };
}

/**
 * Degraded bare run (spec Rule 1): the five-signal judgment did not happen, so
 * there is nothing to route — still-pending prior proposals are re-emitted, the
 * report states the skip, and the corpus is retained for the scheduled skill
 * run. `.gaps-last-run` is NOT advanced (the window must stay open).
 */
export function writeDegradedReport(root: string, notice: string, now: Date): void {
  const priorPending = readPendingSections(path.join(pulseDir(root), GAPS_REPORT_FILE)).map((p) => p.raw);
  writeReport(
    root,
    now.toISOString(),
    priorPending,
    { appended: 0, rewritten: 0, gated: 0, captured: 0, created: 0, unmatched: 0 },
    [notice],
  );
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
export function parseClassificationFromOutput(output: string): unknown[] | null {
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
    `Read .cortex/pulse/${GAPS_CORPUS_FILE} — this project's session messages for the daily window. ` +
    `Classify the evidence against EXACTLY five gap signals (schema §4.10): ` +
    `1 investigation load, 2 misjudgment, 3 user explanation, 4 correction to existing knowledge ` +
    `(note where the corrected content lives: insight vs gated compass/atlas/RULES.md), ` +
    `5 explicit memory-commit request ("remember this"). Evidence matching none is omitted. ` +
    `Output ONLY a JSON array of observations, each ` +
    `{"signal": 1-5, "sessionIds": [string], "topic"?: string, "text"?: string, ` +
    `"location"?: "insight"|"gated", "was"?: string, "now"?: string, "why"?: string, ` +
    `"target"?: string, "current"?: string, "replacement"?: string}. Do not write any files.`
  );
}

// ---------------------------------------------------------------------------
// entry — the three modes (spec Rule 1)
// ---------------------------------------------------------------------------

export interface GapsOptions {
  collect?: boolean;
  proposeFile?: string;
  noLlm?: boolean;
  /** Testability seams (never LLM behaviour — the subprocess stays opaque). */
  home?: string;
  claudeBin?: string;
  timeoutMs?: number;
  now?: Date;
}

export async function runGaps(root = '.', opts: GapsOptions = {}): Promise<number> {
  const absRoot = path.resolve(root);
  const now = opts.now ?? new Date();

  if (opts.collect && opts.proposeFile !== undefined) {
    console.error('cortex loop-insight-gaps: --collect and --propose are mutually exclusive.');
    return 1;
  }

  // Mode 1 — collect only (the shipped skill's first step).
  if (opts.collect) {
    const collectOpts = { now, ...(opts.home !== undefined ? { home: opts.home } : {}) };
    const result = collectCorpus(absRoot, collectOpts);
    console.log(
      `cortex loop-insight-gaps: collected ${result.messageCount} message(s) from ${result.sessionCount} session(s) ` +
        `since ${result.sinceIso} into .cortex/pulse/${GAPS_CORPUS_FILE}${result.firstRun ? ' (first run: last 24h)' : ''}.`,
    );
    return 0;
  }

  // Mode 2 — propose only (the shipped skill's last step).
  if (opts.proposeFile !== undefined) {
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(opts.proposeFile, 'utf-8')) as unknown;
    } catch (err) {
      console.error(`cortex loop-insight-gaps: cannot read classification file ${opts.proposeFile}: ${(err as Error).message}`);
      return 1;
    }
    if (!Array.isArray(raw)) {
      console.error(`cortex loop-insight-gaps: classification file ${opts.proposeFile} must hold a JSON array.`);
      return 1;
    }
    const result = proposeRoutes(absRoot, raw, { now });
    if (!result.ok) {
      console.error(`cortex loop-insight-gaps: ${result.refusal}`);
      return 1;
    }
    const c = result.counts;
    console.log(
      `cortex loop-insight-gaps: routed ${c.appended} append(s), ${c.rewritten} rewrite(s), ${c.gated} gated + ` +
        `${c.captured} capture proposal(s), ${c.created} new file(s), ${c.unmatched} unmatched.`,
    );
    return 0;
  }

  // Mode 3 — bare: collect → headless five-signal judgment → propose.
  const collectOpts = { now, ...(opts.home !== undefined ? { home: opts.home } : {}) };
  const collected = collectCorpus(absRoot, collectOpts);

  const degrade = (notice: string, exitCode: number): number => {
    writeDegradedReport(absRoot, notice, now);
    console.log(`cortex loop-insight-gaps: ${notice}`);
    return exitCode;
  };

  if (opts.noLlm) {
    return degrade(
      `judgment pass skipped (--no-llm); collect output retained at .cortex/pulse/${GAPS_CORPUS_FILE} for the scheduled skill run.`,
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
          `then re-run — collect output retained at .cortex/pulse/${GAPS_CORPUS_FILE}.`,
        3,
      );
    case 'no-binary':
    case 'timeout':
    case 'error':
      return degrade(
        `judgment pass skipped (${outcome.detail}); collect output retained at .cortex/pulse/${GAPS_CORPUS_FILE} for the scheduled skill run.`,
        0,
      );
    case 'ok': {
      const classification = parseClassificationFromOutput(outcome.stdout);
      if (classification === null) {
        return degrade(
          `judgment pass produced no usable classification JSON; collect output retained at .cortex/pulse/${GAPS_CORPUS_FILE} for the scheduled skill run.`,
          0,
        );
      }
      const result = proposeRoutes(absRoot, classification, { now });
      if (!result.ok) {
        return degrade(`judgment pass output rejected (${result.refusal}); collect output retained at .cortex/pulse/${GAPS_CORPUS_FILE}.`, 0);
      }
      const c = result.counts;
      console.log(
        `cortex loop-insight-gaps: collected ${collected.messageCount} message(s), routed ${c.appended} append(s), ` +
          `${c.rewritten} rewrite(s), ${c.gated + c.captured} proposal(s).`,
      );
      return 0;
    }
  }
}
