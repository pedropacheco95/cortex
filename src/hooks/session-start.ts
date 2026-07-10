/**
 * SessionStart hook (spec hooks.session-start).
 *
 * Injects the schema §5 pointer payload (<100 tokens) on every session source,
 * plus a one-line hygiene summary when `pulse/reports/hygiene.md` is fresh.
 * Warn-never-block, self-applied: every internal error degrades to whatever
 * part of the payload is still derivable and logs to pulse/hook-errors.md.
 */
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { appendHookError } from './errors.js';
import { SCHEMA_VERSION } from '../cli/templates.js';

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
