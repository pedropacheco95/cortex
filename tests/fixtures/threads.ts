/**
 * Shared fixtures for the threads ledger tests (`pulse.threads`, schema §4.5.3).
 * Builds in-memory `Thread` values and reads the ledger back from a sandboxed
 * tmp project — never the real repo.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { Thread } from '../../src/pulse/threads.js';

export const THREAD_FIXTURE_USER = 'fixture-user';

/** The schema §6 `claude-sessions/<user>/<session-id>` citation. */
export function threadCitation(sessionId: string, user: string = THREAD_FIXTURE_USER): string {
  return `claude-sessions/${user}/${sessionId}`;
}

/** A well-formed open `question` thread; every field overridable. */
export function makeThread(overrides: Partial<Thread> = {}): Thread {
  const session = overrides.session ?? threadCitation('s1');
  return {
    id: 'T-001',
    kind: 'question',
    status: 'open',
    opened: '2026-09-15T10:00:00.000Z',
    session,
    sessions: [session],
    bears_on: [],
    expires: '2026-10-15T10:00:00.000Z',
    body: 'Do you want the counter in state/ or at the pulse root?',
    ...overrides,
  };
}

/** Absolute path of `.cortex/pulse/threads` in a fixture root. */
export function threadsDirOf(root: string): string {
  return path.join(root, '.cortex', 'pulse', 'threads');
}

/** Raw text of the ledger file whose name starts with `<id>-`, or null. */
export function readThreadRaw(root: string, id: string): string | null {
  const dir = threadsDirOf(root);
  if (!fs.existsSync(dir)) return null;
  const name = fs.readdirSync(dir).find((f) => f.startsWith(`${id}-`) && f.endsWith('.md'));
  return name === undefined ? null : fs.readFileSync(path.join(dir, name), 'utf-8');
}
