/**
 * Spec tests — specflow.index: the model and `cortex specs index`. One test per
 * criterion, named after it, in temp repositories.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { cleanRepos, tmpRepo } from '../../fixtures/store.js';
import { specsIndex } from '../../../src/specflow/index.js';
import { buildModel, resolveConstant } from '../../../src/specflow/model/model.js';
import { modelJson } from '../../../src/specflow/model/render.js';
import { workTree } from '../../../src/specflow/model/tree.js';

afterEach(cleanRepos);

const VITEST = { runner: 'vitest', include: ['tests/**/*.test.ts'], exclude: [] };
const PYTEST = { runner: 'pytest', include: ['**/test_*.py'], exclude: [] };

function write(root: string, file: string, text: string): void {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
}

function repo(tests: unknown[] | null = [VITEST]): string {
  const root = tmpRepo('index');
  fs.mkdirSync(path.join(root, 'specflow'), { recursive: true });
  const specflow = tests ? { specflow: { tests } } : {};
  write(root, 'cortex/cortex.json', JSON.stringify({ schemaVersion: '4.0', ...specflow }));
  return root;
}

function spec(id: string, criteria: string[], extra = '', level = 2): string {
  const h = '#'.repeat(level);
  const body = criteria.map((c) => `${h}# ${c}\n\n- **Then** ok\n`).join('\n');
  return `---\nid: ${id}\nstatus: draft\n${extra}---\n\n# ${id}\n\n${h} Acceptance Criteria\n\n${body}`;
}

const REFUNDS = 'specflow/impl/billing/refunds.spec.md';
const TWO = spec('billing.refunds', ['BILLING-REFUNDS-1: A', 'BILLING-REFUNDS-2: B']);

function json(root: string): any {
  return modelJson(buildModel(workTree(root)));
}
function model(root: string) {
  return buildModel(workTree(root));
}
function run(root: string, args: string[] = []): { code: number; out: string[]; err: string[]; index: string } {
  const out: string[] = [];
  const err: string[] = [];
  const code = specsIndex(args, root, { stdout: (l) => out.push(l), stderr: (l) => err.push(l) });
  const p = path.join(root, 'specflow/INDEX.md');
  return { code, out, err, index: fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '' };
}
function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf-8' });
}
function gitRepo(root: string): void {
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 't@example.com');
  git(root, 'config', 'user.name', 'T');
}
function cases(root: string, body: string): ReturnType<typeof model> {
  write(root, 'tests/a.test.ts', body);
  return model(root);
}
const crit = (m: ReturnType<typeof model>, id: string) =>
  m.specs.flatMap((s) => s.criteria).find((c) => c.id === id);

describe('specflow.index: criteria', () => {
  it('Criteria are found under a level-2 section', () => {
    const root = repo();
    write(root, REFUNDS, TWO);
    expect(run(root, ['--json']).code).toBe(0);
    const c = json(root).specs[0].criteria;
    expect(c.map((x: any) => [x.id, x.title])).toEqual([['BILLING-REFUNDS-1', 'A'], ['BILLING-REFUNDS-2', 'B']]);
  });

  it('Criteria are found under a level-3 section', () => {
    const root = repo();
    write(root, REFUNDS, spec('billing.refunds', ['BILLING-REFUNDS-1: A', 'BILLING-REFUNDS-2: B'], '', 3) + '\n### Notes\n\n#### Not a criterion\n');
    expect(json(root).specs[0].criteria.map((x: any) => x.id)).toEqual(['BILLING-REFUNDS-1', 'BILLING-REFUNDS-2']);
  });

  it('A deeper heading stays inside its criterion', () => {
    const root = repo();
    write(root, REFUNDS, spec('billing.refunds', ['BILLING-REFUNDS-1: A\n\n#### Deeper']));
    const m = model(root);
    expect(m.specs[0]?.criteria).toHaveLength(1);
    expect(m.specs[0]?.criteria[0]?.text).toContain('#### Deeper');
  });

  it('Headings of the right level outside the section are not criteria', () => {
    const root = repo();
    write(root, REFUNDS, '---\nid: billing.refunds\nstatus: draft\n---\n\n## Rules\n\n### Mobile\n\n## Acceptance Criteria\n\n### BILLING-REFUNDS-1: A\n');
    expect(json(root).specs[0].criteria.map((x: any) => x.title)).toEqual(['A']);
  });

  it('A heading with no id is listed, not numbered', () => {
    const root = repo();
    write(root, REFUNDS, spec('billing.refunds', ['A']));
    const r = run(root);
    expect(r.index).toMatch(/## Specs without criterion ids\n\n- \*\*billing\.refunds\*\*/);
    expect(r.index).toContain('criteria: 0');
  });

  it('Adding a criterion in the middle moves no id', () => {
    const root = repo();
    write(root, REFUNDS, TWO);
    write(root, 'tests/a.test.ts', "it('[BILLING-REFUNDS-2] x', () => {});\n");
    write(root, REFUNDS, spec('billing.refunds', ['BILLING-REFUNDS-1: A', 'BILLING-REFUNDS-3: C', 'BILLING-REFUNDS-2: B']));
    const c = crit(model(root), 'BILLING-REFUNDS-2');
    expect(c?.title).toBe('B');
    expect(c?.tests.map((t) => t.name)).toEqual(['[BILLING-REFUNDS-2] x']);
  });
});

describe('specflow.index: tags', () => {
  function base(): string {
    const root = repo();
    write(root, REFUNDS, TWO);
    return root;
  }

  it('A test name tag is read', () => {
    const c = crit(cases(base(), "it('[BILLING-REFUNDS-1] adds up', () => {});\n"), 'BILLING-REFUNDS-1');
    expect(c?.tests).toHaveLength(1);
    expect(c?.unverified).toBe(false);
  });

  it('Two tags on one test are read', () => {
    const m = cases(base(), "it('[BILLING-REFUNDS-1, BILLING-REFUNDS-2] x', () => {});\n");
    expect(crit(m, 'BILLING-REFUNDS-1')?.tests).toHaveLength(1);
    expect(crit(m, 'BILLING-REFUNDS-2')?.tests).toHaveLength(1);
  });

  it('A template with a static tag is a tagged case', () => {
    const c = crit(cases(base(), 'for (const x of xs) {\n  it(`[BILLING-REFUNDS-1] pays ${x}`, () => {});\n}\n'), 'BILLING-REFUNDS-1');
    expect(c?.tests).toHaveLength(1);
    expect(c?.unverified).toBe(false);
  });

  it('An each name with a static tag is a tagged case', () => {
    const m = cases(base(), "it.each([1, 2])('[BILLING-REFUNDS-1] pays %s', (n) => {});\ntest.each`a\n${1}`('[BILLING-REFUNDS-2] t', () => {});\n");
    expect(crit(m, 'BILLING-REFUNDS-1')?.tests).toHaveLength(1);
    expect(crit(m, 'BILLING-REFUNDS-2')?.tests).toHaveLength(1);
  });

  it('A name built at run time with no static tag is only counted', () => {
    const m = cases(base(), "it(`${x} pays`, f);\nit.each([[1, ')']])('pays %s', f);\nit(name, f);\n");
    expect(m.untagged).toEqual([]);
    expect(m.dynamicNames).toBe(3);
  });

  it('A tag not at the start is no tag', () => {
    expect(cases(base(), "it('adds up [BILLING-REFUNDS-1]', () => {});\n").untagged).toHaveLength(1);
  });

  it('A describe tag is not read', () => {
    const m = cases(base(), "describe('[BILLING-REFUNDS-1] group', () => { it('x', () => {}); });\n");
    expect(m.untagged.map((t) => t.name)).toEqual(['x']);
  });

  it('A commented-out test is no case', () => {
    const m = cases(base(), "// it('[BILLING-REFUNDS-1] x', () => {});\n/* it('y', () => {}); */\nconst s = \"it('z', f)\";\n");
    expect(m.untagged).toEqual([]);
    expect(crit(m, 'BILLING-REFUNDS-1')?.tests).toEqual([]);
  });

  it('every listed modifier is a case; a regex.test call and a variable name are not', () => {
    const m = cases(base(), [
      "it.only('a', f);", "test.concurrent('b', f);", "it.sequential('c', f);", "test.fails('d', f);",
      "const r = /x(/.test('e');", "it(name, f);", '',
    ].join('\n'));
    expect(m.untagged.map((t) => t.name)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('A pytest marker is read', () => {
    const root = repo([PYTEST]);
    write(root, REFUNDS, TWO);
    write(root, 'backend/test_a.py', '@pytest.mark.criterion("BILLING-REFUNDS-1")\ndef test_x():\n    pass\n');
    write(root, 'backend/test_b.py', 'class TestB:\n    @pytest.mark.criterion("BILLING-REFUNDS-1", "BILLING-REFUNDS-2")\n    async def test_y(self):\n        pass\n');
    const m = model(root);
    expect(crit(m, 'BILLING-REFUNDS-1')?.tests.map((t) => t.name)).toEqual(['test_x', 'test_y']);
    expect(crit(m, 'BILLING-REFUNDS-2')?.tests.map((t) => t.name)).toEqual(['test_y']);
  });

  it('A marker with other decorators between is read', () => {
    const root = repo([PYTEST]);
    write(root, REFUNDS, TWO);
    write(root, 'test_a.py', '@pytest.mark.criterion("BILLING-REFUNDS-1")\n@pytest.mark.slow\ndef test_x():\n    pass\n');
    expect(crit(model(root), 'BILLING-REFUNDS-1')?.tests).toHaveLength(1);
  });

  it('A docstring tag is not a pytest tag', () => {
    const root = repo([PYTEST]);
    write(root, REFUNDS, TWO);
    write(root, 'test_a.py', 'def test_x():\n    """[BILLING-REFUNDS-1] x"""\n');
    expect(model(root).untagged.map((t) => t.name)).toEqual(['test_x']);
  });

  it('a function nested in a test is no case, and a def in a docstring is no case', () => {
    const root = repo([PYTEST]);
    write(root, 'test_a.py', 'def test_x():\n    def test_inner():\n        pass\n\n"""\ndef test_doc():\n"""\n');
    expect(model(root).untagged.map((t) => t.name)).toEqual(['test_x']);
  });
});

describe('specflow.index: unverified and skipped', () => {
  function base(): string {
    const root = repo();
    write(root, REFUNDS, TWO);
    return root;
  }

  it('A criterion with no test is unverified', () => {
    const root = base();
    expect(run(root).index).toContain('**BILLING-REFUNDS-1** A · unverified\n');
    expect(json(root).specs[0].criteria[0].unverified).toBe(true);
  });

  it('A criterion with only a skipped test is unverified', () => {
    const root = base();
    write(root, 'tests/a.test.ts', "it.skip('[BILLING-REFUNDS-1] x', () => {});\n");
    expect(crit(model(root), 'BILLING-REFUNDS-1')?.unverified).toBe(true);
    expect(run(root).index).toContain('› [BILLING-REFUNDS-1] x (skipped)\n');
  });

  it('A case inside a skipped describe is skipped', () => {
    const m = cases(base(), "describe.skip('g', () => { it('[BILLING-REFUNDS-1] x', () => {}); });\nit('[BILLING-REFUNDS-2] y', () => {});\n");
    expect(crit(m, 'BILLING-REFUNDS-1')?.tests[0]?.skipped).toBe(true);
    expect(crit(m, 'BILLING-REFUNDS-2')?.tests[0]?.skipped).toBe(false);
  });

  it('a pytest skip decorator skips the case', () => {
    const root = repo([PYTEST]);
    write(root, REFUNDS, TWO);
    write(root, 'test_a.py', '@pytest.mark.skipif(True, reason="x")\n@pytest.mark.criterion("BILLING-REFUNDS-1")\ndef test_x():\n    pass\n');
    expect(crit(model(root), 'BILLING-REFUNDS-1')?.unverified).toBe(true);
  });

  it('A hand-written mark is ignored', () => {
    const root = repo();
    write(root, REFUNDS, spec('billing.refunds', ['BILLING-REFUNDS-1: A (unverified)']));
    const c = crit(cases(root, "it('[BILLING-REFUNDS-1] x', () => {});\n"), 'BILLING-REFUNDS-1');
    expect(c?.title).toBe('A (unverified)');
    expect(c?.unverified).toBe(false);
  });

  it('Untagged tests are counted', () => {
    const root = base();
    write(root, 'tests/a.test.ts', "it('[BILLING-REFUNDS-1] x', f);\nit('b', f);\nit('c', f);\n");
    expect(run(root).index).toContain('Untagged tests: 2\n');
    expect(json(root).untagged).toEqual([
      { file: 'tests/a.test.ts', name: 'b', line: 2 },
      { file: 'tests/a.test.ts', name: 'c', line: 3 },
    ]);
  });

  it('An orphan tag is listed', () => {
    const root = base();
    write(root, 'tests/a.test.ts', "it('[BILLING-REFUNDS-99] x', f);\n");
    expect(run(root).index).toMatch(/## Tags naming no criterion\n\n- \*\*BILLING-REFUNDS-99\*\*/);
  });
});

describe('specflow.index: constants and promises', () => {
  it('Constants are listed', () => {
    const root = repo();
    write(root, 'specflow/impl/billing/constants.md', '---\nconstants:\n  REFUND_DAYS: 30\n---\n');
    expect(run(root).index).toContain('- `REFUND_DAYS` = `30` · `specflow/impl/billing/constants.md`');
  });

  it('A constant resolves from an ancestor and not from a sibling', () => {
    const root = repo();
    write(root, 'specflow/constants.md', '---\nconstants:\n  A: 1\n---\n');
    write(root, 'specflow/impl/billing/constants.md', '---\nconstants:\n  B: 2\n---\n');
    const m = model(root);
    expect(resolveConstant(m, 'A', 'specflow/impl/shipping/x.spec.md')?.value).toBe('1');
    expect(resolveConstant(m, 'B', 'specflow/impl/shipping/x.spec.md')).toBeNull();
  });

  it('A spec is grouped under its promise', () => {
    const root = repo();
    write(root, 'specflow/promises/billing/fair.md', '---\nid: P-BILLING-1\ntitle: Fair refunds\nstatus: draft\n---\n');
    write(root, REFUNDS, spec('billing.refunds', [], 'serves: [P-BILLING-1]\n'));
    expect(run(root).index).toMatch(/### P-BILLING-1: Fair refunds\n\n`specflow\/promises\/billing\/fair\.md`\n\n- spec \*\*billing\.refunds\*\*/);
  });

  it('An unconverted spec is grouped under its business spec', () => {
    const root = repo();
    write(root, 'specflow/promises/billing/x.business.md', '---\nid: billing.x\nstatus: draft\n---\n\n# X\n');
    write(root, REFUNDS, spec('billing.refunds', [], 'implements: ../../promises/billing/x.business.md\n'));
    expect(run(root).index).toMatch(/### specflow\/promises\/billing\/x\.business\.md\n\n- spec \*\*billing\.refunds\*\*/);
  });

  it('a spec with neither link is under Specs without a promise', () => {
    const root = repo();
    write(root, REFUNDS, spec('billing.refunds', []));
    expect(run(root).index).toMatch(/## Specs without a promise\n\n- spec \*\*billing\.refunds\*\*/);
  });
});

describe('specflow.index: retired', () => {
  it('A retired spec is listed and counts nowhere else', () => {
    const root = repo();
    write(root, REFUNDS, spec('billing.refunds', ['BILLING-REFUNDS-1: A']));
    write(root, 'specflow/impl/billing/old.spec.md', spec('billing.old', ['BILLING-OLD-1: A', 'BILLING-OLD-2: B']).replace('status: draft', 'status: retired'));
    write(root, 'specflow/impl/billing/older.spec.md', spec('billing.older', ['No id']).replace('status: draft', 'status: retired'));
    const { index } = run(root);
    expect(index).toContain('specs: 1 · criteria: 1');
    const tail = index.slice(index.indexOf('## Retired'));
    expect(tail).toContain('billing.old');
    expect(tail).toContain('billing.older');
    expect(index.slice(0, index.indexOf('## Retired'))).not.toContain('billing.old');
    expect(json(root).retired.map((r: any) => r.id)).toEqual(['billing.old', 'billing.older']);
  });

  it('A retired promise is listed and its spec loses its home', () => {
    const root = repo();
    write(root, 'specflow/promises/billing/fair.md', '---\nid: P-BILLING-1\ntitle: Fair\nstatus: retired\n---\n');
    write(root, REFUNDS, spec('billing.refunds', [], 'serves: [P-BILLING-1]\n'));
    const { index } = run(root);
    expect(index).toContain('Promises: 0');
    expect(index.slice(index.indexOf('## Retired'))).toContain('P-BILLING-1');
    expect(index).toMatch(/## Specs without a promise\n\n- spec \*\*billing\.refunds\*\*/);
  });

  it('A tag on a retired criterion is an orphan', () => {
    const root = repo();
    write(root, 'specflow/impl/billing/old.spec.md', spec('billing.old', ['BILLING-OLD-1: A']).replace('status: draft', 'status: retired'));
    write(root, 'tests/a.test.ts', "it('[BILLING-OLD-1] x', f);\n");
    expect(run(root).index).toMatch(/## Tags naming no criterion\n\n- \*\*BILLING-OLD-1\*\*/);
  });
});

describe('specflow.index: output', () => {
  it('The same tree gives the same bytes', () => {
    const root = repo();
    write(root, REFUNDS, TWO);
    const first = run(root).index;
    expect(run(root).index).toBe(first);
    expect(first).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(first.split('\n')[2]).toContain('GENERATED');
  });

  it('Numbers sort as numbers', () => {
    const root = repo();
    write(root, REFUNDS, spec('billing.refunds', ['BILLING-REFUNDS-10: T', 'BILLING-REFUNDS-2: W']));
    const { index } = run(root);
    expect(index.indexOf('BILLING-REFUNDS-2')).toBeLessThan(index.indexOf('BILLING-REFUNDS-10'));
  });

  it('Staged mode reads the git index', () => {
    const root = repo();
    gitRepo(root);
    write(root, REFUNDS, spec('billing.refunds', ['BILLING-REFUNDS-1: A']));
    git(root, 'add', '.');
    write(root, REFUNDS, spec('billing.refunds', ['BILLING-REFUNDS-1: A', 'BILLING-REFUNDS-2: B']));
    expect(run(root, ['--staged']).code).toBe(0);
    const staged = git(root, 'show', ':specflow/INDEX.md');
    expect(staged).toContain('BILLING-REFUNDS-1');
    expect(staged).not.toContain('BILLING-REFUNDS-2');
  });

  it('Staged mode leaves an unchanged file alone', () => {
    const root = repo();
    gitRepo(root);
    write(root, REFUNDS, TWO);
    run(root);
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'x');
    fs.rmSync(path.join(root, 'specflow/INDEX.md'));
    const before = git(root, 'status', '--porcelain');
    run(root, ['--staged']);
    expect(git(root, 'status', '--porcelain')).toBe(before);
  });

  it('A missing folder is an error', () => {
    const root = tmpRepo('none');
    const r = run(root);
    expect(r.code).toBe(1);
    expect(r.err).toEqual(['specflow: no specflow/ folder here']);
  });

  it('No test config warns', () => {
    const root = repo(null);
    write(root, 'tests/a.test.ts', "it('x', f);\n");
    const r = run(root);
    expect(r.code).toBe(0);
    expect(r.index).toContain('Untagged tests: 0\n');
    expect(r.err).toEqual(['specflow: warning: specflow.tests is not set; no tests were read']);
  });

  it('--json writes nothing and prints the model', () => {
    const root = repo();
    write(root, REFUNDS, TWO);
    const r = run(root, ['--json']);
    expect(r.index).toBe('');
    expect(JSON.parse(r.out.join('\n')).counts).toEqual({ promises: 0, specs: 1, criteria: 2, tagged: 0, unverified: 2, untagged: 0 });
  });
});
