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
 * Rule 6 (3.4 second revision; recall work, step 3): a read of a spec file, a
 * compass rule, an atlas decision or evidence file, or `cortex-schema.md` is
 * looked up in `.cortex/recall-index.json` — and nothing else — and, when the
 * index holds a subject for it, ONE marker line (`Decided: … · Evidence: … ·
 * Open: …`, schema §5 row (c)) rides after the payload above, or stands alone
 * when the target has no insight entry (the usual case for those kinds).
 * Source files are deliberately not marked (spec Notes). No index, a
 * malformed index or no subject → the payload is byte-identical to before,
 * and nothing is logged.
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
import { renameIfLegacy } from '../pulse/migrate.js';
import { candidateKeys, loadRecallIndex, markerLine, moreTail } from '../recall/query.js';
import type { RecallSubject } from '../recall/index.js';
import { SCHEMA_DOC_FILENAME } from '../schema/clauses.js';
import type { HookRunResult, HookRunOptions } from './session-start.js';

const HOOK_NAME = 'pre-read';

/**
 * Budgets (schema §5 / RULES 11), as chars at the project-wide chars/4 token
 * estimate: the summary line alone stays under 50 tokens (RULES 11 "PreRead
 * injection <50"); with the writeback invitation the payload ceiling is 75
 * tokens (the v2 two-budget precedent, schema §5). Enforced by trimming the
 * purpose — never the instruction line, whose tag must stay intact.
 *
 * The recall marker (Rule 6) adds at most 50 tokens on top of whichever of
 * the two applies — RULES 11's combined ceiling of 100 / 125 is one extended
 * figure, not a second pool. The marker is fitted on its own (ids are never
 * truncated; the tail, then the `Open:` and `Decided:` lists are cut) and the
 * purpose is trimmed as before against the extended ceiling.
 */
const MAX_CHARS_WITH_INVITE = 75 * 4;
const MAX_CHARS_WITHOUT_INVITE = 50 * 4;
const MARKER_MAX_CHARS = 50 * 4;

/**
 * Per-session read-memory for duplicate-read detection (spec Rule 4) —
 * engineering call: a transient newline-separated path list under
 * `pulse/state/reads/<session_id>`, keyed by the stdin `session_id`
 * (sanitised). Transient like `readback-applied`: pulse/ is gitignored, and
 * losing the file merely drops the "(already read this session)" note. The
 * legacy flat `pulse/.reads-<session_id>` is self-healed on first use
 * ({@link legacyReadsMemoryPath}).
 */
export function readsMemoryPath(root: string, sessionId: string): string {
  const safe = sessionId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
  return path.join(root, '.cortex', 'pulse', 'state', 'reads', safe);
}

/** The pre-reorg flat location for a session's read ledger (self-heal source). */
export function legacyReadsMemoryPath(root: string, sessionId: string): string {
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

// ---------------------------------------------------------------------------
// Rule 6 — the recall marker
// ---------------------------------------------------------------------------

/** The target kinds Rule 6 marks: spec files, compass rules, atlas decision / evidence files (not their `_index.md`), the schema document. */
const MARKED_TARGET_RES: readonly RegExp[] = [
  /^\.specflow\/specs\/.+\.spec\.md$/,
  /^\.specflow\/specs-business\/.+\.business\.md$/,
  /^\.cortex\/compass\/rules\/R-\d{3,}[^/]*\.md$/,
  /^\.cortex\/atlas\/(?:decisions|evidence)\/[^/_][^/]*\.md$/,
];

/** Rule 6: whether a project-relative POSIX path is a kind the marker applies to. Source files never are. */
export function isMarkedTarget(relPath: string): boolean {
  return relPath === SCHEMA_DOC_FILENAME || MARKED_TARGET_RES.some((re) => re.test(relPath));
}

/** Every list of `subjects` merged into one — the schema document's aggregate over its clause subjects. */
function mergeSubjects(subjects: RecallSubject[]): RecallSubject {
  const merged: RecallSubject = { decided: [], evidence: [], threads: [], observations: [] };
  for (const s of subjects) {
    merged.decided.push(...s.decided);
    merged.evidence.push(...s.evidence);
    merged.threads.push(...s.threads);
    merged.observations.push(...s.observations);
  }
  return merged;
}

/**
 * Rule 6's ≤50-token fit for the marker: drop the ` · more:` tail, then cut
 * `Open:` to one id, then `Decided:` to one. Ids are never truncated — the
 * line is rebuilt from its parts (`<Label>: <id>, <id>` joined by ` · `).
 */
function fitMarker(line: string, key: string): string {
  if (line.length <= MARKER_MAX_CHARS) return line;
  const tail = moreTail(key);
  let fitted = line.endsWith(tail) ? line.slice(0, -tail.length) : line;
  for (const label of ['Open', 'Decided']) {
    if (fitted.length <= MARKER_MAX_CHARS) break;
    fitted = fitted
      .split(' · ')
      .map((part) => (part.startsWith(`${label}: `) ? `${label}: ${part.slice(label.length + 2).split(', ')[0]}` : part))
      .join(' · ');
  }
  return fitted;
}

/**
 * The marker line for a marked target, or `null` when there is no index, no
 * subject, or the subject has nothing to show. Reads the index through the
 * cached loader only; a missing or malformed index is an expected state.
 * Candidate keys are the target's own (`hooks.search-annotate` Rule 5 a, c, d,
 * e) — a parent directory's subject does not mark a file read (schema §5 row
 * (c) names the path, the spec id, `R-NNN` and the clause subjects only).
 */
function recallMarker(root: string, relPath: string): string | null {
  const index = loadRecallIndex(root);
  if (index === null) return null;
  const keys = candidateKeys(root, relPath, index).filter((key) => !relPath.startsWith(`${key}/`));
  if (keys.length === 0) return null;
  if (relPath === SCHEMA_DOC_FILENAME) {
    const merged = mergeSubjects(keys.map((key) => index.subjects[key]).filter((s): s is RecallSubject => s !== undefined));
    const line = markerLine(merged, SCHEMA_DOC_FILENAME, index);
    return line === null ? null : fitMarker(line, SCHEMA_DOC_FILENAME);
  }
  for (const key of keys) {
    const subject = index.subjects[key];
    if (subject === undefined) continue;
    const line = markerLine(subject, key, index);
    if (line !== null) return fitMarker(line, key);
  }
  return null;
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

    // Rule 6: the recall marker for a spec / rule / decision / evidence /
    // schema-document read. Absent index or subject → null, unlogged; only an
    // unexpected throw reaches hook-errors.md (and the read still proceeds).
    let marker: string | null = null;
    if (isMarkedTarget(relPath)) {
      try {
        marker = recallMarker(root, relPath);
      } catch (err) {
        appendHookError(root, { hook: HOOK_NAME, file: relPath, failure: `recall marker: ${(err as Error).message}` }, now);
      }
    }
    // With no insight entry the marker stands alone; with neither, silence.
    const markerAlone = (): HookRunResult => (marker === null ? SILENT : envelope(marker));

    // Data source (schema §5, v3): the insight per-file entry. No insight
    // module or no entry → the marker alone or silence (graceful absence,
    // never fabricated).
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
      return markerAlone();
    }
    if (!entryResult.found || !entryResult.entry || !entryResult.sections) return markerAlone();

    const purposeSection = entryResult.sections['Purpose'] ?? '';
    const purpose = purposeFirstLine(purposeSection);
    if (purpose === '') return markerAlone(); // an entry with no purpose has nothing worth injecting
    const tokens = entryResult.entry.frontmatter.size_tokens;

    // The writeback instruction rides along ONLY while the entry's Purpose
    // carries no read-time provenance marker (post-read writes the marker).
    const invite = !purposeSection.includes(READ_TIME_MARKER);

    // Rule 4: duplicate-read detection via the per-session read-memory.
    const sessionId = typeof stdin['session_id'] === 'string' ? stdin['session_id'] : '';
    let alreadyRead = false;
    if (sessionId) {
      const memPath = readsMemoryPath(root, sessionId);
      // Cheap O(1) self-heal (a hook must not run the full pulse migration):
      // carry a legacy flat `.reads-<id>` into state/reads/<id> once.
      renameIfLegacy(legacyReadsMemoryPath(root, sessionId), memPath);
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

    // Payload per schema §5 (v3), pinned line by line; the Rule 6 marker last.
    const inviteLine = `If this purpose is wrong or stale after reading, emit: <cortex:purpose file="${relPath}">corrected one-line purpose</cortex:purpose>`;
    const noteLine = '(already read this session)';
    const composeSummary = (p: string): string =>
      `${relPath}: ${p} (~${tokens} tok). Rules: ${ruleIds.length > 0 ? ruleIds.join(' ') : '-'}.`;
    const compose = (p: string): string =>
      [
        composeSummary(p),
        ...(invite ? [inviteLine] : []),
        ...(alreadyRead ? [noteLine] : []),
        ...(marker !== null ? [marker] : []),
      ].join('\n');

    // Budget enforcement: trim the purpose until the payload fits — the
    // instruction line's tag and the marker are never cut. The marker extends
    // the ceiling by its own budget (RULES 11's combined figure).
    const budget = (invite ? MAX_CHARS_WITH_INVITE : MAX_CHARS_WITHOUT_INVITE) + (marker !== null ? MARKER_MAX_CHARS : 0);
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
