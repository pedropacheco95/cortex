/**
 * Atomic tests — check.config learns `hooks.readDefer` (schema §10.1, 3.4
 * third revision; `hooks.pre-read-writeback` Rule 7(a) "Flag absent or off →
 * never a deny": a non-boolean is a check.config ERROR, not a silent on, and
 * `true` beside `hooks.preRead: false` is a WARNING because the mode lives
 * inside the Read pair's entry and cannot fire).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { checkConfig } from '../../../src/schema/checks/config.js';
import { makeTmpDir, cleanTmp, makeCortexProject } from '../../fixtures/hooks-harness.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`config-check-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function rootWith(label: string, hooks: Record<string, unknown> | undefined): string {
  const root = tmp(label);
  makeCortexProject(root, { config: { schemaVersion: '3.4', ...(hooks === undefined ? {} : { hooks }), loop: { enabled: false } } });
  return root;
}

function readDeferViolations(root: string) {
  return checkConfig(root).violations.filter((v) => v.location.key === 'hooks.readDefer');
}

describe('check.config: hooks.readDefer (§10.1)', () => {
  it('absent hooks block → no violation; hooks without readDefer → no violation', () => {
    expect(readDeferViolations(rootWith('nohooks', undefined))).toEqual([]);
    expect(readDeferViolations(rootWith('nokey', { preRead: true }))).toEqual([]);
    expect(checkConfig(rootWith('nokey2', { preRead: true })).violations).toEqual([]);
  });

  it('readDefer: false → no violation (the default, written explicitly by init)', () => {
    expect(checkConfig(rootWith('false', { preRead: true, readDefer: false })).violations).toEqual([]);
  });

  it('readDefer: true with preRead defaulting (absent) or explicitly true → no violation', () => {
    expect(checkConfig(rootWith('true-default', { readDefer: true })).violations).toEqual([]);
    expect(checkConfig(rootWith('true-explicit', { preRead: true, readDefer: true })).violations).toEqual([]);
  });

  it('readDefer: "yes" → exactly one error at hooks.readDefer, clause §10.1, naming the value', () => {
    const root = rootWith('yes', { preRead: true, readDefer: 'yes' });
    const result = checkConfig(root);
    const v = readDeferViolations(root);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ severity: 'error', check: 'check.config', clause: '§10.1' });
    expect(v[0]?.location.key).toBe('hooks.readDefer');
    expect(v[0]?.message).toContain('"hooks.readDefer" must be a boolean');
    expect(v[0]?.message).toContain('"yes"');
    expect(result.majorOk).toBe(true); // a bad flag does not gate the rest of the validator
    expect(result.violations).toHaveLength(1);
  });

  it('readDefer: 1 (a number) is also non-boolean → one error', () => {
    const v = readDeferViolations(rootWith('one', { readDefer: 1 }));
    expect(v).toHaveLength(1);
    expect(v[0]?.severity).toBe('error');
  });

  it('readDefer: true with preRead: false → exactly one warning at hooks.readDefer, clause §10.1', () => {
    const root = rootWith('paired-off', { preRead: false, readDefer: true });
    const v = readDeferViolations(root);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ severity: 'warning', check: 'check.config', clause: '§10.1' });
    expect(v[0]?.message).toBe(
      'hooks.readDefer is true but hooks.preRead is false — the Read pair is not registered, so the deferral mode cannot fire',
    );
    expect(checkConfig(root).violations).toHaveLength(1);
  });

  it('readDefer: false with preRead: false → no violation (nothing to warn about)', () => {
    expect(checkConfig(rootWith('both-off', { preRead: false, readDefer: false })).violations).toEqual([]);
  });

  it('a hooks value that is not an object is left to the existing shape checks — no readDefer violation', () => {
    expect(readDeferViolations(rootWith('hooks-string', 'nope' as unknown as Record<string, unknown>))).toEqual([]);
  });
});
