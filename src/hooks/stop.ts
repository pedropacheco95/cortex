/**
 * Stop companion hook — `cortex hook stop` (spec hooks.session-end Rule 11;
 * schema §4.5.3 "The Stop companion").
 *
 * Claude Code writes the transcript asynchronously, so at `SessionEnd` its
 * last lines may be missing; the documented remedy is the `Stop` event's
 * `last_assistant_message`. On every turn this hook keeps that message in
 * `.cortex/pulse/state/sessions/<session-id>.last.json` as
 * `{ "text": <≤2000 chars>, "at": <iso-datetime> }` — overwrite,
 * write-then-rename — and nothing else: no transcript read, no output, no
 * decision. The SessionEnd hook consumes and deletes the file; hygiene deletes
 * orphans.
 *
 * Always silent, always exit 0 (Rule 2). Missing or non-string input writes
 * nothing and logs nothing — this hook fires every turn, and its no-ops would
 * flood `hook-errors.md` (Rule 11). Pure file I/O, no LLM (Rule 10; R-001).
 */
import * as fs from 'fs';
import * as path from 'path';
import type { HookRunResult, HookRunOptions } from './session-start.js';

/** Cap on the kept message (engineering call, spec Rule 11). */
export const STOP_TEXT_CHARS = 2000;
/** The companion files' directory, under `pulse/state/`. */
export const STOP_STATE_DIR = 'sessions';

const SILENT: HookRunResult = { exitCode: 0, stdout: '' };

/** A session id as one safe filename segment (never a path). */
function safeSegment(sessionId: string): string {
  return sessionId.replace(/[/\\\s]+/g, '-') || 'unknown';
}

/** `.cortex/pulse/state/sessions/<session-id>.last.json`. */
export function stopStatePath(root: string, sessionId: string): string {
  return path.join(root, '.cortex', 'pulse', 'state', STOP_STATE_DIR, `${safeSegment(sessionId)}.last.json`);
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
    if (!fs.existsSync(path.join(root, '.cortex'))) return SILENT;

    const sessionId = stdin['session_id'];
    const message = stdin['last_assistant_message'];
    if (typeof sessionId !== 'string' || sessionId === '' || typeof message !== 'string') return SILENT;

    const now = opts?.now ?? new Date();
    const target = stopStatePath(root, sessionId);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const tmp = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.tmp`);
    fs.writeFileSync(tmp, JSON.stringify({ text: message.slice(0, STOP_TEXT_CHARS), at: now.toISOString() }), 'utf-8');
    fs.renameSync(tmp, target);
    return SILENT;
  } catch {
    // Rule 2: silent and exit 0 on every path; Rule 11: no error entry either.
    return SILENT;
  }
}
