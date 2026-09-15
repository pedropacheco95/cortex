/**
 * Atomic tests — the Stop companion hook (`hooks.session-end` Rule 11 and
 * Rule 2's silence discipline): the companion file's path, the 2000-character
 * cap, write-then-rename overwrite, and the no-op paths that must neither
 * write nor log.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { run, STOP_TEXT_CHARS, STOP_STATE_DIR, stopStatePath } from '../../../src/hooks/stop.js';
import { makeTmpDir, cleanTmp, makeCortexProject, hookErrorsPath } from '../../fixtures/hooks-harness.js';
import { snapshotTree } from '../../fixtures/init-harness.js';
import { companionPathOf } from '../../fixtures/session-end-harness.js';

const NOW = new Date('2026-09-15T10:00:04.000Z');

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`stop-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function readCompanion(root: string, id: string): { text: string; at: string } | null {
  const p = companionPathOf(root, id);
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, 'utf-8')) as { text: string; at: string }) : null;
}

describe('Rule 11 — constants and the companion path', () => {
  it('pins the engineering-call constants and the state path', () => {
    expect(STOP_TEXT_CHARS).toBe(2000);
    expect(STOP_STATE_DIR).toBe('sessions');
    expect(stopStatePath('/p', 'abc')).toBe(path.join('/p', '.cortex', 'pulse', 'state', 'sessions', 'abc.last.json'));
  });

  it('keeps a session id carrying path separators inside the sessions directory', () => {
    const p = stopStatePath('/p', '../x/y');
    expect(path.dirname(p)).toBe(path.join('/p', '.cortex', 'pulse', 'state', 'sessions'));
  });
});

describe('AC — the Stop companion records the last assistant message and nothing else', () => {
  it('writes text capped at exactly 2000 characters and an iso `at`; stdout empty; nothing else changes', async () => {
    const root = tmp('records');
    makeCortexProject(root);
    const before = snapshotTree(root);
    const msg = 'a'.repeat(2499) + '?';
    const result = await run({ session_id: 'abc', last_assistant_message: msg, cwd: root }, { now: NOW });

    expect(result).toEqual({ exitCode: 0, stdout: '' });
    const written = readCompanion(root, 'abc');
    expect(written).not.toBeNull();
    expect(written!.text.length).toBe(2000);
    expect(written!.text).toBe(msg.slice(0, 2000));
    expect(written!.at).toBe(NOW.toISOString());

    const after = snapshotTree(root);
    const changed = [...after.keys()].filter((k) => before.get(k) !== after.get(k));
    expect(changed).toEqual([path.relative(root, companionPathOf(root, 'abc'))]);
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });

  it('overwrites the previous turn\'s file and leaves no temp file behind', async () => {
    const root = tmp('overwrite');
    makeCortexProject(root);
    await run({ session_id: 'abc', last_assistant_message: 'first turn', cwd: root }, { now: NOW });
    await run(
      { session_id: 'abc', last_assistant_message: 'second turn?', cwd: root },
      { now: new Date(NOW.getTime() + 5000) },
    );
    expect(readCompanion(root, 'abc')).toEqual({
      text: 'second turn?',
      at: new Date(NOW.getTime() + 5000).toISOString(),
    });
    const dir = path.join(root, '.cortex', 'pulse', 'state', STOP_STATE_DIR);
    expect(fs.readdirSync(dir)).toEqual(['abc.last.json']);
  });

  it('resolves the root from opts.cwd when stdin carries no cwd', async () => {
    const root = tmp('optscwd');
    makeCortexProject(root);
    await run({ session_id: 'abc', last_assistant_message: 'hello?' }, { cwd: root, now: NOW });
    expect(readCompanion(root, 'abc')?.text).toBe('hello?');
  });
});

describe('AC — the Stop companion is silent on missing input', () => {
  it.each([
    ['missing last_assistant_message', { session_id: 'abc' }],
    ['empty stdin', {}],
    ['non-string last_assistant_message', { session_id: 'abc', last_assistant_message: 42 }],
    ['missing session_id', { last_assistant_message: 'text?' }],
  ])('%s → exit 0, empty stdout, no file, no hook-errors.md', async (_label, stdin) => {
    const root = tmp('silent');
    makeCortexProject(root);
    const before = snapshotTree(root);
    const result = await run({ ...stdin, cwd: root }, { now: NOW });
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    expect(snapshotTree(root)).toEqual(before);
    expect(fs.existsSync(path.join(root, '.cortex', 'pulse', 'state', STOP_STATE_DIR))).toBe(false);
    expect(fs.existsSync(hookErrorsPath(root))).toBe(false);
  });

  it('writes nothing when .cortex/ is absent', async () => {
    const root = tmp('nocortex');
    const result = await run({ session_id: 'abc', last_assistant_message: 'text?', cwd: root }, { now: NOW });
    expect(result).toEqual({ exitCode: 0, stdout: '' });
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it('never emits JSON, even for a malformed stdin payload', async () => {
    const root = tmp('nojson');
    makeCortexProject(root);
    expect(await run('not an object', { cwd: root })).toEqual({ exitCode: 0, stdout: '' });
    expect(await run(null, { cwd: root })).toEqual({ exitCode: 0, stdout: '' });
  });
});
