/**
 * Spec tests — specflow.check, phase 1: rules (a), (d), (e), commit and range
 * modes, merges and the log. Each test is named after its criterion and runs
 * real git in a temp repository.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { cleanRepos, tmpRepo } from '../../fixtures/store.js';
import { check } from '../../../src/specflow/check/index.js';

afterEach(cleanRepos);

const SPEC = 'specflow/impl/billing/refunds.spec.md';
const TRAILER = 'Specflow-Amends: billing.refunds#BILLING-REFUNDS-3 — refund window is now 30 days';

function text(rules: string[], criteria: string[], opts: { status?: string; intent?: string; level?: number } = {}): string {
  const h = '#'.repeat(opts.level ?? 2);
  const numbered = rules.map((r, i) => `${i + 1}. ${r}`).join('\n');
  const crits = criteria.map((c) => `${h}# ${c}\n\n- **Then** ok\n`).join('\n');
  return `---\nid: billing.refunds\nstatus: ${opts.status ?? 'draft'}\n---\n\n# Refunds\n\n${h} Intent\n\n${opts.intent ?? 'Why.'}\n\n${h} Rules\n\n${numbered}\n\n${h} Acceptance Criteria\n\n${crits}\n${h} Notes\n\nNone.\n`;
}
const BASE = text(['Rule one.', 'Rule two.', 'Rule three.'], ['BILLING-REFUNDS-3: Window', 'BILLING-REFUNDS-4: Other']);

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function write(root: string, file: string, body: string): void {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), body);
}
function stage(root: string, files: Record<string, string>): void {
  for (const [f, body] of Object.entries(files)) write(root, f, body);
  git(root, 'add', '-A');
}
function commit(root: string, files: Record<string, string>, message = 'c'): string {
  stage(root, files);
  git(root, 'commit', '-q', '--no-verify', '--allow-empty', '-m', message);
  return git(root, 'rev-parse', 'HEAD').trim();
}
function repo(extra: Record<string, unknown> = {}): string {
  const root = tmpRepo('check');
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 't@example.com');
  git(root, 'config', 'user.name', 'T');
  commit(root, {
    'cortex/cortex.json': JSON.stringify({ schemaVersion: '4.0', specflow: { tests: [{ runner: 'vitest', include: ['tests/**/*.test.ts'] }], ...extra } }),
    [SPEC]: BASE,
    'src/keep.ts': 'export {};\n',
    'tests/keep.test.ts': "it('k', f);\n",
  });
  return root;
}
function run(root: string, message = 'msg'): { code: number; err: string } {
  const file = path.join(root, '.git', 'TEST_MSG');
  fs.writeFileSync(file, message);
  const err: string[] = [];
  const code = check(['--commit-msg', file], root, { stdout: () => {}, stderr: (l) => err.push(l) });
  return { code, err: err.join('\n') };
}
function range(root: string, spec = 'main..HEAD'): { code: number; err: string } {
  const err: string[] = [];
  const code = check(['--range', spec], root, { stdout: () => {}, stderr: (l) => err.push(l) });
  return { code, err: err.join('\n') };
}
function events(root: string): any[] {
  const p = path.join(root, '.git/specflow/events.jsonl');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8').trim().split('\n').map((l) => JSON.parse(l)) : [];
}

describe('specflow.check: rule (a)', () => {
  it('[SPECFLOW-CHECK-1] Code with no test change is refused', () => {
    const root = repo();
    stage(root, { 'src/a.ts': 'x' });
    const r = run(root);
    expect(r.code).toBe(1);
    expect(r.err).toContain('specflow: REFUSED (commit)');
    expect(r.err).toContain('- rule (a) code-needs-test: changes code or config with no test change: src/a.ts. Change or add the test that proves it.');
  });

  it('[SPECFLOW-CHECK-2] Code with a test change is allowed', () => {
    const root = repo();
    stage(root, { 'src/a.ts': 'x', 'tests/a.test.ts': 'y' });
    expect(run(root).code).toBe(0);
  });

  it('[SPECFLOW-CHECK-3] Config counts as code', () => {
    const root = repo();
    stage(root, { 'package.json': '{}' });
    const r = run(root);
    expect(r.code).toBe(1);
    expect(r.err).toContain('package.json');
  });

  it("[SPECFLOW-CHECK-4] The store's own config needs no test", () => {
    const root = repo();
    stage(root, { 'cortex/cortex.json': JSON.stringify({ schemaVersion: '4.0', specflow: { rules: { b: 'warn' } } }) });
    expect(run(root).code).toBe(0);
  });

  it('[SPECFLOW-CHECK-5] Docs, specs and hooks need no test', () => {
    const root = repo();
    stage(root, { 'README.md': '# r', [SPEC]: BASE.replace('None.', 'Some.'), '.githooks/pre-commit': '#!/bin/sh\n' });
    expect(run(root).code).toBe(0);
  });

  it('[SPECFLOW-CHECK-6] A rename counts as a code change', () => {
    const root = repo();
    git(root, 'mv', 'src/keep.ts', 'src/moved.ts');
    const r = run(root);
    expect(r.code).toBe(1);
    expect(r.err).toContain('src/keep.ts');
    expect(r.err).toContain('src/moved.ts');
  });

  it('[SPECFLOW-CHECK-79] a fixture, a snapshot and a generic test path count as a test change', () => {
    for (const test of ['tests/fixtures/data.json', 'src/__snapshots__/a.snap', 'src/a.spec.ts', 'backend/test_a.py', 'vitest.config.ts']) {
      const root = repo();
      stage(root, { 'src/a.ts': 'x', [test]: 'y' });
      expect(run(root).code, test).toBe(0);
    }
  });

  it('[SPECFLOW-CHECK-80] more than 8 paths are cut off with an ellipsis', () => {
    const root = repo();
    const files: Record<string, string> = {};
    for (let i = 0; i < 9; i += 1) files[`src/f${i}.ts`] = 'x';
    stage(root, files);
    const r = run(root);
    expect(r.err).toContain('src/f7.ts …');
    expect(r.err).not.toContain('src/f8.ts');
  });

  it('[SPECFLOW-CHECK-81] INDEX.md is ignored by every rule', () => {
    const root = repo();
    stage(root, { 'specflow/INDEX.md': 'generated' });
    expect(run(root).code).toBe(0);
  });
});

describe('specflow.check: rule (d)', () => {
  const edited = text(['Rule one.', 'Rule two.', 'Rule three.'], ['BILLING-REFUNDS-3: Window of 30', 'BILLING-REFUNDS-4: Other']);

  it('[SPECFLOW-CHECK-7] A criterion edit with code is refused', () => {
    const root = repo();
    stage(root, { [SPEC]: edited, 'src/a.ts': 'x', 'tests/a.test.ts': 'y' });
    const r = run(root, `m\n\n${TRAILER}\n`);
    expect(r.code).toBe(1);
    expect(r.err).toContain('- rule (d) spec-commit-alone: changes spec rules or criteria (billing.refunds#BILLING-REFUNDS-3) together with code or config (src/a.ts).');
  });

  it('[SPECFLOW-CHECK-8] A rule edit with code is refused', () => {
    const root = repo();
    stage(root, {
      [SPEC]: text(['Rule one.', 'Rule two, reworded.', 'Rule three.'], ['BILLING-REFUNDS-3: Window', 'BILLING-REFUNDS-4: Other']),
      'src/a.ts': 'x',
      'tests/a.test.ts': 'y',
    });
    const r = run(root, 'm\n\nSpecflow-Amends: billing.refunds#rule-2 — why\n');
    expect(r.code).toBe(1);
    expect(r.err).toContain('rule (d)');
    expect(r.err).toContain('billing.refunds#rule-2');
  });

  it('[SPECFLOW-CHECK-9] An Intent edit may share a commit with code', () => {
    const root = repo();
    stage(root, { [SPEC]: BASE.replace('Why.', 'Because.'), 'src/a.ts': 'x', 'tests/a.test.ts': 'y' });
    expect(run(root).code).toBe(0);
  });

  it('[SPECFLOW-CHECK-10] A promise edit is outside the check', () => {
    const root = repo();
    commit(root, { 'specflow/promises/billing/refunds.md': 'a' });
    stage(root, { 'specflow/promises/billing/refunds.md': 'b', 'src/a.ts': 'x', 'tests/a.test.ts': 'y' });
    expect(run(root).code).toBe(0);
  });

  it('[SPECFLOW-CHECK-82] an added criterion with code is refused too', () => {
    const root = repo();
    stage(root, {
      [SPEC]: text(['Rule one.', 'Rule two.', 'Rule three.'], ['BILLING-REFUNDS-3: Window', 'BILLING-REFUNDS-4: Other', 'BILLING-REFUNDS-9: New']),
      'src/a.ts': 'x',
      'tests/a.test.ts': 'y',
    });
    const r = run(root);
    expect(r.code).toBe(1);
    expect(r.err).toContain('rule (d)');
    expect(r.err).not.toContain('rule (e)');
  });
});

describe('specflow.check: rule (e)', () => {
  const edited = text(['Rule one.', 'Rule two.', 'Rule three.'], ['BILLING-REFUNDS-3: Window of 30', 'BILLING-REFUNDS-4: Other']);

  it('[SPECFLOW-CHECK-11] An amendment without a trailer is refused', () => {
    const root = repo();
    stage(root, { [SPEC]: edited });
    const r = run(root);
    expect(r.code).toBe(1);
    expect(r.err).toContain('- rule (e) amend-needs-trailer: changes existing spec text with no trailer for: billing.refunds#BILLING-REFUNDS-3.');
  });

  it('[SPECFLOW-CHECK-12] An amendment with its trailer is allowed and recorded', () => {
    const root = repo();
    stage(root, { [SPEC]: edited });
    expect(run(root, `m\n\n${TRAILER}\n`).code).toBe(0);
    const lines = fs.readFileSync(path.join(root, '.git/specflow/amendments.jsonl'), 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ spec: 'billing.refunds', file: SPEC, item: 'BILLING-REFUNDS-3', change: 'changed', trailer: TRAILER, subject: 'm' });
  });

  it('[SPECFLOW-CHECK-83] every separator of schema S10 is accepted', () => {
    for (const sep of ['—', '-', '--']) {
      const root = repo();
      stage(root, { [SPEC]: edited });
      expect(run(root, `m\n\nSpecflow-Amends: billing.refunds#BILLING-REFUNDS-3 ${sep} why\n`).code, sep).toBe(0);
    }
  });

  it('[SPECFLOW-CHECK-13] A trailer for another item does not count', () => {
    const root = repo();
    stage(root, { [SPEC]: text(['Rule one.', 'Rule two, new.', 'Rule three, new.'], ['BILLING-REFUNDS-3: Window', 'BILLING-REFUNDS-4: Other']) });
    const r = run(root, 'm\n\nSpecflow-Amends: billing.refunds#rule-2 — why\n');
    expect(r.code).toBe(1);
    expect(r.err).toContain('no trailer for: billing.refunds#rule-3.');
    expect(r.err).not.toContain('#rule-2.');
  });

  it('[SPECFLOW-CHECK-14] A trailer with no reason does not count', () => {
    const root = repo();
    stage(root, { [SPEC]: edited });
    const r = run(root, 'm\n\nSpecflow-Amends: billing.refunds#BILLING-REFUNDS-3\n');
    expect(r.code).toBe(1);
    expect(r.err).toContain('rule (e)');
  });

  it('[SPECFLOW-CHECK-15] Removing a criterion is an amendment', () => {
    const root = repo();
    stage(root, { [SPEC]: text(['Rule one.', 'Rule two.', 'Rule three.'], ['BILLING-REFUNDS-4: Other']) });
    const r = run(root);
    expect(r.code).toBe(1);
    expect(r.err).toContain('billing.refunds#BILLING-REFUNDS-3');
  });

  it('[SPECFLOW-CHECK-16] Adding a criterion needs no trailer', () => {
    const root = repo();
    stage(root, { [SPEC]: text(['Rule one.', 'Rule two.', 'Rule three.'], ['BILLING-REFUNDS-3: Window', 'BILLING-REFUNDS-4: Other', 'BILLING-REFUNDS-9: New']) });
    expect(run(root).code).toBe(0);
  });

  it('[SPECFLOW-CHECK-17] Retiring a spec with code is refused', () => {
    const root = repo();
    stage(root, { [SPEC]: BASE.replace('status: draft', 'status: retired'), 'src/a.ts': 'x', 'tests/a.test.ts': 'y' });
    const r = run(root, 'm\n\nSpecflow-Amends: billing.refunds#retired — replaced\n');
    expect(r.code).toBe(1);
    expect(r.err).toContain('rule (d)');
  });

  it('[SPECFLOW-CHECK-18] Retiring a spec needs one trailer', () => {
    const root = repo();
    stage(root, { [SPEC]: BASE.replace('status: draft', 'status: retired') });
    expect(run(root, 'm\n\nSpecflow-Amends: billing.refunds#retired — replaced by billing.new\n').code).toBe(0);
    const r = run(root);
    expect(r.code).toBe(1);
    expect(r.err).toContain('rule (e)');
  });

  it('[SPECFLOW-CHECK-19] Editing a retired spec is not judged', () => {
    const root = repo();
    commit(root, { [SPEC]: BASE.replace('status: draft', 'status: retired') });
    stage(root, {
      [SPEC]: BASE.replace('status: draft', 'status: retired').replace('BILLING-REFUNDS-3: Window', 'BILLING-REFUNDS-3: Changed'),
      'src/a.ts': 'x',
      'tests/a.test.ts': 'y',
    });
    expect(run(root).code).toBe(0);
  });

  it('[SPECFLOW-CHECK-21] Inserting a rule mid-list amends nothing', () => {
    const root = repo();
    stage(root, { [SPEC]: text(['Rule one.', 'Rule new.', 'Rule two.', 'Rule three.'], ['BILLING-REFUNDS-3: Window', 'BILLING-REFUNDS-4: Other']) });
    expect(run(root).code).toBe(0);
  });

  it('[SPECFLOW-CHECK-22] Inserting a rule and editing a shifted one needs the base number', () => {
    const root = repo();
    stage(root, { [SPEC]: text(['Rule one.', 'Rule new.', 'Rule two.', 'Rule three, reworded.'], ['BILLING-REFUNDS-3: Window', 'BILLING-REFUNDS-4: Other']) });
    const r = run(root);
    expect(r.code).toBe(1);
    expect(r.err).toContain('no trailer for: billing.refunds#rule-3.');
    expect(run(root, 'm\n\nSpecflow-Amends: billing.refunds#rule-3 — why\n').code).toBe(0);
  });

  it('[SPECFLOW-CHECK-84] a criterion in a later section is judged', () => {
    const root = repo();
    const later = (t: string): string => `${BASE}\n## Acceptance Criteria: amendment\n\n### BILLING-REFUNDS-7: ${t}\n\n- **Then** ok\n`;
    commit(root, { [SPEC]: later('Old') });
    stage(root, { [SPEC]: later('New') });
    const r = run(root);
    expect(r.code).toBe(1);
    expect(r.err).toContain('billing.refunds#BILLING-REFUNDS-7');
  });

  it('[SPECFLOW-CHECK-23] Rules are found on both heading layouts', () => {
    const root = repo();
    const second = 'specflow/impl/billing/other.spec.md';
    const deep = (r: string, c: string): string =>
      text([r], [`BILLING-OTHER-1: ${c}`], { level: 3 }).replace('id: billing.refunds', 'id: billing.other');
    commit(root, { [second]: deep('Old.', 'Old') });
    stage(root, {
      [SPEC]: text(['Rule one, new.', 'Rule two.', 'Rule three.'], ['BILLING-REFUNDS-3: New', 'BILLING-REFUNDS-4: Other']),
      [second]: deep('New.', 'New'),
    });
    const r = run(root);
    expect(r.code).toBe(1);
    for (const item of ['billing.refunds#rule-1', 'billing.refunds#BILLING-REFUNDS-3', 'billing.other#rule-1', 'billing.other#BILLING-OTHER-1']) {
      expect(r.err).toContain(item);
    }
  });

  it('[SPECFLOW-CHECK-85] A whitespace edit does not fire rule (d) or (e)', () => {
    const root = repo();
    stage(root, { [SPEC]: BASE.replace('- **Then** ok', '- **Then**\n  ok').replace('Rule one.', '**Rule**   one.'), 'src/a.ts': 'x', 'tests/a.test.ts': 'y' });
    expect(run(root).code).toBe(0);
  });

  it('[SPECFLOW-CHECK-20] Moving a spec file changes no item', () => {
    const root = repo();
    git(root, 'mv', SPEC, 'specflow/impl/billing/moved.spec.md');
    expect(run(root).code).toBe(0);
  });

  it('[SPECFLOW-CHECK-31] The config cannot switch a measured rule off', () => {
    const root = repo({ rules: { a: 'off', d: 'off', e: 'off' } });
    stage(root, { 'src/a.ts': 'x' });
    const r = run(root);
    expect(r.code).toBe(1);
    expect(r.err).toContain('rule (a)');
  });
});

describe('specflow.check: range mode', () => {
  function branch(): string {
    const root = repo();
    git(root, 'checkout', '-q', '-b', 'work');
    return root;
  }

  it('[SPECFLOW-CHECK-37] Range mode replays each commit', () => {
    const root = branch();
    commit(root, { 'README.md': 'a' }, 'one');
    const second = commit(root, { 'src/a.ts': 'x' }, 'two');
    commit(root, { 'README.md': 'b' }, 'three');
    const r = range(root);
    expect(r.code).toBe(1);
    const short = second.slice(0, 7);
    expect(r.err.match(/specflow: (allowed|REFUSED) /g)).toHaveLength(3);
    expect(r.err).toContain(`specflow: REFUSED (${short}`);
    expect(r.err.match(/rule \(a\)/g)).toHaveLength(1);
    expect(r.err).toContain(' two\n');
  });

  it("[SPECFLOW-CHECK-38] Range mode reads each commit's own trailer", () => {
    const root = branch();
    commit(root, { [SPEC]: BASE.replace('BILLING-REFUNDS-3: Window', 'BILLING-REFUNDS-3: X') }, `one\n\n${TRAILER}`);
    commit(root, { [SPEC]: BASE.replace('BILLING-REFUNDS-3: Window', 'BILLING-REFUNDS-3: X').replace('BILLING-REFUNDS-4: Other', 'BILLING-REFUNDS-4: Y') }, 'two');
    const r = range(root);
    expect(r.code).toBe(1);
    expect(r.err.match(/rule \(e\)/g)).toHaveLength(1);
    expect(r.err).toContain('billing.refunds#BILLING-REFUNDS-4');
  });

  it('[SPECFLOW-CHECK-39] Commits before the hooks are not judged', () => {
    const root = branch();
    const since = commit(root, { 'src/a.ts': 'x' }, 'old code only');
    commit(root, { 'cortex/cortex.json': JSON.stringify({ schemaVersion: '4.0', specflow: { since } }) }, 'hooks');
    commit(root, { 'src/b.ts': 'x', 'tests/b.test.ts': 'y' }, 'valid');
    const r = range(root);
    expect(r.code).toBe(0);
    expect(r.err).not.toContain('old code only');
  });

  it('[SPECFLOW-CHECK-40] An empty range is a pass that says so', () => {
    const root = repo();
    const r = range(root);
    expect(r.code).toBe(0);
    expect(r.err).toBe('specflow: 0 commits in range');
  });
});

describe('specflow.check: merges, amends, edges', () => {
  function diverged(): string {
    const root = repo();
    git(root, 'checkout', '-q', '-b', 'side');
    commit(root, { 'src/side.ts': 'side\n' });
    git(root, 'checkout', '-q', 'main');
    commit(root, { 'README.md': 'main\n' });
    return root;
  }
  function startMerge(root: string, branchName: string): void {
    try {
      git(root, 'merge', '--no-commit', '--no-ff', branchName);
    } catch {
      // a conflicted merge exits non-zero and leaves MERGE_HEAD
    }
  }

  it('[SPECFLOW-CHECK-41] A clean merge passes', () => {
    const root = diverged();
    startMerge(root, 'side');
    expect(run(root, 'Merge').code).toBe(0);
    expect(events(root)[0]).toMatchObject({ kind: 'merge', outcome: 'allowed' });
  });

  it("[SPECFLOW-CHECK-42] A merge's own code change is judged", () => {
    const root = diverged();
    startMerge(root, 'side');
    stage(root, { 'src/side.ts': 'edited by hand\n' });
    const r = run(root, 'Merge');
    expect(r.code).toBe(1);
    expect(r.err).toContain('specflow: REFUSED (merge commit)');
    expect(r.err).toContain('rule (a)');
    expect(r.err).toContain('src/side.ts');
  });

  it('[SPECFLOW-CHECK-43] A conflict resolution is not judged', () => {
    const root = repo();
    commit(root, { 'src/a.ts': 'base\n', 'tests/a.test.ts': 'y' });
    git(root, 'checkout', '-q', '-b', 'side');
    commit(root, { 'src/a.ts': 'side\n' });
    git(root, 'checkout', '-q', 'main');
    commit(root, { 'src/a.ts': 'main\n' });
    startMerge(root, 'side');
    stage(root, { 'src/a.ts': 'resolved\n' });
    expect(run(root, 'Merge').code).toBe(0);
  });

  it('[SPECFLOW-CHECK-86] A merge commit in a range is judged from its parents', () => {
    const root = diverged();
    git(root, 'merge', '-q', '--no-ff', '--no-edit', 'side');
    const clean = git(root, 'rev-parse', '--short', 'HEAD').trim();
    // The side commit in the range is code-only and refused; the merge adds nothing over its parents.
    expect(range(root, 'HEAD^..HEAD').err).toContain(`specflow: allowed (${clean})`);

    const edited = diverged();
    startMerge(edited, 'side');
    stage(edited, { 'src/side.ts': 'edited by hand\n' });
    git(edited, 'commit', '-q', '--no-verify', '-m', 'Merge with a hand edit');
    const merge = git(edited, 'rev-parse', '--short', 'HEAD').trim();
    expect(range(edited, 'HEAD^..HEAD').err).toContain(`specflow: REFUSED (${merge})`);
  });

  it('[SPECFLOW-CHECK-44] An amend compares against the parent', () => {
    const root = repo();
    commit(root, { 'src/a.ts': 'x', 'tests/a.test.ts': 'y' });
    fs.writeFileSync(path.join(root, '.git/specflow-amend'), git(root, 'rev-parse', 'HEAD'));
    expect(run(root).code).toBe(0);
    expect(fs.existsSync(path.join(root, '.git/specflow-amend'))).toBe(false);
  });

  it('[SPECFLOW-CHECK-87] a stale amend marker is ignored and deleted', () => {
    const root = repo();
    commit(root, { 'tests/a.test.ts': 'y' });
    fs.writeFileSync(path.join(root, '.git/specflow-amend'), 'deadbeef');
    stage(root, { 'src/a.ts': 'x' });
    expect(run(root).code).toBe(1);
    expect(fs.existsSync(path.join(root, '.git/specflow-amend'))).toBe(false);
  });

  it('[SPECFLOW-CHECK-45] The first commit is not judged', () => {
    const root = tmpRepo('first');
    git(root, 'init', '-q', '-b', 'main');
    write(root, 'specflow/x.md', 'x');
    stage(root, { 'src/a.ts': 'x' });
    expect(run(root).code).toBe(0);
  });

  it('[SPECFLOW-CHECK-46] No specflow folder says so', () => {
    const root = tmpRepo('none');
    git(root, 'init', '-q', '-b', 'main');
    stage(root, { 'src/a.ts': 'x' });
    const r = run(root);
    expect(r.code).toBe(0);
    expect(r.err).toBe('specflow: no specflow/ folder here; nothing was checked');
  });

  it('[SPECFLOW-CHECK-47] An internal error is not a pass', () => {
    const root = repo();
    write(root, 'cortex/cortex.json', '{ not json');
    const r = run(root);
    expect(r.code).toBe(2);
    expect(r.err.startsWith('specflow: internal error in the check (not a verdict on your change):')).toBe(true);
  });

  it('[SPECFLOW-CHECK-47] an internal error is logged', () => {
    const root = repo();
    write(root, 'cortex/cortex.json', '{ not json');
    run(root);
    expect(events(root).at(-1)).toMatchObject({ outcome: 'error' });
  });

  it('[SPECFLOW-CHECK-69] Bad arguments are a usage error', () => {
    const root = repo();
    const out: string[] = [];
    const io = { stdout: (l: string) => out.push(l), stderr: () => {} };
    expect(check([], root, io)).toBe(2);
    expect(check(['--range', 'main'], root, io)).toBe(2);
    expect(out).toHaveLength(2);
    expect(out[0]).toContain('usage: cortex check');
  });
});

describe('specflow.check: the log', () => {
  it('[SPECFLOW-CHECK-74] Every verdict is logged', () => {
    const root = repo();
    stage(root, { 'src/a.ts': 'x' });
    run(root);
    stage(root, { 'tests/a.test.ts': 'y' });
    run(root);
    const e = events(root);
    expect(e.map((x) => x.outcome)).toEqual(['refused', 'allowed']);
    expect(e[0].rules).toEqual(['a']);
    expect(e[0].kind).toBe('commit');
    expect(Object.keys(e[0]).sort()).toEqual(['kind', 'outcome', 'reasons', 'rules', 'subject', 'ts', 'warned']);
  });

  it('[SPECFLOW-CHECK-75] A range writes no amendment record', () => {
    const root = repo();
    git(root, 'checkout', '-q', '-b', 'work');
    commit(root, { [SPEC]: BASE.replace('BILLING-REFUNDS-3: Window', 'BILLING-REFUNDS-3: X') }, `one\n\n${TRAILER}`);
    expect(range(root).code).toBe(0);
    expect(fs.existsSync(path.join(root, '.git/specflow/amendments.jsonl'))).toBe(false);
  });

  it('[SPECFLOW-CHECK-76] The log is shared by worktrees', () => {
    const root = repo();
    const linked = path.join(tmpRepo('wt'), 'linked');
    git(root, 'worktree', 'add', '-q', '-b', 'wt', linked);
    write(linked, 'README.md', 'a');
    git(linked, 'add', '-A');
    const file = path.join(linked, 'MSG');
    fs.writeFileSync(file, 'm');
    expect(check(['--commit-msg', file], linked, { stderr: () => {} })).toBe(0);
    expect(events(root)).toHaveLength(1);
    expect(git(root, 'status', '--porcelain')).toBe('');
  });

  it('[SPECFLOW-CHECK-77] An unwritable log does not change the verdict', () => {
    const root = repo();
    write(root, '.git/specflow', 'a file');
    stage(root, { 'README.md': 'a' });
    const r = run(root);
    expect(r.code).toBe(0);
    expect(r.err).toContain('specflow: warning:');
  });
});

describe('specflow.check: rule (b)', () => {
  const config = (b: string) => ({ rules: { b } });

  it('[SPECFLOW-CHECK-24] An untagged changed test is refused when rule (b) is on', () => {
    const root = repo(config('refuse'));
    stage(root, { 'tests/a.test.ts': "it('adds up', f);\n" });
    const r = run(root);
    expect(r.code).toBe(1);
    expect(r.err).toContain('- rule (b) test-needs-tag: test case without a resolving criterion tag: tests/a.test.ts › adds up.');
  });

  it('[SPECFLOW-CHECK-25] A tag that resolves passes rule (b)', () => {
    const root = repo(config('refuse'));
    stage(root, { 'tests/a.test.ts': "it('[BILLING-REFUNDS-3] adds up', f);\n" });
    expect(run(root).code).toBe(0);
  });

  it('[SPECFLOW-CHECK-26] A tag naming no criterion is refused', () => {
    const root = repo(config('refuse'));
    stage(root, { 'tests/a.test.ts': "it('[BILLING-REFUNDS-99] adds up', f);\n" });
    const r = run(root);
    expect(r.code).toBe(1);
    expect(r.err).toContain('rule (b)');
  });

  it('[SPECFLOW-CHECK-27] A second tag naming nothing warns', () => {
    const root = repo(config('refuse'));
    stage(root, { 'tests/a.test.ts': "it('[BILLING-REFUNDS-3, BILLING-REFUNDS-99] adds up', f);\n" });
    const r = run(root);
    expect(r.code).toBe(0);
    expect(r.err).toContain('specflow: warning: tag naming no criterion: [BILLING-REFUNDS-99]');
  });

  it('[SPECFLOW-CHECK-28] A helper change is not a changed case', () => {
    const root = repo();
    commit(root, { 'tests/a.test.ts': "const help = 1;\nit('old', f);\n" });
    commit(root, { 'cortex/cortex.json': JSON.stringify({ schemaVersion: '4.0', specflow: { rules: { b: 'refuse' }, tests: [{ runner: 'vitest', include: ['tests/**/*.test.ts'] }] } }) });
    stage(root, { 'tests/a.test.ts': "const help = 2;\nit('old', f);\n" });
    expect(run(root).code).toBe(0);
  });

  it('[SPECFLOW-CHECK-88] a changed case body counts, whitespace does not', () => {
    const root = repo();
    commit(root, { 'tests/a.test.ts': "it('old', () => { a(); });\n" });
    commit(root, { 'cortex/cortex.json': JSON.stringify({ schemaVersion: '4.0', specflow: { rules: { b: 'refuse' }, tests: [{ runner: 'vitest', include: ['tests/**/*.test.ts'] }] } }) });
    stage(root, { 'tests/a.test.ts': "it('old', () => {\n  a();\n});\n" });
    expect(run(root).code).toBe(0);
    stage(root, { 'tests/a.test.ts': "it('old', () => { b(); });\n" });
    expect(run(root).code).toBe(1);
  });

  it('[SPECFLOW-CHECK-29] Rule (b) is off by default', () => {
    const root = repo();
    stage(root, { 'tests/a.test.ts': "it('adds up', f);\n" });
    const r = run(root);
    expect(r.code).toBe(0);
    expect(r.err).not.toContain('rule (b)');
    expect(r.err).not.toContain('tests/a.test.ts');
  });

  it('[SPECFLOW-CHECK-30] Rule (b) at warn does not refuse', () => {
    const root = repo(config('warn'));
    stage(root, { 'tests/a.test.ts': "it('adds up', f);\n" });
    const r = run(root);
    expect(r.code).toBe(0);
    expect(r.err).toContain('specflow: warning: test case without a resolving criterion tag: tests/a.test.ts › adds up');
  });
});

describe('specflow.check: rule (c)', () => {
  const on = { rules: { c: 'refuse' } };
  const edited = BASE.replace('BILLING-REFUNDS-3: Window', 'BILLING-REFUNDS-3: Thirty');
  const msg = `m\n\n${TRAILER}\n`;

  it('[SPECFLOW-CHECK-32] A changed criterion with no test warns at commit', () => {
    const root = repo(on);
    stage(root, { [SPEC]: edited });
    const r = run(root, msg);
    expect(r.code).toBe(0);
    expect(r.err).toContain('specflow: warning: criterion text changed with no tagged test changed yet: BILLING-REFUNDS-3.');
  });

  it('[SPECFLOW-CHECK-33] A test changed in HEAD settles rule (c) at commit', () => {
    const root = repo(on);
    commit(root, { 'src/a.ts': 'x', 'tests/a.test.ts': "it('[BILLING-REFUNDS-3] x', f);\n" });
    stage(root, { [SPEC]: edited });
    const r = run(root, msg);
    expect(r.code).toBe(0);
    expect(r.err).not.toContain('criterion text changed');
  });

  it('[SPECFLOW-CHECK-34] A whitespace edit does not fire rule (c)', () => {
    const root = repo(on);
    stage(root, { [SPEC]: BASE.replace('- **Then** ok', '- **Then**\n  ok') });
    const r = run(root);
    expect(r.code).toBe(0);
    expect(r.err).toBe('');
  });

  it('[SPECFLOW-CHECK-35] A range with no tagged test change is refused by rule (c)', () => {
    const root = repo(on);
    git(root, 'checkout', '-q', '-b', 'work');
    commit(root, { [SPEC]: edited }, msg);
    commit(root, { 'src/a.ts': 'x', 'tests/a.test.ts': "it('other', f);\n" });
    const r = range(root);
    expect(r.code).toBe(1);
    expect(r.err).toContain('- rule (c) criterion-needs-test: criterion text changed with no tagged test changed: BILLING-REFUNDS-3.');
  });

  it('[SPECFLOW-CHECK-36] A range with the tagged test later in the branch passes rule (c)', () => {
    const root = repo(on);
    git(root, 'checkout', '-q', '-b', 'work');
    commit(root, { [SPEC]: edited }, msg);
    commit(root, { 'src/a.ts': 'x', 'tests/a.test.ts': "it('[BILLING-REFUNDS-3] x', f);\n" });
    expect(range(root).code).toBe(0);
  });

  it('[SPECFLOW-CHECK-89] rule (c) off says nothing at commit or in a range', () => {
    const root = repo();
    git(root, 'checkout', '-q', '-b', 'work');
    commit(root, { [SPEC]: edited }, msg);
    const r = range(root);
    expect(r.code).toBe(0);
    expect(r.err).not.toContain('criterion text changed');
  });
});

describe('specflow.check: rules (f) and (g)', () => {
  it('[SPECFLOW-CHECK-70] Touched criteria are listed through imports', () => {
    const root = repo();
    commit(root, {
      'src/a.ts': 'export const a = 1;\n',
      'src/b.ts': "import { a } from './a.js';\nexport const b = a;\n",
      'tests/b.test.ts': "import { b } from '../src/b.js';\nit('[BILLING-REFUNDS-3] x', f);\n",
    });
    stage(root, { 'src/a.ts': 'export const a = 2;\n', 'tests/other.test.ts': "it('y', f);\n" });
    const r = run(root);
    expect(r.code).toBe(0);
    expect(r.err).toContain('specflow: warning: this change touches criteria: BILLING-REFUNDS-3');
  });

  it('[SPECFLOW-CHECK-71] A Python import counts', () => {
    const root = repo({ tests: [{ runner: 'pytest', include: ['**/test_*.py'] }] });
    commit(root, {
      'backend/app/pay.py': 'x = 1\n',
      'backend/tests/test_a.py': 'from backend.app.pay import x\n\n@pytest.mark.criterion("BILLING-REFUNDS-3")\ndef test_a():\n    pass\n',
    });
    stage(root, { 'backend/app/pay.py': 'x = 2\n', 'backend/tests/test_b.py': 'def test_b():\n    pass\n' });
    expect(run(root).err).toContain('BILLING-REFUNDS-3');
  });

  it('[SPECFLOW-CHECK-90] more than 20 touched criteria are cut off', () => {
    const root = repo();
    const ids = Array.from({ length: 22 }, (_, i) => `BILLING-REFUNDS-${i + 10}: T${i}`);
    const cases = ids.map((c) => `it('[${c.split(':')[0]}] x', f);`).join('\n');
    commit(root, {
      [SPEC]: text(['Rule one.'], ids),
      'src/a.ts': 'x',
      'tests/b.test.ts': `import '../src/a';\n${cases}\n`,
    });
    stage(root, { 'src/a.ts': 'y', 'tests/c.test.ts': 'z' });
    expect(run(root).err).toContain('… and 2 more');
  });

  const constants = (v: number): string => `---\nconstants:\n  REFUND_DAYS: ${v}\n---\n`;

  it('[SPECFLOW-CHECK-72] A changed constant lists stale files', () => {
    const root = repo();
    commit(root, { 'specflow/impl/billing/constants.md': constants(14), 'src/a.ts': 'const d = 14;\n', 'src/b.ts': 'const d = 140;\n' });
    stage(root, { 'specflow/impl/billing/constants.md': constants(30) });
    const r = run(root);
    expect(r.code).toBe(0);
    expect(r.err).toContain('src/a.ts');
    expect(r.err).not.toContain('src/b.ts');
  });

  it('[SPECFLOW-CHECK-73] A very short old value is not searched', () => {
    const root = repo();
    commit(root, { 'specflow/impl/billing/constants.md': constants(3) });
    stage(root, { 'specflow/impl/billing/constants.md': constants(5) });
    const r = run(root);
    expect(r.code).toBe(0);
    expect(r.err).toContain('the old value `3` is too short to search');
  });
});

describe('specflow.check: adversarial review findings', () => {
  const edited2 = (base: string): string => base.replace('Rule two.', 'Rule two, reworded.');
  const code = { 'src/b.ts': 'x', 'tests/b.test.ts': 'y' };

  it('[SPECFLOW-CHECK-48] A js frontmatter runs nothing and the commit is still judged', () => {
    const root = repo();
    const planted = path.join(root, 'ran.txt');
    stage(root, { 'specflow/impl/billing/evil.spec.md': `---js\nrequire('fs').writeFileSync(${JSON.stringify(planted)}, 'x')\n---\n`, 'src/b.ts': 'x' });
    const r = run(root);
    expect(fs.existsSync(planted)).toBe(false);
    expect(r.code).toBe(1);
    expect(r.err).toContain('rule (a)');
  });

  it('[SPECFLOW-CHECK-49] A line that only starts with a fence token hides nothing', () => {
    const stray = BASE.replace('Why.', '```inline``` is why refunds exist.');
    const root = repo();
    commit(root, { [SPEC]: stray });
    stage(root, { [SPEC]: edited2(stray), ...code });
    expect(run(root).code).toBe(1);
  });

  it('[SPECFLOW-CHECK-50] A fence never closed hides nothing', () => {
    const stray = BASE.replace('Why.', '```\nopen and never closed');
    const root = repo();
    commit(root, { [SPEC]: stray });
    stage(root, { [SPEC]: edited2(stray), ...code });
    expect(run(root).code).toBe(1);
  });

  it('[SPECFLOW-CHECK-51] A real fence still hides what it holds', () => {
    const fenced = BASE.replace('Why.', '```\n## Rules\n\n1. Example.\n```');
    const root = repo();
    commit(root, { [SPEC]: fenced });
    stage(root, { [SPEC]: fenced.replace('1. Example.', '1. Other.') , ...code });
    expect(run(root).code).toBe(0);
  });

  for (const [name, form] of [
    ['CRLF line endings', (t: string) => t.replace(/\n/g, '\r\n')],
    ['1) numbering', (t: string) => t.replace(/^(\d)\. /gm, '$1) ')],
    ['indented numbers', (t: string) => t.replace(/^(\d)\. /gm, '  $1. ')],
    ['a closed heading', (t: string) => t.replace('## Rules', '## Rules ##')],
  ] as const) {
    it(`[SPECFLOW-CHECK-63] Rules are seen in every list form: ${name}`, () => {
      const root = repo();
      commit(root, { [SPEC]: form(BASE) }, `m\n\nSpecflow-Amends: billing.refunds#rule-1 — form\nSpecflow-Amends: billing.refunds#rule-2 — form\nSpecflow-Amends: billing.refunds#rule-3 — form\n`);
      stage(root, { [SPEC]: form(edited2(BASE)), ...code });
      const r = run(root);
      expect(r.code).toBe(1);
      expect(r.err).toContain('billing.refunds#rule-2');
    });
  }

  it('[SPECFLOW-CHECK-52] Two criteria with one id do not hide an edit', () => {
    const twin = text(['Rule one.'], ['BILLING-REFUNDS-3: First', 'BILLING-REFUNDS-3: Second']);
    const root = repo();
    commit(root, { [SPEC]: twin }, 'twin\n\nSpecflow-Amends: billing.refunds#retired — x\n');
    stage(root, { [SPEC]: twin.replace('First', 'Changed'), ...code });
    expect(run(root).code).toBe(1);
  });

  it('[SPECFLOW-CHECK-53] An added copy of a spec does not hide an edit to the original', () => {
    const root = repo();
    stage(root, { 'specflow/impl/billing/aaa.spec.md': BASE, [SPEC]: BASE.replace('BILLING-REFUNDS-4: Other', 'BILLING-REFUNDS-4: Edited'), ...code });
    const r = run(root);
    expect(r.code).toBe(1);
    expect(r.err).toContain('BILLING-REFUNDS-4');
  });

  it('[SPECFLOW-CHECK-54] A rule change is named once', () => {
    const root = repo();
    stage(root, { [SPEC]: edited2(BASE), ...code });
    const line = run(root).err.split('\n').find((l) => l.includes('rule (d)')) as string;
    expect(line.match(/#rule-2/g)).toHaveLength(1);
  });

  it('[SPECFLOW-CHECK-55] A trailer counts only in the last paragraph', () => {
    const edited = BASE.replace('BILLING-REFUNDS-3: Window', 'BILLING-REFUNDS-3: X');
    for (const message of [TRAILER, `subject\n\n${TRAILER}\nmore words\n\nAnd a closing paragraph.\n`]) {
      const root = repo();
      stage(root, { [SPEC]: edited });
      expect(run(root, message).code, message).toBe(1);
    }
  });

  it('[SPECFLOW-CHECK-56] A comment after the trailers and a scissors line do not hide them', () => {
    const root = repo();
    stage(root, { [SPEC]: BASE.replace('BILLING-REFUNDS-3: Window', 'BILLING-REFUNDS-3: X') });
    expect(run(root, `m\n\n${TRAILER}\n\n# Please enter the commit message\n# ------------------------ >8 ------------------------\ndiff\n`).code).toBe(0);
  });

  it('[SPECFLOW-CHECK-57] Every way of marking a case is read by rule (b)', () => {
    for (const line of ["it.skipIf(false)('adds up', f);", "it.runIf(true)('adds up', f);", "it.failing('adds up', f);", "xit('adds up', f);", "fit('adds up', f);"]) {
      const root = repo({ rules: { b: 'refuse' } });
      stage(root, { 'tests/a.test.ts': `${line}\n` });
      expect(run(root).code, line).toBe(1);
    }
  });

  it('[SPECFLOW-CHECK-58] Cases with one name are told apart', () => {
    const two = (c: string): string => `describe('a', () => { it('[BILLING-REFUNDS-3] works', () => { a(); }); });\ndescribe('b', () => { it('[BILLING-REFUNDS-3] works', () => { b(); }); });\n${c}`;
    const root = repo({ rules: { c: 'refuse' } });
    commit(root, { 'tests/a.test.ts': two('') });
    git(root, 'checkout', '-q', '-b', 'work');
    commit(root, { [SPEC]: BASE.replace('BILLING-REFUNDS-3: Window', 'BILLING-REFUNDS-3: X') }, `m\n\n${TRAILER}\n`);
    commit(root, { 'src/b.ts': 'x', 'tests/a.test.ts': two('// a comment\n') });
    expect(range(root).code).toBe(1);
  });

  it('[SPECFLOW-CHECK-59] A merge of unrelated histories is judged, not an error', () => {
    const root = repo();
    git(root, 'checkout', '-q', '--orphan', 'other');
    git(root, 'rm', '-rfq', '.');
    commit(root, { 'docs.md': 'x' });
    git(root, 'checkout', '-q', 'main');
    git(root, 'merge', '-q', '--no-commit', '--allow-unrelated-histories', 'other');
    expect(run(root, 'Merge').code).toBe(0);
  });

  it('[SPECFLOW-CHECK-60] A since not in this clone warns and judges the range', () => {
    const root = repo({ since: 'a'.repeat(40) });
    git(root, 'checkout', '-q', '-b', 'work');
    commit(root, { 'src/b.ts': 'x' }, 'code only');
    const r = range(root);
    expect(r.code).toBe(1);
    expect(r.err).toContain('specflow: warning: specflow.since');
  });

  it('[SPECFLOW-CHECK-61] Removing specflow/ with code is still judged', () => {
    const root = repo();
    git(root, 'rm', '-rq', 'specflow');
    stage(root, { 'src/b.ts': 'x' });
    expect(run(root).code).toBe(1);
  });

  it('[SPECFLOW-CHECK-62] Run from a subfolder, the check finds the repository', () => {
    const root = repo();
    stage(root, { 'src/b.ts': 'x' });
    const file = path.join(root, '.git', 'TEST_MSG');
    fs.writeFileSync(file, 'm');
    const err: string[] = [];
    expect(check(['--commit-msg', file], path.join(root, 'src'), { stderr: (l) => err.push(l) })).toBe(1);
  });
});

describe('specflow.check: hooks and config', () => {
  const MANAGED = '#!/bin/sh\n# cortex-managed: cortex hooks install rewrites this file\nexit 1\n';

  it('[SPECFLOW-CHECK-64] A hook change warns', () => {
    const root = repo();
    commit(root, { '.githooks/pre-commit': MANAGED });
    stage(root, { '.githooks/pre-commit': `${MANAGED}# more\n` });
    const r = run(root);
    expect(r.code).toBe(0);
    expect(r.err).toContain('specflow: warning: changes a git hook: .githooks/pre-commit');
  });

  it('[SPECFLOW-CHECK-65] A hook losing its managed line is refused', () => {
    const root = repo();
    commit(root, { '.githooks/commit-msg': MANAGED });
    stage(root, { '.githooks/commit-msg': '#!/bin/sh\nexit 0\n' });
    const r = run(root);
    expect(r.code).toBe(1);
    expect(r.err).toContain('- rule (h) hook-managed: removes the cortex-managed line from: .githooks/commit-msg.');
    const gone = repo();
    commit(gone, { '.githooks/commit-msg': MANAGED });
    git(gone, 'rm', '-q', '.githooks/commit-msg');
    expect(run(gone).code).toBe(1);
  });

  it('[SPECFLOW-CHECK-66] A hand-written hook may change', () => {
    const root = repo();
    commit(root, { '.githooks/pre-rebase': 'a' });
    stage(root, { '.githooks/pre-rebase': 'b' });
    const r = run(root);
    expect(r.code).toBe(0);
    expect(r.err).toContain('changes a git hook');
  });

  it('[SPECFLOW-CHECK-67] Range mode reads config from HEAD', () => {
    const root = repo();
    git(root, 'checkout', '-q', '-b', 'work');
    const sha = commit(root, { 'src/b.ts': 'x' }, 'code only');
    write(root, 'cortex/cortex.json', JSON.stringify({ schemaVersion: '4.0', specflow: { since: sha, tests: [{ runner: 'vitest', include: ['src/**'] }] } }));
    expect(range(root).code).toBe(1);
  });

  it('[SPECFLOW-CHECK-68] A bad config value is an internal error', () => {
    for (const bad of [{ since: 'HEAD' }, { rules: { b: 'refused' } }]) {
      const root = repo(bad);
      stage(root, { 'README.md': 'x' });
      const r = run(root);
      expect(r.code, JSON.stringify(bad)).toBe(2);
      expect(r.err).toContain('internal error');
    }
  });
});
