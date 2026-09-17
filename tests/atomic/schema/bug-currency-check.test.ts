/**
 * Atomic tests — `check.bug` learns `owner`, `fix_in_flight` and
 * `found_at_commit`, shape only (`compass.bug-currency` Rules 1–3; schema
 * §4.2 3.4 fifth revision; plan Task 2.2). Drives `checkBugs` directly
 * against a tmp `.cortex/compass/bugs/` tree. Separate from
 * validator.test.ts by ownership (wave A edits that file).
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';
import { buildIndex } from '../../../src/schema/index-build.js';
import { checkBugs } from '../../../src/schema/checks/compass.js';
import type { Violation } from '../../../src/schema/types.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`bug-currency-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

/** A bug file valid under check.bug's pre-3.4 rules, plus `extraLines` in its frontmatter. */
function writeBug(root: string, id: string, slug: string, extraLines: string[]): string {
  const dir = path.join(root, '.cortex', 'compass', 'bugs');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.ts'), '', 'utf-8');
  const file = path.join(dir, `${id}-${slug}.md`);
  fs.writeFileSync(
    file,
    ['---', `id: ${id}`, `title: ${slug}`, 'type: wrong-rule', 'severity: high', 'status: open', 'affects:', '  - src/a.ts', ...extraLines, '---', '', `# ${id} — ${slug}`, ''].join('\n'),
    'utf-8',
  );
  return file;
}

async function bugViolations(root: string): Promise<Violation[]> {
  const index = await buildIndex(root);
  return checkBugs(root, index).filter((v) => v.check === 'check.bug');
}

describe('The three fields validate by shape only', () => {
  it('owner, fix_in_flight and a 7-hex found_at_commit raise no check.bug violation', async () => {
    const root = tmp('shape-ok');
    writeBug(root, 'B-020', 'x', ['owner: pedro', 'fix_in_flight: feature/registry', 'found_at_commit: 2b217df']);
    expect(await bugViolations(root)).toEqual([]);
  });

  it('a 40-hex found_at_commit, a PR URL fix_in_flight and a multi-word owner are all accepted', async () => {
    const root = tmp('shape-wide');
    writeBug(root, 'B-021', 'y', [
      'owner: "the platform team"',
      'fix_in_flight: https://github.com/org/repo/pull/12',
      'found_at_commit: 2b217dfa9c3e4f5061728394a5b6c7d8e9f01234',
    ]);
    expect(await bugViolations(root)).toEqual([]);
  });

  it('a non-string owner and a non-string fix_in_flight are one error each, naming the key, clause §4.2', async () => {
    const root = tmp('shape-bad-strings');
    writeBug(root, 'B-022', 'z', ['owner:', '  - pedro', 'fix_in_flight: 42']);
    const v = await bugViolations(root);
    expect(v).toHaveLength(2);
    const owner = v.find((x) => x.location.key === 'owner');
    const fix = v.find((x) => x.location.key === 'fix_in_flight');
    expect(owner?.severity).toBe('error');
    expect(owner?.clause).toBe('§4.2');
    expect(owner?.message).toMatch(/owner/);
    expect(fix?.severity).toBe('error');
    expect(fix?.clause).toBe('§4.2');
    expect(fix?.message).toMatch(/fix_in_flight/);
  });
});

describe('A malformed stamp is an error; a bare status is not', () => {
  it('found_at_commit with a non-hex character is one check.bug error naming found_at_commit', async () => {
    const root = tmp('bad-stamp');
    writeBug(root, 'B-021', 'y', ['found_at_commit: 2b217dfz']);
    const v = await bugViolations(root);
    expect(v).toHaveLength(1);
    expect(v[0]?.severity).toBe('error');
    expect(v[0]?.clause).toBe('§4.2');
    expect(v[0]?.location.key).toBe('found_at_commit');
    expect(v[0]?.message).toContain('found_at_commit');
  });

  it('a stamp shorter than 7, longer than 40, uppercase, or a number is an error', async () => {
    const root = tmp('bad-stamp-shapes');
    writeBug(root, 'B-030', 'short', ['found_at_commit: 2b217d']);
    writeBug(root, 'B-031', 'long', [`found_at_commit: ${'a'.repeat(41)}`]);
    writeBug(root, 'B-032', 'upper', ['found_at_commit: 2B217DF']);
    writeBug(root, 'B-033', 'number', ['found_at_commit: 1234567']); // YAML parses this as a number
    const v = await bugViolations(root);
    expect(v.map((x) => path.basename(x.location.path)).sort()).toEqual(['B-030-short.md', 'B-031-long.md', 'B-032-upper.md', 'B-033-number.md']);
    for (const x of v) expect(x.location.key).toBe('found_at_commit');
  });

  it('status: triaged with neither owner nor fix_in_flight is not a violation', async () => {
    const root = tmp('bare-triaged');
    const dir = path.join(root, '.cortex', 'compass', 'bugs');
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'a.ts'), '', 'utf-8');
    fs.writeFileSync(
      path.join(dir, 'B-022-z.md'),
      ['---', 'id: B-022', 'title: z', 'type: wrong-rule', 'severity: high', 'status: triaged', 'affects:', '  - src/a.ts', '---', '', '# B-022 — z', ''].join('\n'),
      'utf-8',
    );
    expect(await bugViolations(root)).toEqual([]);
  });

  it('absent fields are never a finding (a pre-3.4 bug file stays clean)', async () => {
    const root = tmp('absent');
    writeBug(root, 'B-001', 'old', []);
    expect(await bugViolations(root)).toEqual([]);
  });
});
