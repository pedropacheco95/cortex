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
 * Source files are deliberately not marked (spec Notes) — with ONE narrow
 * widening at the 3.4 fifth revision (brief §3.2): the marker gains a last
 * part ` · Bugs: <B-ids, max 2>` (the subject's open/triaged bugs, newest
 * `opened` first, cut last), and a source file whose own path subject has a
 * non-empty `bugs` list gets that part ALONE (`Bugs: B-019`, plus the tail
 * when cut) after the summary and invitation — its decisions, evidence and
 * threads stay unshown, so the everyday `src/` read still costs nothing. No
 * index, a malformed index or no subject → the payload is byte-identical to
 * before, and nothing is logged.
 *
 * Rule 7 (3.4 third revision; recall work, step 4): the read-deferral mode
 * behind `hooks.readDefer` (default off) — the ONE measured exception to
 * warn-never-block (RULES.md rule 6, schema §5 row (d)). When the flag is on,
 * the session is interactive, the target is a source file with an insight
 * entry of ≥40 lines, and the path is in neither the read-memory nor the
 * per-session deferral ledger (`pulse/state/read-deferred/<session>`, <25
 * lines), the hook appends the path to that ledger and answers the Read with
 * `permissionDecision: deny` carrying four pinned lines (Purpose, Connections,
 * Rules, the retry sentence; ≤1,000 chars). The second Read always proceeds
 * with the ordinary payload. Every failure inside Rule 7 falls through to the
 * ordinary payload — never to a deny. Measured by `pulse.usage` Rule 13.
 *
 * Rule 8 (2026-09-17; parallel-wave brief §3.1): the stale marker. When the
 * entry's `source_sha256` no longer hashes the target's current body —
 * insight.cli Rule 9's comparison, `entryStaleness`, shared and in-process,
 * never git — the summary line and the Rule 7 reason's first line end with
 * ` (stale: built at <commit, 7 chars>)`. It rides inside the existing
 * ceilings (the purpose is trimmed, the marker never is) and never changes a
 * decision (RULES.md rule 6). A target that cannot be read or hashed means
 * no marker and no log entry — fail-open, the payload exactly as Rules 2–7.
 *
 * Warn-never-block: always exit 0; silence is the common case (no entry, no
 * `.cortex/`, flag off); internal errors degrade to silence + hook-errors.md.
 */
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import picomatch from 'picomatch';
import { fileQuery, entryStaleness } from '../insight/query.js';
import { READ_TIME_MARKER } from './post-read.js';
import { appendHookError } from './errors.js';
import { renameIfLegacy } from '../pulse/migrate.js';
import { candidateKeys, loadRecallIndex, markerLine, moreTail } from '../recall/query.js';
import { sessionKindFromTranscriptHead } from './transcript-head.js';
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

// ---------------------------------------------------------------------------
// Rule 7 — the read-deferral mode (3.4 third revision; recall work, step 4).
// The ONE measured exception to warn-never-block, RULES.md rule 6. Default off.
// ---------------------------------------------------------------------------

/** Rule 7(d): an entry with fewer lines than this is cheaper to read than to describe — never deferred. */
export const READ_DEFER_MIN_LINES = 40;
/** Rule 7(f): a session held this many times is never held again. */
export const READ_DEFER_CIRCUIT_BREAKER = 25;
/** Rule 7: the deny reason's ceiling, 250 tokens at the chars/4 estimate. */
export const DEFER_REASON_MAX_CHARS = 1000;
/** Rule 7(e): the per-session deferral ledger's directory under `.cortex/` (a sibling of the Rule 4 read-memory). */
export const READ_DEFER_DIR = 'pulse/state/read-deferred';
/** Rule 7: at most this many `<path>: <symbols>` items on the Connections line. */
const DEFER_CONNECTIONS_MAX = 6;

/** The per-session deferral ledger — `pulse/state/read-deferred/<sanitised session id>`, the read-memory idiom. */
export function readDeferPath(root: string, sessionId: string): string {
  const safe = sessionId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
  return path.join(root, '.cortex', READ_DEFER_DIR, safe);
}

/**
 * Rule 7(c): a deferrable kind is a source file — not a Rule 6 marked target,
 * not under `.cortex/` or `.specflow/`, not `RULES.md`, `CLAUDE.md` or the
 * schema document, and not an `_index.md` / `_overview.md`. Gated and
 * scaffolding files are read for exactness and are never deferred.
 */
export function isDeferrableKind(relPath: string): boolean {
  if (isMarkedTarget(relPath)) return false;
  if (relPath.startsWith('.cortex/') || relPath.startsWith('.specflow/')) return false;
  if (relPath === 'RULES.md' || relPath === 'CLAUDE.md' || relPath === SCHEMA_DOC_FILENAME) return false;
  if (/(^|\/)_(index|overview)\.md$/.test(relPath)) return false;
  return true;
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
  const merged: RecallSubject = { decided: [], evidence: [], threads: [], observations: [], rules: [], bugs: [] };
  for (const s of subjects) {
    merged.decided.push(...s.decided);
    merged.evidence.push(...s.evidence);
    merged.threads.push(...s.threads);
    merged.observations.push(...s.observations);
    merged.rules.push(...s.rules);
    merged.bugs.push(...s.bugs);
  }
  return merged;
}

/**
 * Rule 6's ≤50-token fit for the marker: drop the ` · more:` tail, then cut
 * `Open:` to one id, then `Decided:` to one, then (fifth revision) `Bugs:` to
 * one — the bug part is cut last because it is the part most likely to be
 * acted on. Ids are never truncated — the line is rebuilt from its parts
 * (`<Label>: <id>, <id>` joined by ` · `).
 */
function fitMarker(line: string, key: string): string {
  if (line.length <= MARKER_MAX_CHARS) return line;
  const tail = moreTail(key);
  let fitted = line.endsWith(tail) ? line.slice(0, -tail.length) : line;
  for (const label of ['Open', 'Decided', 'Bugs']) {
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

/**
 * Rule 6, the Bugs part's source-file widening (3.4 fifth revision): for a
 * target that is NOT a marked kind, the `Bugs:` part alone — built from a copy
 * of the target's own path subject with every other list emptied, so the
 * line is `Bugs: <B-ids, max 2>` plus the tail when cut. A parent directory's
 * subject never marks a file read (same rule as `recallMarker`); no subject,
 * an empty `bugs` list, no index → `null`, exactly as before.
 */
function bugsOnlyMarker(root: string, relPath: string): string | null {
  const index = loadRecallIndex(root);
  if (index === null) return null;
  const keys = candidateKeys(root, relPath, index).filter((key) => !relPath.startsWith(`${key}/`));
  for (const key of keys) {
    const subject = index.subjects[key];
    if (subject === undefined || subject.bugs.length === 0) continue;
    const line = markerLine({ decided: [], evidence: [], threads: [], observations: [], rules: [], bugs: subject.bugs }, key, index);
    if (line !== null) return fitMarker(line, key);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rule 8 — the stale marker (2026-09-17). Grammar pinned by the spec.
// ---------------------------------------------------------------------------

/** Rule 8: `<commit>` is the entry's `built_at_commit` cut to this many characters (a shorter one is used whole). */
export const STALE_MARKER_COMMIT_CHARS = 7;

/** Rule 8's parenthetical — ` (stale: built at <commit>)`, at most 31 characters (about 8 tokens). Never trimmed. */
export function staleMarker(built: string): string {
  return ` (stale: built at ${built.slice(0, STALE_MARKER_COMMIT_CHARS)})`;
}

/** Rule 7's closing sentence — the retry contract, never trimmed. */
const DEFER_RETRY_SENTENCE = 'Reading this path again proceeds without this notice.';

/** The Rule 7 deny envelope: exit 0, `permissionDecision: deny`, the reason in `permissionDecisionReason`. */
function denyEnvelope(reason: string): HookRunResult {
  return {
    exitCode: 0,
    stdout: JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  };
}

/**
 * Rule 7's `{{CONNECTIONS}}` items: the entry's `## Connections` section
 * reduced to the bullets under a `Uses:` or `Used by:` heading, each rendered
 * `<path>: <symbols>` with the bullet's explanatory tail after ` — ` dropped.
 * Bullets under any other heading (or none) are not connections.
 */
export function connectionItems(section: string): string[] {
  const items: string[] = [];
  let underConnections = false;
  for (const raw of section.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    if (!line.startsWith('- ')) {
      underConnections = /^\**(Uses|Used by)\**:/.test(line);
      continue;
    }
    if (!underConnections) continue;
    const m = /^- ([^:]+): ([^—]+)/.exec(line);
    if (m === null) continue;
    items.push(`${(m[1] as string).trim()}: ${(m[2] as string).trim()}`);
  }
  return items;
}

/**
 * Rule 7's reason, pinned line by line and fitted to DEFER_REASON_MAX_CHARS:
 * Connections items are dropped from the end first, then the purpose is
 * trimmed with `…` — never the first line's `Deferred: <path>`, never its
 * Rule 8 stale marker (`stale`, part of the fixed text after the purpose),
 * and never the closing sentence.
 */
export function deferReason(
  relPath: string,
  tokens: number,
  lines: number,
  purpose: string,
  connections: string[],
  ruleIds: string[],
  stale = '',
): string {
  const rulesLine = `Rules: ${ruleIds.length > 0 ? ruleIds.join(' ') : '-'}.`;
  const compose = (p: string, items: string[]): string =>
    [
      `Deferred: ${relPath} (~${tokens} tok, ${lines} lines). ${p}${stale}`,
      `Connections: ${items.length > 0 ? items.join('; ') : '-'}`,
      rulesLine,
      DEFER_RETRY_SENTENCE,
    ].join('\n');
  let items = connections.slice(0, DEFER_CONNECTIONS_MAX);
  let reason = compose(purpose, items);
  while (reason.length > DEFER_REASON_MAX_CHARS && items.length > 0) {
    items = items.slice(0, -1);
    reason = compose(purpose, items);
  }
  if (reason.length > DEFER_REASON_MAX_CHARS) {
    const excess = reason.length - DEFER_REASON_MAX_CHARS;
    reason = compose(purpose.slice(0, Math.max(0, purpose.length - excess - 1)) + '…', items);
  }
  return reason;
}

/** The non-empty lines of a ledger file, or `[]` when it does not exist. Throws when it cannot be read (a directory in its place). */
function ledgerLines(ledgerPath: string): string[] {
  if (!fs.existsSync(ledgerPath)) return [];
  return fs.readFileSync(ledgerPath, 'utf-8').split('\n').filter((l) => l.length > 0);
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
    // Rule 7(a): `hooks.readDefer` is on only as boolean `true` (absent, false
    // or any non-boolean → off; a non-boolean is check.config's error).
    let readDefer = false;
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      const hooks = config['hooks'] as Record<string, unknown> | undefined;
      if (hooks?.['preRead'] === false) return SILENT;
      readDefer = hooks?.['readDefer'] === true;
    } catch {
      // Unparseable config: check.config's business — treat as default-on.
    }

    const relPath = path.relative(root, path.resolve(root, filePath)).replace(/\\/g, '/');
    if (relPath.startsWith('..') || path.isAbsolute(relPath) || relPath.length === 0) return SILENT;

    // Rule 6: the recall marker for a spec / rule / decision / evidence /
    // schema-document read. Absent index or subject → null, unlogged; only an
    // unexpected throw reaches hook-errors.md (and the read still proceeds).
    // Fifth revision: any other target (a source file) gets the `Bugs:` part
    // alone when its own subject carries an open or triaged bug — nothing else.
    let marker: string | null = null;
    try {
      marker = isMarkedTarget(relPath) ? recallMarker(root, relPath) : bugsOnlyMarker(root, relPath);
    } catch (err) {
      appendHookError(root, { hook: HOOK_NAME, file: relPath, failure: `recall marker: ${(err as Error).message}` }, now);
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

    // Rule 8: the stale marker — only when the target's body was read, hashed
    // and found to differ from the entry's `source_sha256`. An unreadable
    // target (`missing`) or any throw is fail-open: no marker, nothing logged.
    let marker8 = '';
    try {
      if (entryStaleness(root, entryResult)?.reason === 'changed') {
        marker8 = staleMarker(entryResult.entry.frontmatter.built_at_commit);
      }
    } catch {
      marker8 = '';
    }

    // The writeback instruction rides along ONLY while the entry's Purpose
    // carries no read-time provenance marker (post-read writes the marker).
    const invite = !purposeSection.includes(READ_TIME_MARKER);

    const sessionId = typeof stdin['session_id'] === 'string' ? stdin['session_id'] : '';
    const ruleIds = applicableRuleIds(root, relPath);

    // Rule 7: the read-deferral mode — the ONE measured exception to
    // warn-never-block (RULES.md rule 6), default off. Conditions (a)–(g) in
    // the spec's order, cheapest first; every failure inside this block falls
    // through to the ordinary Rules 2–6 payload below, never to a deny. The
    // ledger is written BEFORE the deny so the retry is always recognised; the
    // Rule 4 read-memory is NOT written on a deferral (nothing was read).
    if (readDefer && sessionId !== '' && isDeferrableKind(relPath)) {
      try {
        const linesRaw: unknown = (entryResult.entry.frontmatter as unknown as Record<string, unknown>)['size_lines'];
        const sizeLines = typeof linesRaw === 'number' && Number.isFinite(linesRaw) ? linesRaw : 0; // (d): missing counts as tiny
        if (sizeLines >= READ_DEFER_MIN_LINES) {
          const deferPath = readDeferPath(root, sessionId);
          const memPath = readsMemoryPath(root, sessionId);
          renameIfLegacy(legacyReadsMemoryPath(root, sessionId), memPath);
          // (e) + (f): both ledgers must be readable — an unreadable ledger
          // cannot keep the one-deny-per-file guarantee, so it means allow, once logged.
          let held: string[] | null = null;
          let alreadyReadBefore = false;
          try {
            held = ledgerLines(deferPath);
            alreadyReadBefore = ledgerLines(memPath).includes(relPath);
          } catch (err) {
            appendHookError(
              root,
              { hook: HOOK_NAME, file: path.relative(root, deferPath), failure: `read deferral ledger unreadable: ${(err as Error).message}` },
              now,
            );
          }
          if (
            held !== null &&
            !alreadyReadBefore &&
            !held.includes(relPath) &&
            held.length < READ_DEFER_CIRCUIT_BREAKER &&
            // (g): interactive sessions only — scheduled and unknown never defer.
            sessionKindFromTranscriptHead(typeof stdin['transcript_path'] === 'string' ? stdin['transcript_path'] : undefined) ===
              'interactive'
          ) {
            // Order of effects: the ledger first; if the append fails, no deny.
            let appended = false;
            try {
              fs.mkdirSync(path.dirname(deferPath), { recursive: true });
              fs.appendFileSync(deferPath, relPath + '\n', 'utf-8');
              appended = true;
            } catch (err) {
              appendHookError(
                root,
                { hook: HOOK_NAME, file: path.relative(root, deferPath), failure: `read deferral ledger unwritable: ${(err as Error).message}` },
                now,
              );
            }
            if (appended) {
              return denyEnvelope(
                deferReason(relPath, tokens, sizeLines, purpose, connectionItems(entryResult.sections['Connections'] ?? ''), ruleIds, marker8),
              );
            }
          }
        }
      } catch (err) {
        // Anything else inside Rule 7 degrades to the ordinary payload plus one log entry.
        appendHookError(root, { hook: HOOK_NAME, file: relPath, failure: `read deferral: ${(err as Error).message}` }, now);
      }
    }

    // Rule 4: duplicate-read detection via the per-session read-memory.
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

    // Payload per schema §5 (v3), pinned line by line; the Rule 8 stale marker
    // is the tail of the summary line (appended after `Rules: ….`, so every
    // pin on that sentence holds); the Rule 6 marker last.
    const inviteLine = `If this purpose is wrong or stale after reading, emit: <cortex:purpose file="${relPath}">corrected one-line purpose</cortex:purpose>`;
    const noteLine = '(already read this session)';
    const composeSummary = (p: string): string =>
      `${relPath}: ${p} (~${tokens} tok). Rules: ${ruleIds.length > 0 ? ruleIds.join(' ') : '-'}.${marker8}`;
    const compose = (p: string): string =>
      [
        composeSummary(p),
        ...(invite ? [inviteLine] : []),
        ...(alreadyRead ? [noteLine] : []),
        ...(marker !== null ? [marker] : []),
      ].join('\n');

    // Budget enforcement: trim the purpose until the payload fits — the
    // instruction line's tag, the stale marker and the recall marker are never
    // cut. The recall marker extends the ceiling by its own budget (RULES 11's
    // combined figure); the stale marker counts inside it.
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
