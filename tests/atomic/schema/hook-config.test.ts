/**
 * Atomic tests — check.hook-config (schema §5, Read-pair round): the
 * `cortex hook pre-read` + `cortex hook post-read` entries are present in
 * .claude/settings.json together, iff `hooks.preRead` is true — which is now
 * the DEFAULT (§10.1: absent = true; only explicit false opts out).
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { checkHookConfig } from '../../../src/schema/checks/hooks.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/hooks-harness.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(label);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function writeSettings(root: string, hooks: Record<string, unknown>): void {
  const p = path.join(root, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ hooks }, null, 2));
}

const PAIR = {
  PreToolUse: [{ matcher: 'Read', hooks: [{ type: 'command', command: 'cortex hook pre-read' }] }],
  PostToolUse: [{ matcher: 'Read', hooks: [{ type: 'command', command: 'cortex hook post-read' }] }],
};

/** The SessionEnd + Stop rows (3.3 third revision) — required whenever any
 *  Cortex-owned entry is present, so fixtures that carry the Read pair carry
 *  these too (otherwise the count under test would include their absence). */
const SESSION_ROWS = {
  SessionEnd: [{ hooks: [{ type: 'command', command: 'cortex hook session-end', timeout: 10 }] }],
  Stop: [{ hooks: [{ type: 'command', command: 'cortex hook stop' }] }],
};
const FULL = { ...PAIR, ...SESSION_ROWS };

describe('check.hook-config: flag true (and DEFAULT) requires the pair', () => {
  it('explicit preRead: true + both entries → passes', () => {
    const root = tmp('hc-pass');
    writeSettings(root, FULL);
    expect(checkHookConfig(root, { hooks: { preRead: true } })).toEqual([]);
  });

  it('flag ABSENT defaults true: missing pair → two errors (pre-read and post-read named)', () => {
    const root = tmp('hc-default');
    writeSettings(root, {});
    const violations = checkHookConfig(root, {});
    expect(violations).toHaveLength(2);
    expect(violations.every((v) => v.severity === 'error' && v.check === 'check.hook-config')).toBe(true);
    expect(violations.map((v) => v.message).join(' ')).toContain('cortex hook pre-read');
    expect(violations.map((v) => v.message).join(' ')).toContain('cortex hook post-read');
  });

  it('pre-read present but post-read missing → exactly one error (the pair registers together)', () => {
    const root = tmp('hc-half');
    writeSettings(root, { PreToolUse: PAIR.PreToolUse, ...SESSION_ROWS });
    const violations = checkHookConfig(root, { hooks: { preRead: true } });
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('cortex hook post-read');
  });
});

describe('check.hook-config: flag false forbids the pair', () => {
  it('preRead: false + no entries → passes', () => {
    const root = tmp('hc-off-clean');
    writeSettings(root, {});
    expect(checkHookConfig(root, { hooks: { preRead: false } })).toEqual([]);
  });

  it('preRead: false + entries still present → error', () => {
    const root = tmp('hc-off-stale');
    writeSettings(root, FULL);
    const violations = checkHookConfig(root, { hooks: { preRead: false } });
    expect(violations).toHaveLength(1);
    expect(violations[0]!.severity).toBe('error');
    expect(violations[0]!.message).toContain('preRead is false');
  });

  it('user-owned Read hooks (no cortex ownership marker) are never implicated', () => {
    const root = tmp('hc-user');
    writeSettings(root, {
      PreToolUse: [{ matcher: 'Read', hooks: [{ type: 'command', command: 'my-own-guard' }] }],
    });
    expect(checkHookConfig(root, { hooks: { preRead: false } })).toEqual([]);
  });
});

describe('check.hook-config: degradation', () => {
  it('missing settings.json → no violations (nothing registered yet is init\'s business)', () => {
    const root = tmp('hc-nosettings');
    expect(checkHookConfig(root, { hooks: { preRead: true } })).toEqual([]);
  });

  it('unparseable settings.json → skipped, no violations', () => {
    const root = tmp('hc-badjson');
    const p = path.join(root, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, 'NOT JSON {{{');
    expect(checkHookConfig(root, { hooks: { preRead: true } })).toEqual([]);
  });
});

describe('check.hook-config: SessionEnd and Stop rows (3.3 third revision, hooks.session-end Rule 1)', () => {
  it('both present alongside the other Cortex entries → passes; an edited timeout keeps the file conformant', () => {
    const root = tmp('hc-se-pass');
    writeSettings(root, {
      ...PAIR,
      SessionEnd: [{ hooks: [{ type: 'command', command: 'cortex hook session-end', timeout: 42 }] }],
      Stop: [{ hooks: [{ type: 'command', command: 'cortex hook stop' }] }],
    });
    expect(checkHookConfig(root, {})).toEqual([]);
  });

  it('other Cortex entries present but both rows missing → two errors naming each, keyed hooks.SessionEnd / hooks.Stop, remedy `cortex sync`', () => {
    const root = tmp('hc-se-missing');
    writeSettings(root, PAIR);
    const violations = checkHookConfig(root, {});
    expect(violations).toHaveLength(2);
    expect(violations.every((v) => v.severity === 'error' && v.check === 'check.hook-config' && v.clause === '§5')).toBe(true);
    expect(violations.map((v) => v.location.key).sort()).toEqual(['hooks.SessionEnd', 'hooks.Stop']);
    const bySessionEnd = violations.find((v) => v.location.key === 'hooks.SessionEnd')!;
    const byStop = violations.find((v) => v.location.key === 'hooks.Stop')!;
    expect(bySessionEnd.message).toContain('cortex hook session-end');
    expect(byStop.message).toContain('cortex hook stop');
    expect(bySessionEnd.message).toMatch(/run `cortex sync`$/);
    expect(byStop.message).toMatch(/run `cortex sync`$/);
  });

  it('only one of the two missing → exactly that one error', () => {
    const root = tmp('hc-se-half');
    writeSettings(root, { ...PAIR, SessionEnd: SESSION_ROWS.SessionEnd });
    const violations = checkHookConfig(root, {});
    expect(violations).toHaveLength(1);
    expect(violations[0]!.location.key).toBe('hooks.Stop');
  });

  it('a settings file with no Cortex-owned entry at all is not implicated', () => {
    const root = tmp('hc-se-none');
    writeSettings(root, {
      Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }],
      SessionEnd: [{ hooks: [{ type: 'command', command: 'my-own-teardown' }] }],
    });
    expect(checkHookConfig(root, { hooks: { preRead: false } })).toEqual([]);
  });
});
