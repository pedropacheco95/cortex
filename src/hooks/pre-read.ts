/**
 * PreRead hook — PreToolUse on Read (spec hooks.pre-read-writeback,
 * re-pointed to insight at build-order-v3 step 7 — anatomy deprecation,
 * design §5.10; schema §5).
 *
 * The priming half of refine-during-use: before a file read, inject a
 * one-line summary from the target's **insight per-file entry**
 * (`insight/anatomy/<path>.md`, or scope-local — resolved by the insight
 * query layer): the first line of its `## Purpose` section, the entry's
 * `size_tokens`, and the applicable compass rule IDs. When the target has NO
 * insight entry the hook injects nothing (graceful absence — extraction owns
 * entry creation; never fabricate). The one-line writeback invitation that
 * hooks.post-read captures rides along unless the entry's Purpose already
 * carries a read-time provenance marker (a witnessed correction shouldn't
 * invite constant re-litigating). Registered together with post-read under
 * the one `hooks.preRead` flag (default true, §10.1); the hook also
 * self-gates on the flag so a stale registration stays silent.
 *
 * Warn-never-block: always exit 0; silence is the common case (no entry, no
 * `.cortex/`, flag off); internal errors degrade to silence + hook-errors.md.
 */
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import picomatch from 'picomatch';
import { fileQuery } from '../insight/query.js';
import { READ_TIME_MARKER } from './post-read.js';
import { appendHookError } from './errors.js';
import type { HookRunResult, HookRunOptions } from './session-start.js';

const HOOK_NAME = 'pre-read';

/**
 * Budgets (schema §5 / RULES 11), as chars at the project-wide chars/4 token
 * estimate: the summary line alone stays under 50 tokens (RULES 11 "PreRead
 * injection <50"); with the writeback invitation the payload ceiling is 75
 * tokens (the v2 two-budget precedent, schema §5). Enforced by trimming the
 * purpose — never the instruction line, whose tag must stay intact.
 */
const MAX_CHARS_WITH_INVITE = 75 * 4;
const MAX_CHARS_WITHOUT_INVITE = 50 * 4;

/**
 * Per-session read-memory for duplicate-read detection (spec Rule 4) —
 * engineering call: a transient newline-separated path list under
 * `pulse/.reads-<session_id>`, keyed by the stdin `session_id` (sanitised).
 * Transient like `.readback-applied`: pulse/ is gitignored, and losing the
 * file merely drops the "(already read this session)" note.
 */
export function readsMemoryPath(root: string, sessionId: string): string {
  const safe = sessionId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
  return path.join(root, '.cortex', 'pulse', `.reads-${safe}`);
}

const SILENT: HookRunResult = { exitCode: 0, stdout: '' };

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

/** Rule IDs whose `governs` glob matches the path — {{APPLICABLE_RULE_IDS}}. */
function applicableRuleIds(root: string, relPath: string): string[] {
  const rulesDir = path.join(root, '.cortex', 'compass', 'rules');
  let ruleFiles: string[];
  try {
    ruleFiles = fs.readdirSync(rulesDir).filter((f) => /^R-.*\.md$/.test(f)).sort();
  } catch {
    return [];
  }
  const ids: string[] = [];
  for (const ruleFile of ruleFiles) {
    try {
      const data = matter(fs.readFileSync(path.join(rulesDir, ruleFile), 'utf-8')).data as Record<string, unknown>;
      if (data['status'] === 'retired') continue;
      const id = data['id'];
      if (typeof id !== 'string' || id.length === 0) continue;
      const governsRaw = data['governs'];
      const governs = Array.isArray(governsRaw)
        ? governsRaw.filter((g): g is string => typeof g === 'string')
        : typeof governsRaw === 'string' ? [governsRaw] : [];
      const matches = governs.some((glob) => {
        try {
          return picomatch(glob)(relPath);
        } catch {
          return false;
        }
      });
      if (matches && !ids.includes(id)) ids.push(id);
    } catch {
      // Malformed rule files are check.rule / pre-write's business; a read
      // summary just omits them (silent skip keeps the read path zero-noise).
      continue;
    }
  }
  return ids;
}

/** First non-empty line of an entry's `## Purpose` section, whitespace-collapsed. */
export function purposeFirstLine(purposeSection: string): string {
  for (const line of purposeSection.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed.replace(/\s+/g, ' ');
  }
  return '';
}

export async function run(stdinJson: unknown, opts?: HookRunOptions): Promise<HookRunResult> {
  try {
    const stdin = (typeof stdinJson === 'object' && stdinJson !== null ? stdinJson : {}) as Record<
      string,
      unknown
    >;
    const root = path.resolve(
      typeof stdin['cwd'] === 'string' && stdin['cwd'] ? stdin['cwd'] : (opts?.cwd ?? process.cwd()),
    );
    const now = opts?.now ?? new Date();

    const toolInput = (stdin['tool_input'] ?? {}) as Record<string, unknown>;
    const filePath = toolInput['file_path'];
    if (typeof filePath !== 'string' || filePath.length === 0) return SILENT;

    // Rule 3: no .cortex/ (uninitialised) → silent.
    const configPath = path.join(root, '.cortex', 'cortex.config.json');
    if (!fs.existsSync(configPath)) return SILENT;

    // Rule 3: flag off → silent (default TRUE per §10.1; only explicit false opts out).
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      if ((config['hooks'] as Record<string, unknown> | undefined)?.['preRead'] === false) return SILENT;
    } catch {
      // Unparseable config: check.config's business — treat as default-on.
    }

    const relPath = path.relative(root, path.resolve(root, filePath)).replace(/\\/g, '/');
    if (relPath.startsWith('..') || path.isAbsolute(relPath) || relPath.length === 0) return SILENT;

    // Data source (schema §5, v3): the insight per-file entry. No insight
    // module or no entry → silent (graceful absence, never fabricated).
    let entryResult: ReturnType<typeof fileQuery>;
    try {
      entryResult = fileQuery(root, relPath);
    } catch (err) {
      // A malformed insight artefact degrades to silence + one log entry.
      appendHookError(
        root,
        { hook: HOOK_NAME, file: relPath, failure: `insight entry unreadable: ${(err as Error).message}` },
        now,
      );
      return SILENT;
    }
    if (!entryResult.found || !entryResult.entry || !entryResult.sections) return SILENT;

    const purposeSection = entryResult.sections['Purpose'] ?? '';
    const purpose = purposeFirstLine(purposeSection);
    if (purpose === '') return SILENT; // an entry with no purpose has nothing worth injecting
    const tokens = entryResult.entry.frontmatter.size_tokens;

    // The writeback instruction rides along ONLY while the entry's Purpose
    // carries no read-time provenance marker (post-read writes the marker).
    const invite = !purposeSection.includes(READ_TIME_MARKER);

    // Rule 4: duplicate-read detection via the per-session read-memory.
    const sessionId = typeof stdin['session_id'] === 'string' ? stdin['session_id'] : '';
    let alreadyRead = false;
    if (sessionId) {
      const memPath = readsMemoryPath(root, sessionId);
      try {
        if (fs.existsSync(memPath)) {
          alreadyRead = fs.readFileSync(memPath, 'utf-8').split('\n').includes(relPath);
        }
        if (!alreadyRead) {
          fs.mkdirSync(path.dirname(memPath), { recursive: true });
          fs.appendFileSync(memPath, relPath + '\n', 'utf-8');
        }
      } catch (err) {
        // Memory failures degrade to "no note", never to a blocked read.
        appendHookError(root, { hook: HOOK_NAME, file: path.relative(root, memPath), failure: (err as Error).message }, now);
      }
    }

    const ruleIds = applicableRuleIds(root, relPath);

    // Payload per schema §5 (v3), pinned line by line.
    const inviteLine = `If this purpose is wrong or stale after reading, emit: <cortex:purpose file="${relPath}">corrected one-line purpose</cortex:purpose>`;
    const noteLine = '(already read this session)';
    const composeSummary = (p: string): string =>
      `${relPath}: ${p} (~${tokens} tok). Rules: ${ruleIds.length > 0 ? ruleIds.join(' ') : '-'}.`;
    const compose = (p: string): string =>
      [composeSummary(p), ...(invite ? [inviteLine] : []), ...(alreadyRead ? [noteLine] : [])].join('\n');

    // Budget enforcement: trim the purpose until the payload fits — the
    // instruction line's tag is never cut.
    const budget = invite ? MAX_CHARS_WITH_INVITE : MAX_CHARS_WITHOUT_INVITE;
    let payload = compose(purpose);
    if (payload.length > budget) {
      const excess = payload.length - budget;
      payload = compose(purpose.slice(0, Math.max(0, purpose.length - excess - 1)) + '…');
    }

    return envelope(payload);
  } catch (err) {
    // Rule 5: warn-never-block — any internal crash degrades to silence.
    try {
      appendHookError(path.resolve(opts?.cwd ?? process.cwd()), {
        hook: HOOK_NAME,
        file: '(unknown)',
        failure: (err as Error).message,
      });
    } catch {
      /* swallowed */
    }
    return SILENT;
  }
}
