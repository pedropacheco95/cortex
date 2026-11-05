/** Atomic tests for loops.learn-task Rule 5: `cortex store amendments`. */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseAmendsValue, storeAmendments } from '../../../src/store/amendments.js';
import { storeCli } from '../../../src/store/cli.js';
import { validateStore } from '../../../src/store/validate.js';
import { storeInit } from '../../../src/store/init.js';
import { cleanRepos, commitAll, git, gitInit, snapshot, tmpRepo } from '../../fixtures/store.js';

const TODAY = '2026-11-04';
const changes = (root: string): string => path.join(root, 'cortex', 'history', 'changes');

function repo(): string {
  const root = tmpRepo('amend');
  gitInit(root);
  storeInit(root);
  commitAll(root, 'init');
  return root;
}

function amend(root: string, trailer: string): void {
  git(root, ['commit', '-q', '--allow-empty', '-m', `change\n\nSpecflow-Amends: ${trailer}`]);
}

const run = async (root: string, ...args: string[]): Promise<{ code: number; out: string[] }> => {
  const out: string[] = [];
  const code = await storeCli(['amendments', ...args], root, { stdout: (l) => out.push(l), stderr: (l) => out.push(l) });
  return { code, out };
};

afterEach(cleanRepos);

describe('parseAmendsValue', () => {
  it('splits at the last # and takes any of the three separators', () => {
    expect(parseAmendsValue('core-cli.init#rule-7 — wording')).toEqual({ spec: 'core-cli.init', item: 'rule-7', reason: 'wording' });
    expect(parseAmendsValue('a#b#c -- x y')).toEqual({ spec: 'a#b', item: 'c', reason: 'x y' });
    expect(parseAmendsValue('a#b - why')).toEqual({ spec: 'a', item: 'b', reason: 'why' });
  });

  it('rejects a target with no item, or no reason', () => {
    expect(parseAmendsValue('core-cli.init wording')).toBeNull();
    expect(parseAmendsValue('core-cli.init — wording')).toBeNull();
    expect(parseAmendsValue('a#b —')).toBeNull();
  });
});

describe('Amendments are recorded once', () => {
  it('writes one file with two origins and two lines; a second run writes nothing', async () => {
    const root = repo();
    amend(root, 'core-cli.init#rule-7 — wording');
    amend(root, 'core-cli.init#CORE-CLI-INIT-3 -- renamed');
    expect((await run(root, '--apply', '--today', TODAY)).code).toBe(0);
    const file = path.join(changes(root), `${TODAY}-spec-amendments.md`);
    const text = fs.readFileSync(file, 'utf-8');
    expect(text).toContain('kind: spec-amendment');
    expect(text).toContain('status: recorded');
    expect(text.match(/commit:[0-9a-f]{40}/g)).toHaveLength(2);
    const body = text.split('\n').filter((l) => l.startsWith('- ') && !l.includes('commit:'));
    expect(body).toHaveLength(2);
    expect(body[0]).toMatch(/^- [0-9a-f]{7} \d{4}-\d{2}-\d{2} core-cli\.init#rule-7 — wording$/);
    expect(body[1]).toMatch(/core-cli\.init#CORE-CLI-INIT-3 — renamed$/);
    await run(root, '--apply', '--today', TODAY);
    expect(fs.readdirSync(changes(root)).filter((n) => n.includes('spec-amendments'))).toEqual([`${TODAY}-spec-amendments.md`]);
  });
});

describe('A later amendment gets a new file', () => {
  it('writes only the third, leaves the first byte-identical, and stays append-only', async () => {
    const root = repo();
    amend(root, 'a.b#rule-1 — one');
    amend(root, 'a.b#rule-2 — two');
    await run(root, '--apply', '--today', TODAY);
    commitAll(root, 'record');
    const first = path.join(changes(root), `${TODAY}-spec-amendments.md`);
    const bytes = fs.readFileSync(first, 'utf-8');
    amend(root, 'a.b#rule-3 — three');
    await run(root, '--apply', '--today', TODAY);
    const second = fs.readFileSync(path.join(changes(root), `${TODAY}-spec-amendments-2.md`), 'utf-8');
    expect(second).toContain('a.b#rule-3 — three');
    expect(second).not.toContain('a.b#rule-1');
    expect(fs.readFileSync(first, 'utf-8')).toBe(bytes);
    const findings = validateStore(root, TODAY).findings.filter((f) => f.path.includes('spec-amendments'));
    expect(findings.filter((f) => f.check === 'check.append-only')).toEqual([]);
    expect(findings.filter((f) => f.level === 'error')).toEqual([]);
  });
});

describe('A malformed trailer is reported, not written', () => {
  it('names the commit and writes no history file', async () => {
    const root = repo();
    amend(root, 'core-cli.init wording');
    const short = git(root, ['rev-parse', '--short=7', 'HEAD']).trim();
    const { out, code } = await run(root, '--apply', '--today', TODAY);
    expect(code).toBe(0);
    expect(out.join('\n')).toContain(`malformed: ${short}`);
    expect(storeAmendments(root, TODAY, false).unrecorded).toEqual([]);
    expect(fs.existsSync(path.join(changes(root), `${TODAY}-spec-amendments.md`))).toBe(false);
  });
});

describe('Without --apply nothing changes', () => {
  it('lists them and writes nothing', async () => {
    const root = repo();
    amend(root, 'a.b#rule-1 — one');
    const before = snapshot(path.join(root, 'cortex'));
    const { out } = await run(root, '--today', TODAY);
    expect(out.join('\n')).toContain('a.b#rule-1 — one');
    expect(snapshot(path.join(root, 'cortex'))).toEqual(before);
  });
});

describe('Outside a git repository', () => {
  it('prints the line and exits 0', async () => {
    const root = tmpRepo('nogit');
    const { out, code } = await run(root);
    expect(code).toBe(0);
    expect(out).toEqual(['not a git repository']);
  });
});
