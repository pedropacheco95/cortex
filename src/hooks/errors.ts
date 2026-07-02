/**
 * `.cortex/pulse/hook-errors.md` — the hooks' degradation log (schema §4.5).
 *
 * Hooks APPEND one structured entry per internal error (hook name, file
 * involved, failure, iso-datetime), capped at the most recent 100 entries.
 * Header carries `kind: pulse-hook-errors` plus the §4.5 pulse fields.
 *
 * The appender itself must never throw — it is the degradation path of the
 * warn-never-block invariant (RULES.md rule 6), so its own failures are
 * swallowed.
 */
import * as fs from 'fs';
import * as path from 'path';

export interface HookErrorEntry {
  /** The hook that degraded, e.g. `session-start`, `pre-write`, `post-write`. */
  hook: string;
  /** The file involved in the failure (project-relative where possible). */
  file: string;
  /** One-line description of the failure. */
  failure: string;
}

export const HOOK_ERRORS_CAP = 100;

const ENTRY_PREFIX = '- hook: ';

function oneLine(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Append one structured degradation entry, creating the file (with its §4.5
 * header) on first use and keeping only the most recent 100 entries.
 * No-ops when `.cortex/` does not exist (uninitialised project — never
 * scaffold from a hook) or on any internal failure.
 */
export function appendHookError(root: string, entry: HookErrorEntry, now: Date = new Date()): void {
  try {
    const cortexDir = path.join(root, '.cortex');
    if (!fs.existsSync(cortexDir)) return;
    const pulseDir = path.join(cortexDir, 'pulse');
    fs.mkdirSync(pulseDir, { recursive: true });
    const filePath = path.join(pulseDir, 'hook-errors.md');

    // Collect existing entry lines (append-not-overwrite, §4.5).
    const existing: string[] = [];
    if (fs.existsSync(filePath)) {
      try {
        for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
          if (line.startsWith(ENTRY_PREFIX)) existing.push(line);
        }
      } catch {
        /* unreadable log: start over rather than fail the hook */
      }
    }

    const nowIso = now.toISOString();
    existing.push(
      `${ENTRY_PREFIX}${oneLine(entry.hook)} | file: ${oneLine(entry.file)} | failure: ${oneLine(entry.failure)} | at: ${nowIso}`,
    );
    const kept = existing.slice(-HOOK_ERRORS_CAP);

    const content = `---
kind: pulse-hook-errors
generated: ${nowIso}
loop: cortex-hooks
---

# Hook errors

One structured entry per hook-internal error (hook name, file, failure,
iso-datetime), most recent ${HOOK_ERRORS_CAP} kept (schema §4.5). Appended by the
Cortex hooks' degradation path; surfaced by the hygiene loop.

${kept.join('\n')}
`;
    fs.writeFileSync(filePath, content, 'utf-8');
  } catch {
    /* the degradation log never becomes a failure source */
  }
}

/** Parse the entry lines back out (test/consumer convenience). */
export function readHookErrorEntries(root: string): string[] {
  try {
    const filePath = path.join(root, '.cortex', 'pulse', 'hook-errors.md');
    if (!fs.existsSync(filePath)) return [];
    return fs
      .readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter((l) => l.startsWith(ENTRY_PREFIX));
  } catch {
    return [];
  }
}
