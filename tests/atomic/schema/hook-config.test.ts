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

const READ_PRE = { matcher: 'Read', hooks: [{ type: 'command', command: 'cortex hook pre-read' }] };
const READ_POST = { matcher: 'Read', hooks: [{ type: 'command', command: 'cortex hook post-read' }] };
/** The Grep|Bash row (3.4 second revision, hooks.search-annotate Rule 1) —
 *  required under the same whole-set condition as SessionEnd + Stop, and NOT
 *  behind hooks.preRead; fixtures that carry the Read pair carry it too. */
const SEARCH_ROW = { matcher: 'Grep|Bash', hooks: [{ type: 'command', command: 'cortex hook search-annotate' }] };
const PAIR = {
  PreToolUse: [READ_PRE, SEARCH_ROW],
  PostToolUse: [READ_POST],
};

/** The SessionEnd + Stop rows (3.3 third revision) — required whenever any
 *  Cortex-owned entry is present, so fixtures that carry the Read pair carry
 *  these too (otherwise the count under test would include their absence). */
/** The UserPromptSubmit row (3.4 third revision, hooks.prompt-route Rule 1) —
 *  no matcher (the event supports none), required under the same whole-set
 *  condition, and NOT behind hooks.preRead. */
const PROMPT_ROW = { hooks: [{ type: 'command', command: 'cortex hook prompt-route' }] };
const SESSION_ROWS = {
  SessionEnd: [{ hooks: [{ type: 'command', command: 'cortex hook session-end', timeout: 10 }] }],
  Stop: [{ hooks: [{ type: 'command', command: 'cortex hook stop' }] }],
  UserPromptSubmit: [PROMPT_ROW],
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
      UserPromptSubmit: [PROMPT_ROW],
    });
    expect(checkHookConfig(root, {})).toEqual([]);
  });

  it('other Cortex entries present but both rows missing → two errors naming each, keyed hooks.SessionEnd / hooks.Stop, remedy `cortex sync`', () => {
    const root = tmp('hc-se-missing');
    writeSettings(root, { ...PAIR, UserPromptSubmit: [PROMPT_ROW] });
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
    writeSettings(root, { ...PAIR, SessionEnd: SESSION_ROWS.SessionEnd, UserPromptSubmit: [PROMPT_ROW] });
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

describe('check.hook-config: the PreToolUse Grep|Bash row (3.4 second revision, hooks.search-annotate Rule 1)', () => {
  it('other Cortex entries present but the row missing → exactly one error keyed hooks.PreToolUse naming `cortex hook search-annotate`, `Grep|Bash` and `cortex sync`', () => {
    const root = tmp('hc-sa-missing');
    writeSettings(root, { PreToolUse: [READ_PRE], PostToolUse: [READ_POST], ...SESSION_ROWS });
    const violations = checkHookConfig(root, {});
    expect(violations).toHaveLength(1);
    const v = violations[0]!;
    expect(v.severity).toBe('error');
    expect(v.check).toBe('check.hook-config');
    expect(v.clause).toBe('§5');
    expect(v.location.key).toBe('hooks.PreToolUse');
    expect(v.message).toContain('cortex hook search-annotate');
    expect(v.message).toContain('Grep|Bash');
    expect(v.message).toMatch(/run `cortex sync`$/);
  });

  it('is not behind hooks.preRead: with the flag false and no Read pair, the row is still required — and its presence passes', () => {
    const missing = tmp('hc-sa-flag-off-missing');
    writeSettings(missing, {
      SessionStart: [{ hooks: [{ type: 'command', command: 'cortex hook session-start' }] }],
      ...SESSION_ROWS,
    });
    const violations = checkHookConfig(missing, { hooks: { preRead: false } });
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('cortex hook search-annotate');

    const present = tmp('hc-sa-flag-off-present');
    writeSettings(present, {
      SessionStart: [{ hooks: [{ type: 'command', command: 'cortex hook session-start' }] }],
      PreToolUse: [SEARCH_ROW],
      ...SESSION_ROWS,
    });
    expect(checkHookConfig(present, { hooks: { preRead: false } })).toEqual([]);
  });

  it('a user-owned Grep|Bash hook without the ownership marker neither satisfies nor triggers the check', () => {
    const none = tmp('hc-sa-user-only');
    writeSettings(none, { PreToolUse: [{ matcher: 'Grep|Bash', hooks: [{ type: 'command', command: 'my-own-search-guard' }] }] });
    expect(checkHookConfig(none, { hooks: { preRead: false } })).toEqual([]);

    const stale = tmp('hc-sa-user-plus-cortex');
    writeSettings(stale, {
      PreToolUse: [{ matcher: 'Grep|Bash', hooks: [{ type: 'command', command: 'my-own-search-guard' }] }],
      ...SESSION_ROWS,
    });
    const violations = checkHookConfig(stale, { hooks: { preRead: false } });
    expect(violations.map((v) => v.location.key)).toEqual(['hooks.PreToolUse']);
  });
});

describe('check.hook-config: the UserPromptSubmit row (3.4 third revision, hooks.prompt-route Rule 1)', () => {
  const WITHOUT_PROMPT = { SessionEnd: SESSION_ROWS.SessionEnd, Stop: SESSION_ROWS.Stop };

  it('other Cortex entries present but the row missing → exactly one error keyed hooks.UserPromptSubmit naming `cortex hook prompt-route`, `UserPromptSubmit` and `cortex sync`', () => {
    const root = tmp('hc-pr-missing');
    writeSettings(root, { ...PAIR, ...WITHOUT_PROMPT });
    const violations = checkHookConfig(root, {});
    expect(violations).toHaveLength(1);
    const v = violations[0]!;
    expect(v.severity).toBe('error');
    expect(v.check).toBe('check.hook-config');
    expect(v.clause).toBe('§5');
    expect(v.location.key).toBe('hooks.UserPromptSubmit');
    expect(v.message).toContain('cortex hook prompt-route');
    expect(v.message).toContain('UserPromptSubmit');
    expect(v.message).toMatch(/run `cortex sync`$/);
  });

  it('is not behind hooks.preRead (nor hooks.readDefer): with the flag false and no Read pair, the row is still required — and its presence passes', () => {
    const missing = tmp('hc-pr-flag-off-missing');
    writeSettings(missing, {
      SessionStart: [{ hooks: [{ type: 'command', command: 'cortex hook session-start' }] }],
      PreToolUse: [SEARCH_ROW],
      ...WITHOUT_PROMPT,
    });
    const violations = checkHookConfig(missing, { hooks: { preRead: false, readDefer: false } });
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('cortex hook prompt-route');

    const present = tmp('hc-pr-flag-off-present');
    writeSettings(present, {
      SessionStart: [{ hooks: [{ type: 'command', command: 'cortex hook session-start' }] }],
      PreToolUse: [SEARCH_ROW],
      ...SESSION_ROWS,
    });
    expect(checkHookConfig(present, { hooks: { preRead: false } })).toEqual([]);
  });

  it('a user-owned UserPromptSubmit hook without the ownership marker neither satisfies nor triggers the check', () => {
    const none = tmp('hc-pr-user-only');
    writeSettings(none, { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'my-own-prompt-guard' }] }] });
    expect(checkHookConfig(none, { hooks: { preRead: false } })).toEqual([]);

    const stale = tmp('hc-pr-user-plus-cortex');
    writeSettings(stale, {
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'my-own-prompt-guard' }] }],
      PreToolUse: [SEARCH_ROW],
      ...WITHOUT_PROMPT,
    });
    const violations = checkHookConfig(stale, { hooks: { preRead: false } });
    expect(violations.map((v) => v.location.key)).toEqual(['hooks.UserPromptSubmit']);
  });

  it('the whole always-on set missing → four errors, one per row, in table order', () => {
    const root = tmp('hc-pr-all-missing');
    writeSettings(root, { SessionStart: [{ hooks: [{ type: 'command', command: 'cortex hook session-start' }] }] });
    const violations = checkHookConfig(root, { hooks: { preRead: false } });
    expect(violations.map((v) => v.location.key)).toEqual(['hooks.SessionEnd', 'hooks.Stop', 'hooks.PreToolUse', 'hooks.UserPromptSubmit']);
  });
});
