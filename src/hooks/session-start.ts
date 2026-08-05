/**
 * SessionStart hook (spec hooks.session-start).
 *
 * Injects the schema §5 pointer payload (<100 tokens) on every session source,
 * plus a one-line hygiene summary when `pulse/reports/hygiene.md` is fresh,
 * plus a separately-budgeted (<=150 tokens) observations digest (schema
 * §4.10.11) when `insight/observations/` has a qualifying entry. Warn-never-
 * block, self-applied: every internal error degrades to whatever part of the
 * payload is still derivable and logs to pulse/hook-errors.md.
 */
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { appendHookError } from './errors.js';
import { SCHEMA_VERSION } from '../cli/templates.js';
import { readProfile } from '../cli/profile.js';

export interface HookRunResult {
  exitCode: number;
  stdout: string;
}

export interface HookRunOptions {
  /** Fallback project root when stdin carries no `cwd`. */
  cwd?: string;
  /** Testability seam for the hygiene freshness window. */
  now?: Date;
}

/** Budget: schema §5 / RULES.md rule 11 — payload under 100 tokens (chars/4). */
const MAX_PAYLOAD_CHARS = 396;
const DEFAULT_FRESHNESS_HOURS = 48;
/** The v3 five-module roster (schema §1) — anatomy removed at build-order-v3 step 7. */
const MODULE_DIRS = ['compass', 'atlas', 'archive', 'insight', 'pulse'];
const HOOK_NAME = 'session-start';

/** Budget: schema §4.10.11 — observations digest <=150 tokens (chars/4), separate pool from MAX_PAYLOAD_CHARS. */
const MAX_OBSERVATIONS_DIGEST_CHARS = 592;
/** schema §4.10.11: an entry qualifies when `salient: true` OR `sessions.length >= 3`. */
const OBSERVATIONS_QUALIFY_SESSIONS = 3;
const OBSERVATIONS_DIR_REL = '.cortex/insight/observations';
const OBSERVATIONS_POINTER = ' (more: .cortex/insight/observations/).';
const OBSERVATIONS_PREFIX = 'Observations: ';

/**
 * The entry line (schema §5, new at 3.3): re-arms the process gate each
 * session. Emitted only under the `specflow` profile AND only when the
 * bundle is actually installed — pointing at a skill the project does not
 * have would be noise, and a `superpowers` project has no spec-first gate to
 * re-arm. A pointer, never enforcement: hooks warn, never block (RULES 6).
 */
const ENTRY_LINE = 'Entry: run `specflow-entry` first — classify the request, then run the skill it routes to.';
const ENTRY_SKILL_REL = path.join('.claude', 'skills', 'specflow-entry');

function entryLineFor(root: string): string | null {
  if (readProfile(root) !== 'specflow') return null;
  if (!fs.existsSync(path.join(root, ENTRY_SKILL_REL))) return null;
  return ENTRY_LINE;
}

function silent(): HookRunResult {
  return { exitCode: 0, stdout: '' };
}

function envelope(payload: string): HookRunResult {
  return {
    exitCode: 0,
    stdout: JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: payload },
    }),
  };
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function firstSummaryLine(body: string): string {
  for (const line of body.split('\n')) {
    const trimmed = line.replace(/^[-*>\s]+/, '').trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    return trimmed.replace(/\s+/g, ' ');
  }
  return 'report available';
}

/** First sentence of an observation entry's body prose — the digest's "gist". */
function firstGist(body: string): string {
  for (const line of body.split('\n')) {
    const trimmed = line.replace(/^[-*>\s]+/, '').trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const normalized = trimmed.replace(/\s+/g, ' ');
    const sentence = normalized.match(/^[^.!?]*[.!?]/);
    return sentence ? sentence[0] : normalized;
  }
  return 'noted.';
}

interface QualifyingObservation {
  /** Theme = the entry filename minus `.md` (schema §4.10.11 layout). */
  theme: string;
  salient: boolean;
  sessionsCount: number;
  gist: string;
}

/**
 * Rule 4 / §4.10.11: read `.cortex/insight/observations/*.md` (skipping
 * `_index.md`), qualify each entry (`salient: true` OR `sessions.length >= 3`),
 * and report any per-entry parse failure for the caller to log — never throws.
 * Absent directory → empty result, no errors (AC "absent directory is silent").
 */
function readQualifyingObservations(root: string): {
  entries: QualifyingObservation[];
  errors: { file: string; failure: string }[];
} {
  const entries: QualifyingObservation[] = [];
  const errors: { file: string; failure: string }[] = [];
  const dir = path.join(root, '.cortex', 'insight', 'observations');
  if (!fs.existsSync(dir)) return { entries, errors };

  let filenames: string[];
  try {
    filenames = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.md') && f !== '_index.md')
      .sort();
  } catch (err) {
    errors.push({ file: OBSERVATIONS_DIR_REL, failure: `directory unreadable: ${(err as Error).message}` });
    return { entries, errors };
  }

  for (const filename of filenames) {
    const relFile = `${OBSERVATIONS_DIR_REL}/${filename}`;
    try {
      const parsed = matter(fs.readFileSync(path.join(dir, filename), 'utf-8'));
      const data = parsed.data as Record<string, unknown>;
      const salient = data['salient'] === true;
      const sessions = Array.isArray(data['sessions']) ? data['sessions'] : [];
      if (!salient && sessions.length < OBSERVATIONS_QUALIFY_SESSIONS) continue;
      entries.push({
        theme: filename.replace(/\.md$/, ''),
        salient,
        sessionsCount: sessions.length,
        gist: firstGist(parsed.content),
      });
    } catch (err) {
      errors.push({ file: relFile, failure: `frontmatter unparseable: ${(err as Error).message}` });
    }
  }
  return { entries, errors };
}

/**
 * Render qualifying entries as compact "theme: gist" one-liners inside the
 * <=150-token (592-char) digest budget, dropping lowest-priority entries
 * first. Priority (deterministic, documented per the amendment's ask):
 * salient entries before frequency-only ones, then by `sessions` count
 * descending, then alphabetically by theme for a stable tie-break.
 */
function renderObservationsDigest(entries: QualifyingObservation[]): string | null {
  if (entries.length === 0) return null;
  const ordered = [...entries].sort((a, b) => {
    if (a.salient !== b.salient) return a.salient ? -1 : 1;
    if (a.sessionsCount !== b.sessionsCount) return b.sessionsCount - a.sessionsCount;
    return a.theme.localeCompare(b.theme);
  });
  const oneLiners = ordered.map((e) => `${e.theme}: ${e.gist}`);

  const fits = (n: number): boolean =>
    (OBSERVATIONS_PREFIX + oneLiners.slice(0, n).join('; ') + OBSERVATIONS_POINTER).length <=
    MAX_OBSERVATIONS_DIGEST_CHARS;

  let included = 0;
  while (included < oneLiners.length && fits(included + 1)) included += 1;

  if (included === 0) {
    // Not even the top-priority entry fits whole — truncate its text to budget.
    const room = MAX_OBSERVATIONS_DIGEST_CHARS - OBSERVATIONS_PREFIX.length - OBSERVATIONS_POINTER.length;
    const truncated = (oneLiners[0] ?? '').slice(0, Math.max(0, room));
    return OBSERVATIONS_PREFIX + truncated + OBSERVATIONS_POINTER;
  }
  return OBSERVATIONS_PREFIX + oneLiners.slice(0, included).join('; ') + OBSERVATIONS_POINTER;
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

    // Rule 5: no config → the project isn't initialised → fully silent.
    const configPath = path.join(root, '.cortex', 'cortex.config.json');
    if (!fs.existsSync(configPath)) return silent();

    // Config (schema version + freshness window). Malformed → degrade (Rule 6).
    let schemaVersion = SCHEMA_VERSION;
    let freshnessHours = DEFAULT_FRESHNESS_HOURS;
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      if (typeof config['schemaVersion'] === 'string' && config['schemaVersion']) {
        schemaVersion = config['schemaVersion'];
      }
      const pulse = config['pulse'] as Record<string, unknown> | undefined;
      const hours = pulse?.['hygieneFreshnessHours'];
      if (typeof hours === 'number' && Number.isFinite(hours) && hours > 0) freshnessHours = hours;
    } catch (err) {
      appendHookError(
        root,
        {
          hook: HOOK_NAME,
          file: '.cortex/cortex.config.json',
          failure: `config unparseable: ${(err as Error).message}`,
        },
        now,
      );
    }

    // Pointer block (schema §5 SessionStart payload).
    const modules = MODULE_DIRS.filter((m) => fs.existsSync(path.join(root, '.cortex', m)));
    const lines = [
      `Cortex is active (schema ${schemaVersion}). See .cortex/_index.md.`,
      `Modules: ${modules.length > 0 ? modules.join(', ') : 'none'}.`,
    ];

    // Entry line (schema §5, 3.3) — the process gate, profile-scoped.
    const entryLine = entryLineFor(root);
    if (entryLine) lines.push(entryLine);

    // Rule 3: hygiene line iff the report exists and `generated` is fresh.
    const reportRel = '.cortex/pulse/reports/hygiene.md';
    const reportPath = path.join(root, reportRel);
    if (fs.existsSync(reportPath)) {
      try {
        const parsed = matter(fs.readFileSync(reportPath, 'utf-8'));
        const generated = toDate((parsed.data as Record<string, unknown>)['generated']);
        if (generated === null) {
          throw new Error('frontmatter has no parseable `generated` iso-datetime');
        }
        const ageMs = now.getTime() - generated.getTime();
        if (ageMs <= freshnessHours * 3_600_000) {
          // Fit the summary inside the §5 budget deterministically.
          const wrapper = `Hygiene:  (${reportRel}).`;
          const used = lines.join('\n').length + 1 + wrapper.length;
          const roomForSummary = Math.min(120, MAX_PAYLOAD_CHARS - used);
          const summary = firstSummaryLine(parsed.content).slice(0, Math.max(0, roomForSummary));
          lines.push(`Hygiene: ${summary} (${reportRel}).`);
        }
      } catch (err) {
        // Rule 6 / AC "malformed report": pointer still injected, error logged.
        appendHookError(
          root,
          { hook: HOOK_NAME, file: reportRel, failure: (err as Error).message },
          now,
        );
      }
    }

    let payload = lines.join('\n');
    if (payload.length > MAX_PAYLOAD_CHARS) payload = payload.slice(0, MAX_PAYLOAD_CHARS);

    // Rule 4 / schema §4.10.11: observations digest, separately budgeted (<=150
    // tok), additive to the pointer-plus-hygiene payload above.
    const { entries: qualifying, errors: obsErrors } = readQualifyingObservations(root);
    for (const err of obsErrors) {
      appendHookError(root, { hook: HOOK_NAME, file: err.file, failure: err.failure }, now);
    }
    const digest = renderObservationsDigest(qualifying);
    if (digest) payload += '\n' + digest;

    return envelope(payload);
  } catch (err) {
    // Last-resort degradation: never throw to the runner, never exit non-zero.
    try {
      const fallbackRoot = path.resolve(opts?.cwd ?? process.cwd());
      appendHookError(fallbackRoot, {
        hook: HOOK_NAME,
        file: '(unknown)',
        failure: (err as Error).message,
      });
    } catch {
      /* swallowed */
    }
    return envelope(`Cortex is active (schema ${SCHEMA_VERSION}). See .cortex/_index.md.`);
  }
}
