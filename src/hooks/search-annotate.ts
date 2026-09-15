/**
 * Search-time annotation — PreToolUse on Grep and Bash (spec
 * hooks.search-annotate; schema §5 "PreToolUse (Grep/Bash)" row and the
 * "Recall pointer lines" grammar; 3.4 second revision).
 *
 * A search is where a session declares what it does not know. Before it runs,
 * this hook matches the search's target path and pattern tokens against
 * `.cortex/recall-index.json` — the only knowledge surface it opens — and
 * injects at most two POINTER LINES: names, ids, dates and paths, never a body
 * and never an instruction. The matching, ranking and formatting live in the
 * shared query module (`src/recall/query.ts`, Rule 12); this file is the
 * envelope around them: stdin classification (Rule 3), the Bash pattern text
 * (Rule 4), the once-per-session memory (Rule 9), and fail-open (Rule 10).
 *
 * Warn-never-block (RULES.md rule 6): exit 0 always; the expected empty
 * states — no stdin, no `.cortex/`, no index, a malformed index, a target
 * outside the project, no match — are silent AND unlogged; only an unexpected
 * exception reaches `pulse/reports/hook-errors.md`. Pure file I/O: one JSON
 * read (cached per process), no directory walk, no frontmatter, no
 * subprocess, no network (Rule 11's 50 ms target; R-001).
 */
import * as fs from 'fs';
import * as path from 'path';
import { appendHookError } from './errors.js';
import { searchTargetsIn, stripQuotedSpans } from '../pulse/usage.js';
import { candidateKeys, keywordMatches, loadRecallIndex, selectPointers, tokenise } from '../recall/query.js';
import type { HookRunResult, HookRunOptions } from './session-start.js';

const HOOK_NAME = 'search-annotate';

/** Rule 9: the per-session fired memory, `<root>/.cortex/pulse/state/recall-fired/<session-id>`. */
export const RECALL_FIRED_DIR = 'pulse/state/recall-fired';

/** Rule 3: at most this many search segments of one Bash command are considered. */
const MAX_SEARCH_SEGMENTS = 3;

/** Rule 4: the quoted spans of a raw command — the pattern text a search carries in quotes. */
const QUOTED_SPAN_RE = /'([^']*)'|"([^"]*)"/g;
/** `pulse.usage` Rule 8's segment separators (kept in step with `searchTargetsIn`). */
const SEGMENT_SPLIT_RE = /\|\||&&|[|;\n]/;
const ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;

const SILENT: HookRunResult = { exitCode: 0, stdout: '' };

/** The PreToolUse allow envelope (schema §5) — the same four lines pre-read.ts emits; not imported from there by design. */
function envelope(payload: string): HookRunResult {
  return {
    exitCode: 0,
    stdout: JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        additionalContext: payload,
      },
    }),
  };
}

/** The `hooks.pre-read-writeback` read-memory idiom: the session id sanitised into a file name. */
export function recallFiredPath(root: string, sessionId: string): string {
  const safe = sessionId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
  return path.join(root, '.cortex', RECALL_FIRED_DIR, safe);
}

/** What one stdin amounts to once classified: the target paths (Rule 3) and the pattern text (Rule 4). */
interface Search {
  targets: string[];
  patternText: string;
}

/**
 * Rule 4 for Bash: per search segment, the unquoted non-flag tokens other
 * than the command word and the path operand. `unquoted` is the whole command
 * with its quoted spans already blanked; a segment is a search exactly when
 * `searchTargetsIn` finds a target in it (the same classifier, applied per
 * segment), and that target is the operand to leave out.
 */
function unquotedSegmentTokens(unquoted: string): string[] {
  const words: string[] = [];
  let searches = 0;
  for (const segment of unquoted.split(SEGMENT_SPLIT_RE)) {
    if (searches >= MAX_SEARCH_SEGMENTS) break;
    const operand = searchTargetsIn(segment)[0];
    if (operand === undefined) continue;
    searches += 1;
    const tokens = segment.trim().split(/\s+/).filter((t) => t.length > 0);
    let i = 0;
    while (i < tokens.length && ASSIGNMENT_RE.test(tokens[i] as string)) i += 1;
    if (tokens[i] === 'xargs') {
      i += 1;
      while (i < tokens.length && (tokens[i] as string).startsWith('-')) i += 1;
    }
    // tokens[i] is the command word the classifier accepted.
    let operandSeen = false;
    for (const token of tokens.slice(i + 1)) {
      if (token.startsWith('-')) continue;
      if (!operandSeen && token === operand) {
        operandSeen = true;
        continue;
      }
      words.push(token);
    }
  }
  return words;
}

/** Rule 3 + Rule 4: classify the tool call; `null` means "not a search" → silent. */
function classify(toolName: unknown, toolInput: Record<string, unknown>): Search | null {
  if (toolName === 'Grep') {
    const pattern = toolInput['pattern'];
    if (typeof pattern !== 'string') return null;
    const target = toolInput['path'];
    return { targets: typeof target === 'string' && target.length > 0 ? [target] : [], patternText: pattern };
  }
  if (toolName === 'Bash') {
    const command = toolInput['command'];
    if (typeof command !== 'string' || command.length === 0) return null;
    const unquoted = stripQuotedSpans(command);
    const targets = searchTargetsIn(unquoted).slice(0, MAX_SEARCH_SEGMENTS);
    if (targets.length === 0) return null;
    const quoted: string[] = [];
    for (const m of command.matchAll(QUOTED_SPAN_RE)) quoted.push(m[1] ?? m[2] ?? '');
    return { targets, patternText: [...quoted, ...unquotedSegmentTokens(unquoted)].join(' ') };
  }
  return null;
}

/** Rule 9: the subject keys and entry ids already pointed at this session (empty when unreadable or absent). */
function readFired(memPath: string): Set<string> {
  try {
    return new Set(fs.readFileSync(memPath, 'utf-8').split('\n').filter((l) => l.length > 0));
  } catch {
    return new Set();
  }
}

export async function run(stdinJson: unknown, opts?: HookRunOptions): Promise<HookRunResult> {
  try {
    const stdin = (typeof stdinJson === 'object' && stdinJson !== null ? stdinJson : {}) as Record<string, unknown>;
    const root = path.resolve(
      typeof stdin['cwd'] === 'string' && stdin['cwd'] ? stdin['cwd'] : (opts?.cwd ?? process.cwd()),
    );
    const now = opts?.now ?? new Date();

    // Rule 3: only a Grep, or a Bash command with a real search segment, is a search.
    const toolInput = (typeof stdin['tool_input'] === 'object' && stdin['tool_input'] !== null ? stdin['tool_input'] : {}) as Record<string, unknown>;
    const search = classify(stdin['tool_name'], toolInput);
    if (search === null) return SILENT;

    // Rule 10: no `.cortex/` (uninitialised, or a cwd outside any project) → silent.
    if (!fs.existsSync(path.join(root, '.cortex', 'cortex.config.json'))) return SILENT;

    // Rule 10: a missing, malformed or mis-shaped index is an expected state, not a failure.
    const index = loadRecallIndex(root);
    if (index === null) return SILENT;

    // Rule 4: tokens and ref-shaped spans of the pattern text.
    const { tokens, refs } = tokenise(search.patternText, index);

    // Rule 5: candidate subject keys per target (Rule 5 order within a target,
    // targets in command order), then the ref-shaped spans that are subject keys.
    const subjectKeys: string[] = [];
    for (const target of search.targets) {
      for (const key of candidateKeys(root, target, index, tokens)) {
        if (!subjectKeys.includes(key)) subjectKeys.push(key);
      }
    }
    for (const ref of refs) {
      if (Object.prototype.hasOwnProperty.call(index.subjects, ref) && !subjectKeys.includes(ref)) subjectKeys.push(ref);
    }

    // Rule 6: the weak signal.
    const hits = keywordMatches(index, tokens, refs);

    // Rule 9: the per-session memory (skipped without a session_id).
    const sessionId = typeof stdin['session_id'] === 'string' && stdin['session_id'].length > 0 ? stdin['session_id'] : null;
    const memPath = sessionId === null ? null : recallFiredPath(root, sessionId);
    const alreadyFired = memPath === null ? new Set<string>() : readFired(memPath);

    // Rules 7, 8, 10: the fewest lines carrying the strongest match, within budget.
    const { lines, fired } = selectPointers(index, subjectKeys, hits, alreadyFired);
    if (lines.length === 0) return SILENT;

    // Rule 9: record after emission is decided; a failed write still emits.
    if (memPath !== null && fired.length > 0) {
      try {
        fs.mkdirSync(path.dirname(memPath), { recursive: true });
        fs.appendFileSync(memPath, fired.join('\n') + '\n', 'utf-8');
      } catch (err) {
        appendHookError(root, { hook: HOOK_NAME, file: path.relative(root, memPath), failure: (err as Error).message }, now);
      }
    }

    return envelope(lines.join('\n'));
  } catch (err) {
    // Rule 10: an unexpected exception degrades to silence + one log entry.
    try {
      appendHookError(path.resolve(opts?.cwd ?? process.cwd()), {
        hook: HOOK_NAME,
        file: '(unknown)',
        failure: (err as Error).message,
      });
    } catch {
      /* swallowed — the degradation log never becomes a failure source */
    }
    return SILENT;
  }
}
