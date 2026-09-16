/**
 * The transcript-head session-kind probe (`hooks.pre-read-writeback` Rule 7(g);
 * schema §5 row (d): "the session is interactive — the transcript's first user
 * line is not a scheduled preamble").
 *
 * The PreRead hook cannot afford `hooks.session-end`'s two-pass read on every
 * Read call, so this reads at most the first TRANSCRIPT_HEAD_BYTES of the file
 * Claude Code names in `transcript_path`, finds the first `"type":"user"` line
 * that carries user text, and classifies it with the shared scheduled-marker
 * predicate. Anything it cannot see — no path, ENOENT, a directory, an empty
 * file, no user line in the head, a line longer than the head, a parse failure
 * — is `unknown`, and Rule 7 treats `unknown` exactly like `scheduled`: never
 * defer. Never throws. One bounded read, no network, no subprocess (R-001).
 */
import * as fs from 'fs';
import { extractMessages, parseSessionJsonl } from '../sessions/read.js';
import { isScheduledPromptText } from './harness.js';

/** At most this many bytes of the transcript are read — the session-end line cap. */
export const TRANSCRIPT_HEAD_BYTES = 256 * 1024;

/** The raw marker of a user line (the same trigger `hooks.session-end` Rule 5b scans for). */
const USER_LINE_TRIGGER = '"type":"user"';

export type TranscriptSessionKind = 'interactive' | 'scheduled' | 'unknown';

/** The first TRANSCRIPT_HEAD_BYTES of a regular, non-empty file as UTF-8, or null. */
function readHead(transcriptPath: string): string | null {
  let fd: number | null = null;
  try {
    fd = fs.openSync(transcriptPath, 'r');
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size === 0) return null;
    const buffer = Buffer.alloc(Math.min(stat.size, TRANSCRIPT_HEAD_BYTES));
    const read = fs.readSync(fd, buffer, 0, buffer.length, 0);
    return buffer.subarray(0, read).toString('utf-8');
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* nothing to do */
      }
    }
  }
}

/**
 * `scheduled` when the first user text line in the head starts with the skill
 * preamble or carries the scheduled-task tag; `interactive` when it is anything
 * else; `unknown` when no such line can be read (see the module comment).
 */
export function sessionKindFromTranscriptHead(transcriptPath: string | undefined): TranscriptSessionKind {
  if (typeof transcriptPath !== 'string' || transcriptPath === '') return 'unknown';
  const head = readHead(transcriptPath);
  if (head === null) return 'unknown';

  const lines = head.split('\n');
  const truncated = !head.endsWith('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    if (!line.includes(USER_LINE_TRIGGER)) continue;
    // The last line of a truncated head may be cut mid-JSON: it is longer than
    // the head, and a parse failure below says so.
    if (truncated && i === lines.length - 1) return 'unknown';
    const entry = parseSessionJsonl(line).entries[0];
    if (entry === undefined) return 'unknown';
    const user = extractMessages([entry]).find((m) => m.role === 'user');
    if (user === undefined) continue; // a tool_result-only user entry: not the human
    return isScheduledPromptText(user.text) ? 'scheduled' : 'interactive';
  }
  return 'unknown';
}
