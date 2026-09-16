/**
 * Spec tests — hooks.prompt-route as an integrated slice: `cortex init`
 * registers the UserPromptSubmit row, a session record opens a real ledger
 * thread through `openThreadsFromRecord` (not a literal file), the built hook
 * runs through the real dispatcher on a first prompt and then on a mention,
 * the shared fired memory keeps the two modes from repeating each other, and
 * `check.hook-config` demands the row from any Cortex-managed settings file.
 * Every project is a tmp root with an injected fake home; the real repo and
 * the real ~/.claude are never touched.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { init } from '../../../src/cli/init.js';
import { validate } from '../../../src/schema/validate.js';
import { runHook } from '../../../src/hooks/cli.js';
import { recallFiredPath } from '../../../src/hooks/search-annotate.js';
import { openThreadsFromRecord, listThreads } from '../../../src/pulse/threads.js';
import type { SessionRecord } from '../../../src/pulse/threads.js';
import { makeTmpDir, cleanTmp, parseEnvelope, hookErrorsPath, isoHoursAgo } from '../../fixtures/hooks-harness.js';

const TEST_TIMEOUT = 60_000;
const DARWIN = { platform: 'darwin' as const, noLlm: true };
const PROMPT_ROW = { hooks: [{ type: 'command', command: 'cortex hook prompt-route' }] };
const NOW = new Date();

function stdin(root: string, fields: Record<string, unknown>, sessionId: string): string {
  return JSON.stringify({ session_id: sessionId, cwd: root, hook_event_name: 'UserPromptSubmit', ...fields });
}

/** A complete §4.5.3 record for session `id`, ended `hoursAgo` hours before NOW. */
function record(id: string, hoursAgo: number, openQuestion: string | null): SessionRecord {
  return {
    kind: 'pulse-session-record',
    session_id: id,
    session: `claude-sessions/spec-user/${id}`,
    title: null,
    session_kind: 'interactive',
    ended: isoHoursAgo(hoursAgo, NOW),
    reason: 'exit',
    partial: false,
    open_question: openQuestion === null ? null : { kind: 'question', text: openQuestion, timestamp: null, source: 'stop' },
    approvals: [],
    findings: [],
    artefacts: [],
    reads: null,
    threads_opened: [],
    threads_answered: [],
  };
}

function writeRecord(root: string, rec: SessionRecord): void {
  const dir = path.join(root, '.cortex', 'pulse', 'sessions');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${rec.session_id}.json`), JSON.stringify(rec, null, 2) + '\n', 'utf-8');
}

describe('hooks.prompt-route — a fresh project, end to end', () => {
  let root: string;
  let home: string;
  let initExit: number;
  let threadId: string;
  const QUESTION = 'Do you want the counter in state/ or at the pulse root?';

  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    root = makeTmpDir('prompt-route-spec-proj');
    home = makeTmpDir('prompt-route-spec-home');
    initExit = (await init(root, { home, ...DARWIN })).exitCode;
    // Session s1 ended two hours ago with one hanging question; the ledger
    // opens the thread exactly as `cortex hook session-end` would.
    const s1 = record('s1', 2, QUESTION);
    s1.threads_opened = openThreadsFromRecord(root, s1, new Date(NOW.getTime() - 2 * 3_600_000));
    writeRecord(root, s1);
    threadId = s1.threads_opened[0] ?? '';
  }, TEST_TIMEOUT);

  afterAll(() => {
    vi.restoreAllMocks();
    cleanTmp(root);
    cleanTmp(home);
  });

  it('init registers exactly one UserPromptSubmit entry — `cortex hook prompt-route`, no matcher — alongside the other eight, and the project validates clean on check.hook-config', async () => {
    expect(initExit).toBe(0);
    const settings = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf-8'));
    expect(settings.hooks.UserPromptSubmit).toEqual([PROMPT_ROW]);
    const raw = JSON.stringify(settings.hooks);
    const commands = [...raw.matchAll(/cortex hook [a-z-]+/g)].map((m) => m[0]);
    expect(new Set(commands).size).toBe(9);
    expect(commands.filter((c) => c === 'cortex hook prompt-route')).toHaveLength(1);
    const report = await validate(root, { root });
    expect(report.violations.filter((v) => v.check === 'check.hook-config')).toEqual([]);
  }, TEST_TIMEOUT);

  it('the ledger holds the opened question as an open thread', () => {
    expect(threadId).toMatch(/^T-\d{3,}$/);
    const { threads } = listThreads(root);
    const t = threads.find((x) => x.id === threadId);
    expect(t?.kind).toBe('question');
    expect(t?.status).toBe('open');
    expect(t?.body).toBe(QUESTION);
  });

  it('first prompt of s2 → the Open: line for the thread through the real dispatcher; the fired memory records it; the thread file is untouched', async () => {
    const threadsDir = path.join(root, '.cortex', 'pulse', 'threads');
    const name = fs.readdirSync(threadsDir).find((f) => f.startsWith(`${threadId}-`))!;
    const bytesBefore = fs.readFileSync(path.join(threadsDir, name), 'utf-8');

    const result = await runHook('prompt-route', stdin(root, { prompt: 'state/ please' }, 's2'));
    expect(result.exitCode).toBe(0);
    const env = parseEnvelope(result.stdout);
    expect(env.hookEventName).toBe('UserPromptSubmit');
    expect(env.permissionDecision).toBeUndefined();
    expect(env.additionalContext).toBe(
      `Open: ${threadId} (${s1Date()}) ${QUESTION} (.cortex/pulse/threads/${name})`,
    );
    expect(fs.readFileSync(recallFiredPath(root, 's2'), 'utf-8')).toBe(`${threadId}\n`);
    expect(fs.readFileSync(path.join(threadsDir, name), 'utf-8')).toBe(bytesBefore);
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);

    function s1Date(): string {
      return listThreads(root).threads.find((x) => x.id === threadId)!.opened.slice(0, 10);
    }
  });

  it('the second prompt of s2 naming the id is silent — the shared memory holds it — while a fresh session s3 mentioning it by words fires once', async () => {
    expect(await runHook('prompt-route', stdin(root, { prompt: `${threadId} — the counter in state or at the pulse root` }, 's2'))).toEqual({ exitCode: 0, stdout: '' });

    // s3 is not a first prompt (its memory exists, empty) and shares three words.
    const mem = recallFiredPath(root, 's3');
    fs.mkdirSync(path.dirname(mem), { recursive: true });
    fs.writeFileSync(mem, '', 'utf-8');
    const first = await runHook('prompt-route', stdin(root, { prompt: 'where does the counter go, state or the pulse root?' }, 's3'));
    expect(parseEnvelope(first.stdout).additionalContext).toMatch(new RegExp(`^Open: ${threadId} `));
    expect(await runHook('prompt-route', stdin(root, { prompt: 'where does the counter go, state or the pulse root?' }, 's3'))).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.readFileSync(mem, 'utf-8')).toBe(`${threadId}\n`);
  });

  it('a harness-shaped first prompt of s4 is silent and leaves no memory, so the human\'s real first prompt still resumes', async () => {
    const teammate = 'Another Claude session sent a message:\n<teammate-message teammate_id="lead">state/ please</teammate-message>';
    expect(await runHook('prompt-route', stdin(root, { prompt: teammate }, 's4'))).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.existsSync(recallFiredPath(root, 's4'))).toBe(false);
    const real = await runHook('prompt-route', stdin(root, { prompt: 'state/ please' }, 's4'));
    expect(parseEnvelope(real.stdout).additionalContext).toMatch(new RegExp(`^Open: ${threadId} `));
  });

  it('after the thread is answered, neither mode surfaces it', async () => {
    const { threads } = listThreads(root);
    const t = threads.find((x) => x.id === threadId)!;
    const threadsDir = path.join(root, '.cortex', 'pulse', 'threads');
    const name = fs.readdirSync(threadsDir).find((f) => f.startsWith(`${threadId}-`))!;
    const raw = fs.readFileSync(path.join(threadsDir, name), 'utf-8');
    fs.writeFileSync(
      path.join(threadsDir, name),
      raw.replace('status: open', `status: answered\nanswered: ${NOW.toISOString()}\nresolved_by: claude-sessions/spec-user/s2`).replace(`expires: ${t.expires}`, `expires: ${t.expires}`),
      'utf-8',
    );
    expect(await runHook('prompt-route', stdin(root, { prompt: 'state/ please' }, 's5'))).toEqual({ exitCode: 0, stdout: '' });
    expect(await runHook('prompt-route', stdin(root, { prompt: `${threadId} counter state root` }, 's5'))).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });
});

describe('hooks.prompt-route — check.hook-config demands the row from a Cortex-managed settings file', () => {
  it('a settings file carrying `cortex hook session-start` but no prompt-route entry → one check.hook-config error naming `cortex hook prompt-route` and `cortex sync`', async () => {
    const root = makeTmpDir('prompt-route-spec-stale');
    try {
      fs.mkdirSync(path.join(root, '.cortex'), { recursive: true });
      fs.writeFileSync(path.join(root, '.cortex', 'cortex.config.json'), JSON.stringify({ schemaVersion: '3.4', hooks: { preRead: false } }));
      fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.claude', 'settings.json'),
        JSON.stringify({
          hooks: {
            SessionStart: [{ hooks: [{ type: 'command', command: 'cortex hook session-start' }] }],
            SessionEnd: [{ hooks: [{ type: 'command', command: 'cortex hook session-end', timeout: 10 }] }],
            Stop: [{ hooks: [{ type: 'command', command: 'cortex hook stop' }] }],
            PreToolUse: [{ matcher: 'Grep|Bash', hooks: [{ type: 'command', command: 'cortex hook search-annotate' }] }],
          },
        }),
      );
      const report = await validate(root, { root });
      const hookConfig = report.violations.filter((v) => v.check === 'check.hook-config');
      expect(hookConfig).toHaveLength(1);
      expect(hookConfig[0]!.severity).toBe('error');
      expect(hookConfig[0]!.location.key).toBe('hooks.UserPromptSubmit');
      expect(hookConfig[0]!.message).toContain('cortex hook prompt-route');
      expect(hookConfig[0]!.message).toContain('cortex sync');
    } finally {
      cleanTmp(root);
    }
  }, TEST_TIMEOUT);
});
