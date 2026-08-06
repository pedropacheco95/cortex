/**
 * `cortex usage` — the read-side adoption report (spec pulse.usage).
 *
 * Answers "is Cortex actually being consulted?" from evidence that already
 * exists: this project's Claude Code session transcripts, read through the
 * strictly read-only `sessions.read` layer. There is no logging hook, no
 * counter, and no runtime cost anywhere — a write-side probe would be exactly
 * the overhead this measurement exists to avoid justifying (Rule 1).
 *
 * The load-bearing counting rule is Rule 2: CLI invocations are counted only
 * inside Bash `tool_use` command fields. A count over raw transcript text
 * returns roughly 100x the true figure, because this project's specs and design
 * documents discuss those verbs constantly and every such discussion lands in a
 * transcript — the naive count reported 207 invocations of a verb that had run
 * twice.
 *
 * Deterministic Core (R-001): counting, bucketing, and rendering only. This
 * module never interprets its own numbers and emits no recommendation — what
 * the figures mean is the reader's judgment, not this command's (Rule 5).
 */
import * as path from 'path';
import { listSessions, readSessionFile, type SessionEntry } from '../sessions/read.js';
import { writePulseReport } from '../loops/report.js';

/** Paths under these prefixes are loops reading their own state, not orientation (Rule 3). */
const MACHINERY_PREFIXES = ['.cortex/pulse/state/', '.cortex/pulse/reports/'];

export interface UsageCounts {
  /** Sessions the report was computed over — the denominator for every figure (Rule 4). */
  sessions: number;
  /** Malformed transcript lines skipped by the tolerant parse (Rule 6 signal). */
  skipped: number;
  /** False when no transcript directory or no readable session existed at all. */
  readable: boolean;
  /** Window covered, ISO dates from transcript mtimes (Rule 7). */
  windowStart?: string;
  windowEnd?: string;
  /** `cortex insight <verb>` invocations, by verb. */
  insightVerbs: Record<string, number>;
  /** Reads under `.cortex/` that are the assistant orienting itself. */
  orientationReads: number;
  /** Reads under `.cortex/pulse/{state,reports}/` — loop machinery (Rule 3). */
  machineryReads: number;
  /** Orientation reads bucketed by module directory. */
  readsByModule: Record<string, number>;
  /** Reads of `.cortex/_index.md`. */
  rootIndexReads: number;
  /** Reads of any `_index.md` below the root. */
  moduleIndexReads: number;
  /** Searches targeting `.cortex/` — Grep tool calls plus bash greps. */
  cortexGreps: number;
  /** Sessions where the assistant asked before any orientation read (Rule 4). */
  questionSessionsWithoutConsult: number;
}

interface CollectOptions {
  /** Injectable home so tests never touch the real `~/.claude`. */
  home?: string;
}

function emptyCounts(): UsageCounts {
  return {
    sessions: 0,
    skipped: 0,
    readable: false,
    insightVerbs: {},
    orientationReads: 0,
    machineryReads: 0,
    readsByModule: {},
    rootIndexReads: 0,
    moduleIndexReads: 0,
    cortexGreps: 0,
    questionSessionsWithoutConsult: 0,
  };
}

/**
 * The `.cortex/`-relative form of a path, or null when it points elsewhere.
 * Accepts absolute and project-relative paths alike — a transcript records
 * whatever the caller passed, and both forms occur.
 */
export function cortexRelative(filePath: string): string | null {
  const normalised = filePath.replace(/\\/g, '/');
  const idx = normalised.indexOf('.cortex/');
  return idx === -1 ? null : normalised.slice(idx);
}

/** The module directory a `.cortex/`-relative path belongs to, if any. */
function moduleOf(cortexPath: string): string | null {
  const segments = cortexPath.split('/');
  return segments.length >= 3 && segments[1] ? segments[1] : null;
}

/** Every `tool_use` block in an entry, in order. */
function toolUses(entry: SessionEntry): { name: string; input: Record<string, unknown> }[] {
  const message = entry['message'];
  if (typeof message !== 'object' || message === null) return [];
  const content = (message as Record<string, unknown>)['content'];
  if (!Array.isArray(content)) return [];
  const uses: { name: string; input: Record<string, unknown> }[] = [];
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue;
    const b = block as Record<string, unknown>;
    if (b['type'] !== 'tool_use' || typeof b['name'] !== 'string') continue;
    const input = typeof b['input'] === 'object' && b['input'] !== null ? (b['input'] as Record<string, unknown>) : {};
    uses.push({ name: b['name'], input });
  }
  return uses;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Strip quoted spans from a shell command before matching invocations.
 *
 * Rule 2 keeps message prose out of the count; this keeps *command* prose out.
 * `echo "--- cortex insight invocations by verb ---"` and
 * `grep -oh 'cortex insight [a-z]*' *.jsonl` both carry the literal text inside
 * quotes while invoking nothing — without this, the first reports a verb named
 * `invocations`. A real invocation is never inside a quoted string, so removing
 * quoted spans is the discriminator. Unterminated quotes are dropped to end of
 * string, which is the conservative direction: it can only remove text, never
 * invent a match.
 */
export function stripQuotedSpans(command: string): string {
  return command.replace(/'[^']*'?|"[^"]*"?/g, ' ');
}

/**
 * Walk this project's transcripts and count. Every figure derives from
 * structured `tool_use` blocks — never from message prose or file content
 * (Rule 2).
 */
export function collectUsage(root: string, opts: CollectOptions = {}): UsageCounts {
  const counts = emptyCounts();

  let sessions: ReturnType<typeof listSessions>;
  try {
    sessions = listSessions(root, opts.home === undefined ? {} : { home: opts.home });
  } catch {
    return counts; // Rule 6: unreadable transcript location is an honest empty, never a throw.
  }
  if (sessions.length === 0) return counts;

  counts.readable = true;
  counts.sessions = sessions.length;
  const times = sessions.map((s) => s.mtime.getTime()).sort((a, b) => a - b);
  counts.windowStart = new Date(times[0] as number).toISOString().slice(0, 10);
  counts.windowEnd = new Date(times[times.length - 1] as number).toISOString().slice(0, 10);

  for (const session of sessions) {
    const { entries, skipped } = readSessionFile(session.path);
    counts.skipped += skipped;

    // Rule 4: did this session ask before it consulted? Tracked in stream order.
    let consulted = false;
    let askedBeforeConsulting = false;

    for (const entry of entries) {
      for (const use of toolUses(entry)) {
        if (use.name === 'Bash') {
          const command = str(use.input['command']);
          // Rule 2: the command string is the ONLY population for verb counts,
          // and quoted spans within it are prose, not invocation.
          const verb = /\bcortex insight ([a-z]+)/.exec(stripQuotedSpans(command));
          if (verb?.[1]) counts.insightVerbs[verb[1]] = (counts.insightVerbs[verb[1]] ?? 0) + 1;
          const unquoted = stripQuotedSpans(command);
          if (/\bgrep\b/.test(unquoted) && unquoted.includes('.cortex')) counts.cortexGreps += 1;
          continue;
        }

        if (use.name === 'Grep') {
          if (cortexRelative(str(use.input['path'])) !== null) counts.cortexGreps += 1;
          continue;
        }

        if (use.name === 'Read') {
          const cortexPath = cortexRelative(str(use.input['file_path']));
          if (cortexPath === null) continue;
          if (MACHINERY_PREFIXES.some((prefix) => cortexPath.startsWith(prefix))) {
            counts.machineryReads += 1;
            continue;
          }
          counts.orientationReads += 1;
          consulted = true;
          const module = moduleOf(cortexPath);
          if (module) counts.readsByModule[module] = (counts.readsByModule[module] ?? 0) + 1;
          if (cortexPath === '.cortex/_index.md') counts.rootIndexReads += 1;
          else if (cortexPath.endsWith('/_index.md')) counts.moduleIndexReads += 1;
          continue;
        }

        // Rule 4 / A5: AskUserQuestion is the ONLY question signal. A text
        // heuristic would fire on rhetorical questions and headings, producing
        // a figure no reader could interpret.
        if (use.name === 'AskUserQuestion' && !consulted) askedBeforeConsulting = true;
      }
    }

    if (askedBeforeConsulting) counts.questionSessionsWithoutConsult += 1;
  }

  return counts;
}

function verbLines(counts: UsageCounts): string[] {
  const verbs = Object.keys(counts.insightVerbs).sort();
  if (verbs.length === 0) return ['- `cortex insight`: no invocations recorded'];
  return verbs.map((verb) => `- \`cortex insight ${verb}\`: ${counts.insightVerbs[verb]}`);
}

function moduleLines(counts: UsageCounts): string[] {
  const modules = Object.keys(counts.readsByModule).sort();
  if (modules.length === 0) return ['- (none)'];
  return modules.map((module) => `- \`${module}/\`: ${counts.readsByModule[module]}`);
}

/**
 * Render the report body. Figures only — no interpretation, no recommendation,
 * no classification of the numbers as favourable or otherwise (Rule 5).
 */
export function renderUsageBody(counts: UsageCounts): string {
  if (!counts.readable) {
    return [
      '## Window',
      '',
      'No sessions were readable for this project — either no transcript directory exists yet',
      'or it holds no session files. Every figure below is **not measurable** from this run,',
      'which is not the same as an observed zero.',
      '',
      '## Figures',
      '',
      '- `cortex insight` invocations: not measurable',
      '- `.cortex/` reads: not measurable',
      '- Searches targeting `.cortex/`: not measurable',
      '- Questions asked before any consult: not measurable',
    ].join('\n');
  }

  const window =
    counts.windowStart && counts.windowEnd
      ? `${counts.sessions} sessions, ${counts.windowStart} to ${counts.windowEnd}`
      : `${counts.sessions} sessions`;

  return [
    '## Window',
    '',
    `Computed over ${window}.`,
    `Malformed transcript lines skipped: ${counts.skipped}.`,
    '',
    '## `cortex insight` invocations',
    '',
    'Counted from Bash command fields only — mentions in prose, specs, and design documents',
    'are excluded.',
    '',
    ...verbLines(counts),
    '',
    '## `.cortex/` reads',
    '',
    `Orientation reads: ${counts.orientationReads} across ${counts.sessions} sessions.`,
    `Loop machinery (\`pulse/state\`, \`pulse/reports\`): ${counts.machineryReads} — reported`,
    'separately because a loop reading its own worklist is not the assistant consulting',
    'project knowledge.',
    '',
    'Orientation reads by module:',
    '',
    ...moduleLines(counts),
    '',
    `Index reads — root \`_index.md\`: ${counts.rootIndexReads}; module-level: ${counts.moduleIndexReads}.`,
    '',
    '## Searches targeting `.cortex/`',
    '',
    `${counts.cortexGreps} across ${counts.sessions} sessions.`,
    '',
    '## Questions asked before any consult',
    '',
    `${counts.questionSessionsWithoutConsult} of ${counts.sessions} sessions.`,
    'Counted via `AskUserQuestion` tool calls only, so this figure is a **floor** — questions',
    'asked in prose are not counted.',
  ].join('\n');
}

/**
 * Write `.cortex/pulse/reports/usage.md`. Always-write (schema §4.5), through
 * the shared pulse report writer so the header shape matches every other loop.
 */
export async function runUsage(root: string, opts: CollectOptions & { now?: Date } = {}): Promise<number> {
  const counts = collectUsage(root, opts);
  const generated = (opts.now ?? new Date()).toISOString();
  const file = writePulseReport(
    path.resolve(root),
    'usage.md',
    'pulse-usage',
    'usage',
    generated,
    renderUsageBody(counts),
  );
  console.log(`cortex usage: wrote ${path.relative(path.resolve(root), file)}`);
  return 0;
}
