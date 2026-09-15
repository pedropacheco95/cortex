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
import * as fs from 'fs';
import * as path from 'path';
import { listSessions, readSessionFile, type SessionEntry } from '../sessions/read.js';
import { writePulseReport } from '../loops/report.js';
import {
  ensureEvidenceDir,
  evidenceFilePayload,
  latestEvidenceMatching,
  type EvidenceFields,
  type EvidenceFinding,
} from '../atlas/evidence.js';

/** Paths under these prefixes are loops reading their own state, not orientation (Rule 3). */
const MACHINERY_PREFIXES = ['.cortex/pulse/state/', '.cortex/pulse/reports/'];

/** Subdirectories whose reads are reported every run, including at zero (Rule 10). */
const TRACKED_SUBDIRS = ['atlas/decisions', 'pulse/threads'] as const;

/** Command words counted under the recall figure (Rule 9). */
const RECALL_COMMANDS = ['recall', 'why'] as const;

/** Search buckets by target (Rule 8). */
export type SearchTarget = 'knowledge' | 'machinery' | 'document' | 'other';

/** Search command words: a segment is a search only when its command is one of these (Rule 8). */
const SEARCH_COMMANDS = new Set(['grep', 'egrep', 'fgrep', 'rg', 'find']);

/** `.cortex/` module directories that hold project knowledge (Rule 8 knowledge bucket). */
const KNOWLEDGE_MODULES = new Set(['compass', 'atlas', 'insight', 'archive']);

/** `.cortex/` paths that are Cortex's own machinery (Rule 8 machinery bucket). */
const MACHINERY_TARGETS = new Set(['.cortex/pulse', '.cortex/cortex.config.json', '.cortex/constellation.json', '.cortex/_index.md']);

/** Root documents whose searches are the document bucket (Rule 8). */
const DOCUMENT_FILES = new Set(['cortex-schema.md', 'RULES.md', 'CLAUDE.md']);

/** Tool calls after a pointer line within which a matching Read/search counts as followed (Rule 11). */
const POINTER_WINDOW = 10;

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
  /** `cortex recall` / `cortex why` invocations, by command word — always both keys (Rule 9). */
  recallVerbs: Record<string, number>;
  /** Reads under `.cortex/` that are the assistant orienting itself. */
  orientationReads: number;
  /** Reads under `.cortex/pulse/{state,reports}/` — loop machinery (Rule 3). */
  machineryReads: number;
  /** Orientation reads bucketed by module directory. */
  readsByModule: Record<string, number>;
  /** Orientation reads under the tracked subdirectories — always every key (Rule 10). */
  readsBySubdir: Record<string, number>;
  /** Reads of `.cortex/_index.md`. */
  rootIndexReads: number;
  /** Reads of any `_index.md` below the root. */
  moduleIndexReads: number;
  /** Searches targeting `.cortex/` — kept for continuity; equals knowledge + machinery (Rule 8). */
  cortexGreps: number;
  /** Searches by target bucket (Rule 8). */
  searchesByTarget: Record<SearchTarget, number>;
  /** Hook-injected `Recall:` / `Decided:` pointer lines seen (Rule 11). */
  pointersFired: number;
  /** Pointers whose path was read or searched within the next 10 tool calls (Rule 11). */
  pointersFollowed: number;
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
    recallVerbs: Object.fromEntries(RECALL_COMMANDS.map((c) => [c, 0])),
    orientationReads: 0,
    machineryReads: 0,
    readsByModule: {},
    readsBySubdir: Object.fromEntries(TRACKED_SUBDIRS.map((d) => [d, 0])),
    rootIndexReads: 0,
    moduleIndexReads: 0,
    cortexGreps: 0,
    searchesByTarget: { knowledge: 0, machinery: 0, document: 0, other: 0 },
    pointersFired: 0,
    pointersFollowed: 0,
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
 * A path in the form the buckets compare on: forward slashes, no leading `./`,
 * and cut down to its `.cortex/`-relative form when it is under `.cortex/`.
 * Trailing slashes are dropped so `.cortex/pulse/` and `.cortex/pulse` agree.
 */
function normalisePath(raw: string): string {
  const slashes = raw.replace(/\\/g, '/').replace(/^\.\//, '');
  const relative = cortexRelative(slashes) ?? slashes;
  return relative.length > 1 ? relative.replace(/\/+$/, '') : relative;
}

/**
 * Rule 8: the bucket a search target falls in. Knowledge is the four knowledge
 * modules plus the `.cortex/` tree as a whole; machinery is pulse and the
 * three root-level machinery files; document is the root documents and
 * `.specflow/`; everything else is other.
 */
export function searchTargetOf(rawPath: string): SearchTarget {
  const p = normalisePath(rawPath);
  if (p === '.cortex') return 'knowledge';
  if (p.startsWith('.cortex/')) {
    const module = p.split('/')[1] ?? '';
    if (KNOWLEDGE_MODULES.has(module)) return 'knowledge';
    if ([...MACHINERY_TARGETS].some((t) => p === t || p.startsWith(`${t}/`))) return 'machinery';
    return 'other';
  }
  const base = p.split('/').pop() ?? '';
  if (DOCUMENT_FILES.has(base)) return 'document';
  if (p === '.specflow' || p.startsWith('.specflow/') || p.includes('/.specflow/')) return 'document';
  return 'other';
}

/** Rule 8: a token is a path operand when it has a `/`, is `.`, or carries a file extension. */
function isPathOperand(token: string): boolean {
  return token === '.' || token.includes('/') || /\.[A-Za-z0-9]+$/.test(token);
}

/**
 * Rule 8: the path operands of every search segment in an (already
 * quote-stripped) command. A segment is a search only when its command word —
 * after leading `NAME=value` assignments and after `xargs` plus its flags — is
 * a search command AND a path operand follows. A pipe filter (`| grep x`) has
 * no path operand and is never a search; each search segment yields exactly
 * one target, its first path operand.
 */
export function searchTargetsIn(unquotedCommand: string): string[] {
  const targets: string[] = [];
  for (const segment of unquotedCommand.split(/\|\||&&|[|;\n]/)) {
    const tokens = segment.trim().split(/\s+/).filter((t) => t.length > 0);
    let i = 0;
    while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i] as string)) i += 1;
    if (tokens[i] === 'xargs') {
      i += 1;
      while (i < tokens.length && (tokens[i] as string).startsWith('-')) i += 1;
    }
    const command = (tokens[i] ?? '').split('/').pop() ?? '';
    if (!SEARCH_COMMANDS.has(command)) continue;
    const operand = tokens.slice(i + 1).find((t) => !t.startsWith('-') && isPathOperand(t));
    if (operand !== undefined) targets.push(operand);
  }
  return targets;
}

/** Rule 11: one fired pointer — the path it stands for, and the `more:` tail's ref when the line carries one. */
export interface PointerTarget {
  /** The pointed path, normalised; a `T-NNN` id yields the prefix `.cortex/pulse/threads/T-NNN-`. */
  path: string;
  /** The `<ref>` of a trailing ` · more: cortex why <ref>`, when present. */
  whyRef?: string;
}

/** Rule 11's `more:` tail — parsed off the line before the target is looked for, so its ref never becomes the target. */
const MORE_TAIL_RE = /\s*·\s*more:\s*cortex why (\S+)\s*$/;

/** Rule 11 (3.4 second revision): the id shapes a pointer line may carry instead of a path, and the path each stands for. */
const ID_SHAPES: [RegExp, (id: string) => string][] = [
  [/^decision\.[^\s·]+$/, (id) => `.cortex/atlas/decisions/${id.slice('decision.'.length)}.md`],
  [/^evidence\.[^\s·]+$/, (id) => `.cortex/atlas/evidence/${id.slice('evidence.'.length)}.md`],
  [/^T-\d{3,}$/, (id) => `.cortex/pulse/threads/${id}-`],
];

/**
 * Rule 11: the pointed target of every `Recall:` / `Decided:` line in a block
 * of hook-injected text — the first `/`-bearing token of each such line
 * (trailing punctuation stripped) or, when the line carries no such token, its
 * first id-shaped token mapped to the path it stands for (3.4 second revision:
 * the `Decided:` grammar names ids, not paths). A ` · more: cortex why <ref>`
 * tail is split off first and kept as `whyRef`. Lines with neither point
 * nowhere and are not counted as fired.
 */
export function pointerTargetsIn(text: string): PointerTarget[] {
  const targets: PointerTarget[] = [];
  for (const rawLine of text.split('\n')) {
    if (!/^(Recall|Decided):/.test(rawLine)) continue;
    const tail = MORE_TAIL_RE.exec(rawLine);
    const line = tail === null ? rawLine : rawLine.slice(0, tail.index);
    const tokens = line.split(/\s+/).map((t) => t.replace(/^[`'"(\[]+|[`'"),.:;\]]+$/g, ''));
    const pathToken = tokens.find((t) => t.includes('/'));
    let pointed: string | undefined;
    if (pathToken !== undefined) pointed = normalisePath(pathToken);
    else {
      for (const token of tokens) {
        const shape = ID_SHAPES.find(([re]) => re.test(token));
        if (shape !== undefined) {
          pointed = shape[1](token);
          break;
        }
      }
    }
    if (pointed === undefined) continue;
    targets.push(tail?.[1] === undefined ? { path: pointed } : { path: pointed, whyRef: tail[1] });
  }
  return targets;
}

/** The pre-3.4-second-revision name: the pointed paths only. */
export function pointerPathsIn(text: string): string[] {
  return pointerTargetsIn(text).map((t) => t.path);
}

/** Rule 11: the hook-injected or user-entry text an entry carries, if any. */
function injectedText(entry: SessionEntry): string[] {
  const texts: string[] = [];
  if (entry.type === 'attachment') {
    const attachment = entry['attachment'];
    if (typeof attachment === 'object' && attachment !== null) {
      const a = attachment as Record<string, unknown>;
      if (a['type'] === 'hook_additional_context') {
        const content = a['content'];
        if (typeof content === 'string') texts.push(content);
        else if (Array.isArray(content)) for (const c of content) if (typeof c === 'string') texts.push(c);
      }
    }
    return texts;
  }
  if (entry.type !== 'user') return texts;
  const message = entry['message'];
  if (typeof message !== 'object' || message === null) return texts;
  const content = (message as Record<string, unknown>)['content'];
  if (typeof content === 'string') texts.push(content);
  else if (Array.isArray(content)) {
    for (const block of content) {
      if (typeof block !== 'object' || block === null) continue;
      const b = block as Record<string, unknown>;
      if (b['type'] === 'text' && typeof b['text'] === 'string') texts.push(b['text']);
    }
  }
  return texts;
}

/**
 * Rule 11: a Read of exactly the pointed path, or a search of it or a directory
 * above it. A pointed `…/T-NNN-` prefix (a thread id) matches any path in that
 * directory whose basename starts with the prefix.
 */
function follows(pointed: string, target: string, kind: 'read' | 'search'): boolean {
  const t = normalisePath(target);
  if (pointed.endsWith('-')) {
    const slash = pointed.lastIndexOf('/');
    const dir = pointed.slice(0, slash);
    const prefix = pointed.slice(slash + 1);
    const tSlash = t.lastIndexOf('/');
    const tDir = t.slice(0, tSlash);
    if ((tDir === dir || tDir.endsWith(`/${dir}`)) && t.slice(tSlash + 1).startsWith(prefix)) return true;
  }
  if (pointed === t || pointed.endsWith(`/${t}`) || t.endsWith(`/${pointed}`)) return true;
  return kind === 'search' && (pointed.startsWith(`${t}/`) || pointed.includes(`/${t}/`));
}

/** Rule 11: does a quote-stripped Bash command invoke `cortex why <ref>` in any of its segments? */
function invokesWhy(unquotedCommand: string, ref: string): boolean {
  return unquotedCommand.split(/\|\||&&|[|;\n]/).some((segment) => {
    const tokens = segment.trim().split(/\s+/);
    return tokens[0] === 'cortex' && tokens[1] === 'why' && tokens[2] === ref;
  });
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
    // Rule 11: pointers still inside their follow-through window, per session.
    let pending: { path: string; whyRef?: string; remaining: number }[] = [];

    const search = (target: string): void => {
      const bucket = searchTargetOf(target);
      counts.searchesByTarget[bucket] += 1;
      if (bucket === 'knowledge' || bucket === 'machinery') counts.cortexGreps += 1;
      pending = pending.filter((p) => {
        if (!follows(p.path, target, 'search')) return true;
        counts.pointersFollowed += 1;
        return false;
      });
    };

    for (const entry of entries) {
      for (const pointer of injectedText(entry).flatMap(pointerTargetsIn)) {
        counts.pointersFired += 1;
        pending.push({ ...pointer, remaining: POINTER_WINDOW });
      }

      for (const use of toolUses(entry)) {
        // Rule 11: every tool call spends one unit of every pending pointer's window.
        pending = pending.filter((p) => p.remaining > 0);
        for (const p of pending) p.remaining -= 1;

        if (use.name === 'Bash') {
          // Rule 2: the command string is the ONLY population for verb counts,
          // and quoted spans within it are prose, not invocation.
          const unquoted = stripQuotedSpans(str(use.input['command']));
          const verb = /\bcortex insight ([a-z]+)/.exec(unquoted);
          if (verb?.[1]) counts.insightVerbs[verb[1]] = (counts.insightVerbs[verb[1]] ?? 0) + 1;
          // Rule 9: recall/why are counted per command word, not per argument.
          const recall = /\bcortex (recall|why)\b/.exec(unquoted);
          if (recall?.[1]) counts.recallVerbs[recall[1]] = (counts.recallVerbs[recall[1]] ?? 0) + 1;
          // Rule 8: only a segment that is itself a search with a path operand counts.
          for (const target of searchTargetsIn(unquoted)) search(target);
          // Rule 11: `cortex why <ref>` with the ref a pending pointer's `more:` tail named is following.
          pending = pending.filter((p) => {
            if (p.whyRef === undefined || !invokesWhy(unquoted, p.whyRef)) return true;
            counts.pointersFollowed += 1;
            return false;
          });
          continue;
        }

        if (use.name === 'Grep') {
          const target = str(use.input['path']);
          if (target.length > 0) search(target);
          continue;
        }

        if (use.name === 'Read') {
          const filePath = str(use.input['file_path']);
          pending = pending.filter((p) => {
            if (!follows(p.path, filePath, 'read')) return true;
            counts.pointersFollowed += 1;
            return false;
          });
          const cortexPath = cortexRelative(filePath);
          if (cortexPath === null) continue;
          if (MACHINERY_PREFIXES.some((prefix) => cortexPath.startsWith(prefix))) {
            counts.machineryReads += 1;
            continue;
          }
          counts.orientationReads += 1;
          consulted = true;
          const module = moduleOf(cortexPath);
          if (module) counts.readsByModule[module] = (counts.readsByModule[module] ?? 0) + 1;
          // Rule 10: the tracked subdirectories, on top of the module bucket.
          for (const subdir of TRACKED_SUBDIRS) {
            if (cortexPath.startsWith(`.cortex/${subdir}/`)) counts.readsBySubdir[subdir] = (counts.readsBySubdir[subdir] ?? 0) + 1;
          }
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

function recallLines(counts: UsageCounts): string[] {
  return RECALL_COMMANDS.map((command) => `- \`cortex ${command}\`: ${counts.recallVerbs[command] ?? 0}`);
}

function subdirLines(counts: UsageCounts): string[] {
  return TRACKED_SUBDIRS.map((subdir) => `- \`${subdir}/\`: ${counts.readsBySubdir[subdir] ?? 0}`);
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
      '- `cortex recall` / `cortex why` invocations: not measurable',
      '- `.cortex/` reads: not measurable',
      '- Tracked subdirectory reads: not measurable',
      '- Searches targeting `.cortex/`: not measurable',
      '- Searches by target: not measurable',
      '- Pointer follow-through: not measurable',
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
    '## `cortex recall` / `cortex why` invocations',
    '',
    'Counted per command word from Bash command fields only, the same population as above.',
    '',
    ...recallLines(counts),
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
    'Tracked subdirectories (orientation reads, reported every run):',
    '',
    ...subdirLines(counts),
    '',
    `Index reads — root \`_index.md\`: ${counts.rootIndexReads}; module-level: ${counts.moduleIndexReads}.`,
    '',
    '## Searches targeting `.cortex/`',
    '',
    `${counts.cortexGreps} across ${counts.sessions} sessions.`,
    'This is the knowledge bucket plus the machinery bucket of the table below.',
    '',
    '## Searches by target',
    '',
    'A search is a command segment that is itself a `grep`/`rg`/`find` with a path operand, or a',
    'Grep tool call with a path — pipe filters are not searches. Each segment counts once.',
    '',
    '| Target | Searches |',
    '|---|---|',
    `| knowledge (\`compass/\`, \`atlas/\`, \`insight/\`, \`archive/\`) | ${counts.searchesByTarget.knowledge} |`,
    `| machinery (\`pulse/\`, config, constellation, root \`_index.md\`) | ${counts.searchesByTarget.machinery} |`,
    `| document (\`cortex-schema.md\`, \`.specflow/\`, \`RULES.md\`, \`CLAUDE.md\`) | ${counts.searchesByTarget.document} |`,
    `| other | ${counts.searchesByTarget.other} |`,
    '',
    '## Pointer follow-through',
    '',
    `Hook-injected \`Recall:\` / \`Decided:\` lines: fired ${counts.pointersFired}, followed ${counts.pointersFollowed}`,
    `across ${counts.sessions} sessions. Followed means a Read or search of the pointed path within the`,
    `next ${POINTER_WINDOW} tool calls of the same session.`,
    '',
    '## Questions asked before any consult',
    '',
    `${counts.questionSessionsWithoutConsult} of ${counts.sessions} sessions.`,
    'Counted via `AskUserQuestion` tool calls only, so this figure is a **floor** — questions',
    'asked in prose are not counted.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Rule 12 / atlas.evidence Rule 5 — `--record`
// ---------------------------------------------------------------------------

/** The evidence slug `--record` writes under: `atlas/evidence/<today>-usage.md`. */
const USAGE_EVIDENCE_SLUG = 'usage';

/** What the usage figures are about (schema §6): the hooks clause and this verb's spec. */
const USAGE_BEARS_ON = ['schema:§5', 'pulse.usage'];

/**
 * The report figures as typed findings, in the fixed order `atlas.evidence`
 * Rule 5 pins: searches by bucket, one `insight.<verb>` per verb seen
 * (sorted, `unit: invocations`), recall, the tracked reads, pointers, and
 * questions. `unit` is omitted where the metric name already says it.
 */
export function usageFindings(counts: UsageCounts): EvidenceFinding[] {
  const findings: EvidenceFinding[] = [
    { metric: 'searches.knowledge', value: counts.searchesByTarget.knowledge },
    { metric: 'searches.machinery', value: counts.searchesByTarget.machinery },
    { metric: 'searches.document', value: counts.searchesByTarget.document },
    { metric: 'searches.other', value: counts.searchesByTarget.other },
  ];
  for (const verb of Object.keys(counts.insightVerbs).sort()) {
    findings.push({ metric: `insight.${verb}`, value: counts.insightVerbs[verb] ?? 0, unit: 'invocations' });
  }
  for (const command of RECALL_COMMANDS) findings.push({ metric: `recall.${command}`, value: counts.recallVerbs[command] ?? 0 });
  for (const subdir of TRACKED_SUBDIRS) findings.push({ metric: `reads.${subdir.replace('/', '-')}`, value: counts.readsBySubdir[subdir] ?? 0 });
  findings.push(
    { metric: 'pointers.fired', value: counts.pointersFired },
    { metric: 'pointers.followed', value: counts.pointersFollowed },
    { metric: 'questions.before-consult', value: counts.questionSessionsWithoutConsult },
  );
  return findings;
}

/**
 * The evidence fields for a recording of `counts` at `now`: the Rule 7 window
 * with the session count as denominator, the findings above, the fixed
 * `bears_on`, `supersedes` the previous `*-usage.md` when one is named, and
 * the report body verbatim as narrative. Requires readable counts.
 */
export function usageEvidenceFields(counts: UsageCounts, now: Date, previous?: string): EvidenceFields {
  const from = counts.windowStart ?? now.toISOString().slice(0, 10);
  const to = counts.windowEnd ?? now.toISOString().slice(0, 10);
  return {
    slug: USAGE_EVIDENCE_SLUG,
    title: `Cortex usage over ${counts.sessions} sessions (${from} to ${to})`,
    kind: 'measurement',
    instrument: 'pulse.usage',
    window: { from, to, sessions: counts.sessions },
    findings: usageFindings(counts),
    bearsOn: [...USAGE_BEARS_ON],
    supersedes: previous === undefined ? [] : [previous],
    body: renderUsageBody(counts),
  };
}

/**
 * Write the evidence file for `counts` (Rule 12). Refusals — exit 1, nothing
 * under `atlas/`: the counts are not readable (evidence of nothing is not
 * evidence); today's file already exists (one recording per day; delete it to
 * re-record). Otherwise `atlas/evidence/` and its `_index.md` are ensured,
 * the file is written, and its path printed.
 */
function recordUsageEvidence(root: string, counts: UsageCounts, now: Date): number {
  if (!counts.readable) {
    console.error('cortex usage --record: nothing measurable — no evidence written');
    return 1;
  }
  const previous = latestEvidenceMatching(root, USAGE_EVIDENCE_SLUG);
  const { targetRel, payload } = evidenceFilePayload(usageEvidenceFields(counts, now, previous), now);
  const targetAbs = path.join(root, ...targetRel.split('/'));
  if (fs.existsSync(targetAbs)) {
    console.error(`cortex usage --record: ${targetRel} already exists — one recording per day; delete it to re-record. Nothing written.`);
    return 1;
  }
  ensureEvidenceDir(root);
  fs.writeFileSync(targetAbs, payload, 'utf-8');
  console.log(`cortex usage --record: wrote ${targetRel}`);
  return 0;
}

/**
 * Write `.cortex/pulse/reports/usage.md`. Always-write (schema §4.5), through
 * the shared pulse report writer so the header shape matches every other loop.
 * With `record`, then write the same counts as a gated evidence file
 * (Rule 12; `atlas.evidence` Rule 5) — the report is written first and
 * regardless; the recording's refusals are its own exit code.
 */
export async function runUsage(root: string, opts: CollectOptions & { now?: Date; record?: boolean } = {}): Promise<number> {
  const counts = collectUsage(root, opts);
  const now = opts.now ?? new Date();
  const generated = now.toISOString();
  const absRoot = path.resolve(root);
  const file = writePulseReport(
    absRoot,
    'usage.md',
    'pulse-usage',
    'usage',
    generated,
    renderUsageBody(counts),
  );
  console.log(`cortex usage: wrote ${path.relative(absRoot, file)}`);
  return opts.record === true ? recordUsageEvidence(absRoot, counts, now) : 0;
}
