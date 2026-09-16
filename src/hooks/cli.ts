/**
 * `cortex hook <name>` dispatch (specs hooks.session-start / pre-write /
 * post-write, Rule 1 of each).
 *
 * The <name> strings align exactly with the registrations `cortex init`
 * writes to .claude/settings.json (`cortex hook session-start`,
 * `cortex hook pre-write`, `cortex hook post-write`, the Read pair
 * `cortex hook pre-read` / `cortex hook post-read`, the session-record
 * pair `cortex hook session-end` / `cortex hook stop`, the search-time
 * pointer `cortex hook search-annotate` on Grep|Bash, and the open-thread
 * router `cortex hook prompt-route` on UserPromptSubmit) so check.hook-config
 * holds end-to-end. Reads the Claude Code hook stdin JSON, runs the hook,
 * writes its stdout, and returns its exit code — which is always 0
 * (warn-never-block, RULES.md rule 6).
 */
import { run as sessionStart } from './session-start.js';
import { run as preWrite } from './pre-write.js';
import { run as postWrite } from './post-write.js';
import { run as preRead } from './pre-read.js';
import { run as postRead } from './post-read.js';
import { run as sessionEnd } from './session-end.js';
import { run as stop } from './stop.js';
import { run as searchAnnotate } from './search-annotate.js';
import { run as promptRoute } from './prompt-route.js';
import type { HookRunResult } from './session-start.js';

export async function runHook(name: string, stdinRaw: string): Promise<HookRunResult> {
  let stdinJson: unknown = {};
  try {
    stdinJson = JSON.parse(stdinRaw);
  } catch {
    // Malformed stdin: hooks degrade internally; hand them an empty payload.
    stdinJson = {};
  }

  switch (name) {
    case 'session-start':
      return sessionStart(stdinJson);
    case 'pre-write':
      return preWrite(stdinJson);
    case 'post-write':
      return postWrite(stdinJson);
    case 'pre-read':
      return preRead(stdinJson);
    case 'post-read':
      return postRead(stdinJson);
    case 'session-end':
      return sessionEnd(stdinJson);
    case 'stop':
      return stop(stdinJson);
    case 'search-annotate':
      return searchAnnotate(stdinJson);
    case 'prompt-route':
      return promptRoute(stdinJson);
    default:
      // Unknown / not-yet-implemented hook names stay silent:
      // a registered command must never fail the user's session.
      return { exitCode: 0, stdout: '' };
  }
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
  } catch {
    return '';
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/** argv = everything after `cortex hook`. */
export async function main(argv: string[]): Promise<number> {
  try {
    const name = argv[0] ?? '';
    const stdinRaw = await readStdin();
    const { exitCode, stdout } = await runHook(name, stdinRaw);
    if (stdout) process.stdout.write(stdout + '\n');
    return exitCode;
  } catch {
    // Envelope-level warn-never-block: even a dispatcher crash exits 0.
    return 0;
  }
}

// Guard: only run when invoked directly (node dist/hooks/cli.js <name>).
const scriptUrl = import.meta.url;
const scriptPath = process.argv[1];
if (scriptPath && (scriptUrl.endsWith(scriptPath) || scriptUrl.endsWith(scriptPath.replace(/\\/g, '/')))) {
  main(process.argv.slice(2)).then(process.exit);
}
