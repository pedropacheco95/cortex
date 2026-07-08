/**
 * PreRead hook — PreToolUse on Read (spec hooks.pre-read-writeback).
 *
 * The priming half of refine-during-use (design §5, schema §5): before a file
 * read, inject the anatomy summary — purpose, tokens, specs, applicable rules
 * — plus the one-line writeback invitation that hooks.post-read captures. The
 * invitation is suppressed when the row's `purpose_source` is already
 * `read-time` (a witnessed correction shouldn't invite constant
 * re-litigating). Registered together with post-read under the one
 * `hooks.preRead` flag (default true, §10.1); the hook also self-gates on the
 * flag so a stale registration stays silent.
 *
 * Warn-never-block: always exit 0; silence is the common case (no row, no
 * `.cortex/`, flag off); internal errors degrade to silence + hook-errors.md.
 */
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import picomatch from 'picomatch';
import {
  parseFilesMdTable,
  splitDataRowCells,
  isDataRowShape,
  purposeSourceCell,
  sanitizeCell,
  PURPOSE_SOURCE_READ_TIME,
} from '../anatomy/files-md.js';
import { appendHookError } from './errors.js';
import type { HookRunResult, HookRunOptions } from './session-start.js';

const HOOK_NAME = 'pre-read';

/**
 * Budgets (schema §5 / spec Rule 2), as chars at the project-wide chars/4
 * token estimate: <75 tokens with the writeback instruction, <50 without.
 * Enforced by trimming the purpose — never the instruction line, whose tag
 * must stay intact.
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

    // Rule 3: unscanned project / no row → silent.
    const filesMdPath = path.join(root, '.cortex', 'anatomy', 'files.md');
    if (!fs.existsSync(filesMdPath)) return SILENT;

    const relPath = path.relative(root, path.resolve(root, filePath)).replace(/\\/g, '/');
    if (relPath.startsWith('..') || path.isAbsolute(relPath) || relPath.length === 0) return SILENT;

    const table = parseFilesMdTable(fs.readFileSync(filesMdPath, 'utf-8'));
    if (table === null) {
      appendHookError(
        root,
        { hook: HOOK_NAME, file: '.cortex/anatomy/files.md', failure: 'existing files.md could not be parsed as an anatomy-files table; summary not injected' },
        now,
      );
      return SILENT;
    }

    const rowIdx = table.rowIdxByPath.get(sanitizeCell(relPath));
    if (rowIdx === undefined) return SILENT;
    const cells = splitDataRowCells(table.lines[rowIdx] ?? '');
    if (cells === null || !isDataRowShape(cells)) return SILENT; // defensive; parse guaranteed shape

    const purpose = cells[1] ?? '';
    const tokens = cells[2] ?? '?';
    const specLinks = cells[5] || '-';
    const purposeSource = purposeSourceCell(cells);

    // Rule 2: the writeback instruction rides along ONLY when the row's
    // purpose_source is not already read-time.
    const invite = purposeSource !== PURPOSE_SOURCE_READ_TIME;

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

    // Payload per schema §5, pinned line by line.
    const inviteLine = `If this purpose is wrong or stale after reading, emit: <cortex:purpose file="${relPath}">corrected one-line purpose</cortex:purpose>`;
    const noteLine = '(already read this session)';
    const composeSummary = (p: string): string =>
      `${relPath}: ${p} (~${tokens} tok). Specs: ${specLinks}. Rules: ${ruleIds.length > 0 ? ruleIds.join(' ') : '-'}.`;
    const compose = (p: string): string =>
      [composeSummary(p), ...(invite ? [inviteLine] : []), ...(alreadyRead ? [noteLine] : [])].join('\n');

    // Budget enforcement (Rule 2): trim the purpose until the payload fits —
    // the instruction line's tag is never cut.
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
