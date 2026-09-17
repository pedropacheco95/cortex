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

// ---------------------------------------------------------------------------
// schema.visibility Rule 1 / AC "The config shape is checked" (§10.1, 3.4 fifth
// revision): `visibility` and `placement` are optional; present-but-malformed
// is an ERROR at the offending key; absent is nothing; both are known keys.
// ---------------------------------------------------------------------------
function rootWithConfig(label: string, extra: Record<string, unknown>): string {
  const root = tmp(label);
  makeCortexProject(root, { config: { schemaVersion: '3.4', loop: { enabled: false }, ...extra } });
  return root;
}

function keyViolations(root: string, key: string) {
  return checkConfig(root).violations.filter((v) => v.location.key === key);
}

describe('check.config: visibility and placement (§10.1, schema.visibility Rule 1)', () => {
  it('both keys absent → no violation at all', () => {
    expect(checkConfig(rootWithConfig('vis-absent', {})).violations).toEqual([]);
  });

  it('visibility and placement are KNOWN keys — no unknown-key warning', () => {
    const root = rootWithConfig('vis-known', {
      visibility: { repo: 'unknown', allow: [] },
      placement: { localNotesDir: 'docs/notes' },
    });
    expect(checkConfig(root).violations).toEqual([]);
  });

  it('visibility.repo in the enum (public | private | unknown) → no violation', () => {
    for (const repo of ['public', 'private', 'unknown']) {
      expect(checkConfig(rootWithConfig(`vis-${repo}`, { visibility: { repo } })).violations).toEqual([]);
    }
  });

  it('visibility: { repo: "open" } → exactly one error at visibility.repo, clause §10.1', () => {
    const root = rootWithConfig('vis-open', { visibility: { repo: 'open' } });
    const v = keyViolations(root, 'visibility.repo');
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ severity: 'error', check: 'check.config', clause: '§10.1' });
    expect(v[0]?.message).toContain('"open"');
    expect(checkConfig(root).violations).toHaveLength(1);
    expect(checkConfig(root).majorOk).toBe(true);
  });

  it('visibility: { repo: "public", allow: "compass/*" } → exactly one error at visibility.allow', () => {
    const root = rootWithConfig('vis-allow-str', { visibility: { repo: 'public', allow: 'compass/*' } });
    const v = keyViolations(root, 'visibility.allow');
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ severity: 'error', check: 'check.config', clause: '§10.1' });
    expect(checkConfig(root).violations).toHaveLength(1);
  });

  it('visibility.allow with a non-string element → error at visibility.allow', () => {
    const root = rootWithConfig('vis-allow-mixed', { visibility: { repo: 'public', allow: ['a/*', 3] } });
    expect(keyViolations(root, 'visibility.allow')).toHaveLength(1);
  });

  it('visibility that is not an object (a string, an array) → one error at visibility', () => {
    expect(keyViolations(rootWithConfig('vis-string', { visibility: 'public' }), 'visibility')).toHaveLength(1);
    expect(keyViolations(rootWithConfig('vis-array', { visibility: ['public'] }), 'visibility')).toHaveLength(1);
  });

  it('placement.localNotesDir a string → no violation; a number → one error at placement.localNotesDir', () => {
    expect(checkConfig(rootWithConfig('pl-ok', { placement: { localNotesDir: 'notes' } })).violations).toEqual([]);
    const v = keyViolations(rootWithConfig('pl-num', { placement: { localNotesDir: 7 } }), 'placement.localNotesDir');
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ severity: 'error', check: 'check.config', clause: '§10.1' });
  });

  it('placement present without localNotesDir → no violation; placement not an object → one error at placement', () => {
    expect(checkConfig(rootWithConfig('pl-empty', { placement: {} })).violations).toEqual([]);
    expect(keyViolations(rootWithConfig('pl-string', { placement: 'docs' }), 'placement')).toHaveLength(1);
  });
});
