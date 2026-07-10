/**
 * Atomic tests — the shared pulse/hook-errors.md appender (schema §4.5:
 * kind pulse-hook-errors, append-not-overwrite, capped at 100 entries).
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { appendHookError, readHookErrorEntries, HOOK_ERRORS_CAP } from '../../../src/hooks/errors.js';
import { makeTmpDir, cleanTmp, makeCortexProject, hookErrorsPath } from '../../fixtures/hooks-harness.js';

const NOW = new Date('2026-07-02T10:00:00.000Z');
const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(label);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

describe('appendHookError (schema §4.5)', () => {
  it('creates the file with kind: pulse-hook-errors and the §4.5 header fields', () => {
    const root = tmp('create');
    makeCortexProject(root);
    appendHookError(root, { hook: 'pre-write', file: 'R-001.md', failure: 'bad yaml' }, NOW);
    const raw = fs.readFileSync(hookErrorsPath(root), 'utf-8');
    const data = matter(raw).data as Record<string, unknown>;
    expect(data['kind']).toBe('pulse-hook-errors');
    expect(data['generated']).toBeTruthy();
    expect(data['loop']).toBeTruthy();
  });

  it('each entry is structured: hook name, file, failure, iso-datetime', () => {
    const root = tmp('structured');
    makeCortexProject(root);
    appendHookError(root, { hook: 'session-start', file: 'reports/hygiene.md', failure: 'no generated field' }, NOW);
    const entries = readHookErrorEntries(root);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toContain('hook: session-start');
    expect(entries[0]).toContain('file: reports/hygiene.md');
    expect(entries[0]).toContain('failure: no generated field');
    expect(entries[0]).toContain('at: 2026-07-02T10:00:00.000Z');
  });

  it('appends — earlier entries survive later appends', () => {
    const root = tmp('append');
    makeCortexProject(root);
    appendHookError(root, { hook: 'pre-write', file: 'a.md', failure: 'first' }, NOW);
    appendHookError(root, { hook: 'post-write', file: 'b.md', failure: 'second' }, NOW);
    const entries = readHookErrorEntries(root);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toContain('first');
    expect(entries[1]).toContain('second');
  });

  it('caps at the most recent 100 entries', () => {
    const root = tmp('cap');
    makeCortexProject(root);
    for (let i = 1; i <= HOOK_ERRORS_CAP + 20; i++) {
      appendHookError(root, { hook: 'pre-write', file: `f${i}.md`, failure: `err ${i}` }, NOW);
    }
    const entries = readHookErrorEntries(root);
    expect(entries).toHaveLength(HOOK_ERRORS_CAP);
    expect(entries[0]).toContain('err 21'); // oldest 20 dropped
    expect(entries[HOOK_ERRORS_CAP - 1]).toContain(`err ${HOOK_ERRORS_CAP + 20}`);
  });

  it('flattens newlines/whitespace in failure text so entries stay one line', () => {
    const root = tmp('newlines');
    makeCortexProject(root);
    appendHookError(root, { hook: 'pre-write', file: 'x.md', failure: 'line one\nline   two' }, NOW);
    const entries = readHookErrorEntries(root);
    expect(entries[0]).toContain('failure: line one line two');
  });

  it('no .cortex/ → never scaffolds, never throws', () => {
    const root = tmp('nocortex');
    expect(() => appendHookError(root, { hook: 'x', file: 'y', failure: 'z' }, NOW)).not.toThrow();
    expect(fs.existsSync(path.join(root, '.cortex'))).toBe(false);
  });
});
