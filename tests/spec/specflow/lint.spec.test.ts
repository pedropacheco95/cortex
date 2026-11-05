/**
 * Spec tests — specflow.lint: one test per criterion, named after it, in temp
 * repositories with a clean baseline tree each test then breaks.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { cleanRepos, tmpRepo } from '../../fixtures/store.js';
import { specsLint } from '../../../src/specflow/lint.js';
import { validate } from '../../../src/schema/validate.js';
import { isPorted, specsRoot } from '../../../src/paths.js';

afterEach(cleanRepos);

const OVERVIEW = "# x\n\n## What this is\n\nx\n\n## What it covers\n\nx\n\n## Why it's grouped this way\n\nx\n";
const LINK = '../../promises/billing/fair.business.md';

function write(root: string, file: string, body: string): void {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), body);
}
function read(root: string, file: string): string {
  return fs.readFileSync(path.join(root, file), 'utf-8');
}
function spec(id: string, opts: { then?: string[]; status?: string; front?: string; rules?: string; criteria?: string; intent?: string } = {}): string {
  const prefix = id.toUpperCase().replace(/[^A-Z0-9]+/g, '-');
  const crit = opts.criteria ?? (opts.then ?? ['**Then** ok']).map((t, i) => `### ${prefix}-${i + 1}: C${i}\n\n- ${t}\n`).join('\n');
  const front = opts.front ?? `implements: ${LINK}\n`;
  return `---\nid: ${id}\nstatus: ${opts.status ?? 'draft'}\n${front}---\n\n# ${id}\n\n## Intent\n\n${opts.intent ?? 'Why.'}\n\n## Entities\n\n- none\n\n${opts.rules ?? '## Rules\n\n1. A rule.\n'}\n## Acceptance Criteria\n\n${crit}`;
}
function clean(extraSpecs: string[] = []): string {
  const root = tmpRepo('lint');
  const git = (...a: string[]) => execFileSync('git', a, { cwd: root, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('config', 'core.hooksPath', '.githooks');
  write(root, 'cortex/cortex.json', JSON.stringify({ schemaVersion: '4.0', specflow: { tests: [{ runner: 'vitest', include: ['tests/**/*.test.ts'] }] } }));
  write(root, 'tests/a.test.ts', "it('[BILLING-REFUNDS-1] x', f);\n");
  write(root, 'specflow/impl/billing/_overview.md', OVERVIEW);
  write(root, 'specflow/promises/billing/_overview.md', OVERVIEW);
  write(root, 'specflow/impl/billing/refunds.spec.md', spec('billing.refunds'));
  const by = ['refunds', ...extraSpecs].map((s) => `  - ../../impl/billing/${s}.spec.md\n`).join('');
  write(root, 'specflow/promises/billing/fair.business.md', `---\nid: billing.fair\nstatus: draft\nimplemented_by:\n${by}---\n\n# Fair\n`);
  return root;
}
async function lint(root: string, args: string[] = []): Promise<{ code: number; lines: string[]; out: string; err: string }> {
  const lines: string[] = [];
  const err: string[] = [];
  const code = await specsLint(args, root, { stdout: (l) => lines.push(l), stderr: (l) => err.push(l) });
  return { code, lines, out: lines.join('\n'), err: err.join('\n') };
}
const hits = (r: { lines: string[] }, check: string): string[] => r.lines.filter((l) => l.split(' ')[1] === check);
function constants(root: string, dir: string, body: string): void {
  write(root, `${dir}/constants.md`, `---\nconstants:\n${body}---\n\n# Constants\n`);
}
/** The tree with `billing.other` added and linked, so nothing else fires. */
function withOther(body: string): string {
  const root = clean(['other']);
  write(root, 'specflow/impl/billing/other.spec.md', body);
  return root;
}

describe('specflow.lint: the command', () => {
  it('A clean tree exits 0', async () => {
    const r = await lint(clean());
    expect(r.lines).toEqual([]);
    expect(r.code).toBe(0);
  });

  it('Warnings alone exit 0', async () => {
    const root = clean();
    constants(root, 'specflow/impl/billing', '  UNUSED: 1\n');
    const r = await lint(root);
    expect(r.code).toBe(0);
    expect(r.out).toContain('warning lint.constant-unused specflow/impl/billing/constants.md:');
  });

  it('An error exits 1', async () => {
    const root = withOther(spec('billing.other', { criteria: '### BILLING-REFUNDS-1: C\n\n- **Then** ok\n' }));
    const r = await lint(root);
    expect(r.code).toBe(1);
    const line = hits(r, 'lint.criterion-id').find((l) => l.includes('is used in'));
    expect(line).toContain('refunds.spec.md');
    expect(line).toContain('other.spec.md');
  });

  it('No folder exits 1', async () => {
    const r = await lint(tmpRepo('none'));
    expect(r.code).toBe(1);
    expect(r.err).toBe('specflow: no specflow/ folder here');
  });

  it('a bad flag is a usage error', async () => {
    expect((await lint(clean(), ['--nope'])).code).toBe(2);
  });

  it('JSON has the stated shape', async () => {
    const root = clean();
    constants(root, 'specflow/impl/billing', '  UNUSED: 1\n');
    write(root, 'tests/a.test.ts', "it('[BILLING-REFUNDS-1] x', f);\nit('[BILLING-REFUNDS-99] y', f);\n");
    const j = JSON.parse((await lint(root, ['--json'])).out);
    expect(j.counts).toEqual({ error: 1, warning: 1 });
    expect(Object.keys(j.findings[0]).sort()).toEqual(['check', 'level', 'message', 'path']);
  });
});

describe('specflow.lint: carried checks', () => {
  it('Carried checks run on the new tree', async () => {
    const root = clean();
    fs.rmSync(path.join(root, 'specflow/impl/billing/_overview.md'));
    write(root, 'specflow/impl/billing/refunds.spec.md', spec('billing.wrong').replace(/BILLING-WRONG/g, 'BILLING-REFUNDS'));
    const r = await lint(root);
    expect(hits(r, 'check.overview-present').length).toBeGreaterThan(0);
    expect(hits(r, 'check.id-matches-path').length).toBeGreaterThan(0);
  });

  it('Validate follows the tree', async () => {
    const root = clean();
    fs.rmSync(path.join(root, 'specflow/impl/billing/_overview.md'));
    const { violations } = await validate(root);
    expect(violations.some((v) => v.check === 'check.overview-present')).toBe(true);
    expect(violations.some((v) => v.check === 'check.specs-index')).toBe(false);
  });

  it('a governed_by id kept as a store alias resolves', async () => {
    const root = clean();
    write(root, 'specflow/impl/billing/refunds.spec.md', spec('billing.refunds', { front: `implements: ${LINK}\ngoverned_by:\n  - R-001\n  - R-999\n` }));
    write(root, 'cortex/world/rules/a.md', '---\nabout: x\naliases:\n  - R-001\n---\n\nx\n');
    const found = hits(await lint(root), 'check.dev-spec').join('\n');
    expect(found).toContain('R-999');
    expect(found).not.toContain('R-001');
  });

  it('A stray empty folder does not hide the old tree', async () => {
    const root = tmpRepo('stray');
    write(root, '.specflow/specs/billing/refunds.spec.md', 'not valid');
    fs.mkdirSync(path.join(root, 'specflow'));
    expect(isPorted(root)).toBe(false);
    expect(specsRoot(root)).toBe(path.join(root, '.specflow', 'specs'));
    write(root, 'specflow/INDEX.md', 'x');
    expect(isPorted(root)).toBe(true);
  });

  it('Serves replaces implements', async () => {
    const root = clean();
    write(root, 'specflow/promises/billing/p.md', '---\nid: P-BILLING-1\ntitle: T\nstatus: draft\n---\n\n## Outcome\n\nx\n');
    write(root, 'specflow/impl/billing/refunds.spec.md', spec('billing.refunds', { front: 'serves: [P-BILLING-1]\n' }));
    expect(hits(await lint(root), 'check.dev-spec')).toEqual([]);
  });

  it('A serves naming nothing is an error', async () => {
    const root = clean();
    write(root, 'specflow/impl/billing/refunds.spec.md', spec('billing.refunds', { front: 'serves: [P-BILLING-99]\n' }));
    const r = await lint(root);
    expect(r.code).toBe(1);
    expect(r.out).toContain('P-BILLING-99');
  });
});

describe('specflow.lint: tree checks', () => {
  it('Layout breaks are found', async () => {
    const root = clean();
    write(root, 'specflow/impl/spec.md', spec('x.y'));
    expect(hits(await lint(root), 'lint.layout').join()).toContain('specflow/impl/spec.md');
  });

  it('a spec outside an area and a leaf in its own folder are layout breaks', async () => {
    const root = clean();
    write(root, 'specflow/impl/top.spec.md', spec('top'));
    write(root, 'specflow/impl/billing/lonely/lonely.spec.md', spec('billing.lonely.lonely'));
    const found = hits(await lint(root), 'lint.layout').join('\n');
    expect(found).toContain('specflow/impl/top.spec.md');
    expect(found).toContain('lonely.spec.md');
  });

  it('Missing sections are found on both layouts', async () => {
    const root = withOther(spec('billing.other', { rules: '' }));
    write(root, 'specflow/impl/billing/refunds.spec.md', spec('billing.refunds', { intent: '' }).replace('## Intent', '### Intent'));
    const found = hits(await lint(root), 'lint.body').join('\n');
    expect(found).toContain('other.spec.md: no Rules section');
    expect(found).toContain('refunds.spec.md: empty Intent section');
  });

  it('a Rules section with no numbered item is found', async () => {
    const root = clean();
    write(root, 'specflow/impl/billing/refunds.spec.md', spec('billing.refunds', { rules: '## Rules\n\nProse.\n' }));
    expect(hits(await lint(root), 'lint.body').join()).toContain('no numbered item');
  });

  it('A field table is found', async () => {
    const root = clean();
    write(root, 'specflow/impl/billing/refunds.spec.md', spec('billing.refunds', { intent: '| Field | Type |\n|---|---|\n| a | b |' }));
    expect(hits(await lint(root), 'lint.entity-table')).toHaveLength(1);
  });

  it('A criterion with no Then is found', async () => {
    const root = clean();
    write(root, 'specflow/impl/billing/refunds.spec.md', spec('billing.refunds', { then: ['**Given** x\n- **When** y'] }));
    expect(hits(await lint(root), 'lint.criterion-then').join()).toContain('BILLING-REFUNDS-1');
  });

  it('A heading missing its id is an error beside ids', async () => {
    const root = clean();
    write(root, 'specflow/impl/billing/refunds.spec.md', spec('billing.refunds', { criteria: '### BILLING-REFUNDS-1: A\n\n- **Then** ok\n\n### B\n\n- **Then** ok\n' }));
    const r = await lint(root);
    expect(r.code).toBe(1);
    expect(hits(r, 'lint.criterion-id')[0]).toMatch(/^error /);
  });

  it('A spec with no ids at all only warns', async () => {
    const root = clean();
    write(root, 'specflow/impl/billing/refunds.spec.md', spec('billing.refunds', { criteria: '### B\n\n- **Then** ok\n' }));
    write(root, 'tests/a.test.ts', "it('x', f);\n");
    const r = await lint(root);
    expect(hits(r, 'lint.criterion-id')[0]).toMatch(/^warning /);
    expect(r.code).toBe(0);
  });

  it('an id with another prefix beside the rule prefix is an error', async () => {
    const root = clean();
    write(root, 'specflow/impl/billing/refunds.spec.md', spec('billing.refunds', { criteria: '### BILLING-REFUNDS-1: A\n\n- **Then** ok\n\n### PAY-2: B\n\n- **Then** ok\n' }));
    expect(hits(await lint(root), 'lint.criterion-id').join()).toContain('PAY-2');
  });

  it('Orphans are found', async () => {
    const root = clean(['other']);
    write(root, 'specflow/impl/billing/other.spec.md', spec('billing.other', { front: '' }));
    write(root, 'specflow/promises/billing/p.md', '---\nid: P-BILLING-1\ntitle: T\nstatus: draft\n---\n\n## Outcome\n\nx\n');
    const found = hits(await lint(root), 'lint.orphan').join('\n');
    expect(found).toContain('other.spec.md');
    expect(found).toContain('promises/billing/p.md');
  });

  it('A long promise is found', async () => {
    const root = clean();
    const body = Array.from({ length: 41 }, (_, i) => `line ${i}`).join('\n');
    write(root, 'specflow/promises/billing/p.md', `---\nid: P-BILLING-1\ntitle: T\nstatus: draft\n---\n\n${body}\n`);
    expect(hits(await lint(root), 'lint.promise-size')).toHaveLength(1);
  });

  it('Missing test config is an error', async () => {
    const root = clean();
    write(root, 'cortex/cortex.json', '{"schemaVersion":"4.0"}');
    const r = await lint(root);
    expect(r.code).toBe(1);
    expect(hits(r, 'lint.tests-config').length).toBeGreaterThan(0);
  });

  it('an unknown runner is an error and an empty include warns', async () => {
    const root = clean();
    write(root, 'cortex/cortex.json', JSON.stringify({ specflow: { tests: [{ runner: 'mocha', include: ['nothing/**'] }] } }));
    const found = hits(await lint(root), 'lint.tests-config').join('\n');
    expect(found).toContain('error lint.tests-config cortex/cortex.json: unknown runner mocha');
    expect(found).toContain('warning lint.tests-config cortex/cortex.json: include nothing/** matches no file');
  });

  const rules = (root: string): void => write(root, 'cortex/cortex.json', JSON.stringify({ specflow: { rules: { b: 'refuse' }, tests: [{ runner: 'vitest', include: ['tests/**/*.test.ts'] }] } }));

  it('Rules on early is an error', async () => {
    const root = clean();
    rules(root);
    write(root, 'tests/a.test.ts', "it('[BILLING-REFUNDS-1] x', f);\nit('untagged', f);\n");
    const r = await lint(root);
    expect(r.code).toBe(1);
    expect(hits(r, 'lint.rules-early')).toHaveLength(1);
  });

  it('Rules on with no untagged test passes', async () => {
    const root = clean();
    rules(root);
    expect(hits(await lint(root), 'lint.rules-early')).toEqual([]);
  });

  it('An orphan tag is an error', async () => {
    const root = clean();
    write(root, 'tests/a.test.ts', "it('[BILLING-REFUNDS-99] x', f);\n");
    const r = await lint(root);
    expect(r.code).toBe(1);
    expect(hits(r, 'lint.orphan-tag')).toHaveLength(1);
  });

  it('Hooks not installed warns', async () => {
    const root = clean();
    execFileSync('git', ['config', '--unset', 'core.hooksPath'], { cwd: root });
    expect(hits(await lint(root), 'lint.hooks-installed')[0]).toMatch(/^warning /);
  });
});

describe('specflow.lint: constants', () => {
  it('An unresolved constant is an error', async () => {
    const root = clean();
    write(root, 'specflow/impl/billing/refunds.spec.md', spec('billing.refunds', { then: ['**Then** const:NOPE'] }));
    const r = await lint(root);
    expect(r.code).toBe(1);
    expect(hits(r, 'lint.constant-unresolved')).toHaveLength(1);
  });

  function sibling(): string {
    const root = clean();
    write(root, 'specflow/impl/shipping/_overview.md', OVERVIEW);
    write(root, 'specflow/impl/shipping/x.spec.md', spec('shipping.x', { then: ['**Then** const:REFUND_DAYS'] }));
    constants(root, 'specflow/impl/billing', '  REFUND_DAYS: 30\n');
    return root;
  }

  it('a const: in a code span is a mention, not a use', async () => {
    const root = clean();
    write(root, 'specflow/impl/billing/refunds.spec.md', spec('billing.refunds', { then: ['**Then** `const:NOPE` is shown'] }));
    expect(hits(await lint(root), 'lint.constant-unresolved')).toEqual([]);
  });

  it("A sibling's constant says to move it", async () => {
    const found = hits(await lint(sibling()), 'lint.constant-unresolved').join();
    expect(found).toContain('specflow/impl/billing/constants.md');
    expect(found).toContain('move it up');
  });

  it('Fix moves a constant up', async () => {
    const root = sibling();
    const r = await lint(root, ['--fix']);
    expect(read(root, 'specflow/impl/constants.md')).toContain('REFUND_DAYS: 30');
    expect(read(root, 'specflow/impl/billing/constants.md')).not.toContain('REFUND_DAYS');
    expect(hits(r, 'lint.constant-unresolved')).toEqual([]);
  });

  it('A shadowed name is an error', async () => {
    const root = clean();
    constants(root, 'specflow', '  REFUND_DAYS: 30\n');
    constants(root, 'specflow/impl/billing', '  REFUND_DAYS: 14\n');
    const r = await lint(root);
    expect(r.code).toBe(1);
    expect(hits(r, 'lint.constant-shadow')).toHaveLength(1);
  });

  it('A constant placed too high warns', async () => {
    const root = clean();
    constants(root, 'specflow', '  REFUND_DAYS: 30\n');
    write(root, 'specflow/impl/billing/refunds.spec.md', spec('billing.refunds', { then: ['**Then** const:REFUND_DAYS'] }));
    expect(hits(await lint(root), 'lint.constant-placement').join()).toContain('specflow/impl/billing/');
  });

  it('fix moves a constant placed too high down', async () => {
    const root = clean();
    constants(root, 'specflow', '  REFUND_DAYS: 30\n');
    write(root, 'specflow/impl/billing/refunds.spec.md', spec('billing.refunds', { then: ['**Then** const:REFUND_DAYS'] }));
    await lint(root, ['--fix']);
    expect(read(root, 'specflow/impl/billing/constants.md')).toContain('REFUND_DAYS: 30');
  });
});

describe('specflow.lint: literals', () => {
  const two = (then: string): string => {
    const root = withOther(spec('billing.other', { then: [then] }));
    write(root, 'specflow/impl/billing/refunds.spec.md', spec('billing.refunds', { then: [then] }));
    return root;
  };

  it('A repeated literal is found', async () => {
    const found = hits(await lint(two('**Then** it lasts 30 days')), 'lint.literal').join();
    expect(found).toContain('30 days');
    expect(found).toContain('refunds.spec.md');
    expect(found).toContain('other.spec.md');
  });

  it('A quoted string repeated is found', async () => {
    expect(hits(await lint(two('**Then** it prints "Refund refused"')), 'lint.literal').join()).toContain('Refund refused');
  });

  it('One spec repeating a literal is not found', async () => {
    const root = clean();
    write(root, 'specflow/impl/billing/refunds.spec.md', spec('billing.refunds', { then: ['**Then** 30 days', '**Then** 30 days'] }));
    expect(hits(await lint(root), 'lint.literal')).toEqual([]);
  });

  it('A code span is not a literal', async () => {
    expect(hits(await lint(two('**Then** `cortex validate` takes "`30 days`"')), 'lint.literal')).toEqual([]);
  });

  it('A short quoted string is not a literal', async () => {
    expect(hits(await lint(two('**Then** it prints "error"')), 'lint.literal')).toEqual([]);
  });

  it('Literals outside Then are not read', async () => {
    expect(hits(await lint(two('**Given** 30 days\n- **When** x\n- **Then** ok')), 'lint.literal')).toEqual([]);
  });

  it('The ignore list works', async () => {
    const root = two('**Then** it lasts 30 days');
    write(root, 'cortex/cortex.json', JSON.stringify({ specflow: { literals: { ignore: ['30 days'] }, tests: [{ runner: 'vitest', include: ['tests/**/*.test.ts'] }] } }));
    expect(hits(await lint(root), 'lint.literal')).toEqual([]);
  });
});

describe('specflow.lint: --fix', () => {
  it('Fix adds a stub overview, a reverse link and a missing id', async () => {
    const root = clean();
    write(root, 'specflow/impl/shipping/x.spec.md', spec('shipping.x', { front: `implements: ../../promises/billing/fair.business.md\n` }));
    write(root, 'specflow/impl/billing/refunds.spec.md', spec('billing.refunds', { criteria: '### BILLING-REFUNDS-4: A\n\n- **Then** ok\n\n### B\n\n- **Then** ok\n' }));
    await lint(root, ['--fix']);
    expect(read(root, 'specflow/impl/shipping/_overview.md')).toContain('TODO');
    expect(read(root, 'specflow/promises/billing/fair.business.md')).toContain('../../impl/shipping/x.spec.md');
    expect(read(root, 'specflow/impl/billing/refunds.spec.md')).toContain('### BILLING-REFUNDS-5: B');
  });

  it('Fix turns a one-item list into a scalar', async () => {
    const root = clean();
    write(root, 'specflow/impl/billing/refunds.spec.md', spec('billing.refunds', { front: `implements:\n  - ${LINK}\n` }));
    await lint(root, ['--fix']);
    expect(read(root, 'specflow/impl/billing/refunds.spec.md')).toContain(`\nimplements: ${LINK}\n`);
  });

  it('Fix never touches meaning', async () => {
    const root = clean();
    const broken = spec('billing.refunds', {
      front: 'implements: ../../promises/billing/gone.business.md\n',
      rules: '## Rules\n\n1. One.\n3. Three.\n',
      then: ['**Given** x'],
    });
    write(root, 'specflow/impl/billing/refunds.spec.md', broken);
    const r = await lint(root, ['--fix']);
    expect(read(root, 'specflow/impl/billing/refunds.spec.md')).toBe(broken);
    expect(hits(r, 'check.dev-spec').length).toBeGreaterThan(0);
    expect(hits(r, 'lint.criterion-then').length).toBeGreaterThan(0);
  });
});

describe('specflow.lint: retired', () => {
  it('A retired spec is not judged', async () => {
    const root = clean();
    write(root, 'specflow/impl/billing/old.spec.md', spec('billing.old', {
      status: 'retired',
      front: 'implements: ../../promises/billing/gone.business.md\n',
      criteria: '### No id\n\n- **Given** const:GONE\n',
    }));
    const r = await lint(root);
    expect(r.lines.filter((l) => l.includes('old.spec.md'))).toEqual([]);
  });

  it("A retired spec's id stays taken", async () => {
    const root = clean();
    write(root, 'specflow/impl/billing/old.spec.md', spec('billing.old', { status: 'retired', criteria: '### BILLING-REFUNDS-1: A\n\n- **Then** ok\n' }));
    const r = await lint(root);
    expect(r.code).toBe(1);
    expect(hits(r, 'lint.criterion-id').join()).toContain('is used in');
  });

  it('A live link to a retired spec warns', async () => {
    const root = clean(['old', 'dep', 'srv']);
    write(root, 'specflow/impl/billing/old.spec.md', spec('billing.old', { status: 'retired' }));
    write(root, 'specflow/promises/billing/p.md', '---\nid: P-BILLING-1\ntitle: T\nstatus: retired\n---\n\n## Outcome\n\nx\n');
    write(root, 'specflow/impl/billing/dep.spec.md', spec('billing.dep', { front: `implements: ${LINK}\ndepends_on:\n  - billing.old\n` }));
    write(root, 'specflow/impl/billing/srv.spec.md', spec('billing.srv', { front: 'serves: [P-BILLING-1]\n' }));
    const r = await lint(root);
    const found = hits(r, 'lint.retired-link').join('\n');
    expect(found).toContain('dep.spec.md');
    expect(found).toContain('srv.spec.md');
    expect(found.split('\n').every((l) => l.startsWith('warning '))).toBe(true);
    expect(r.lines.filter((l) => l.startsWith('error'))).toEqual([]);
    expect(r.code).toBe(0);
  });

  it('Retired specs do not satisfy a promise', async () => {
    const root = clean();
    write(root, 'specflow/promises/billing/p.md', '---\nid: P-BILLING-1\ntitle: T\nstatus: draft\n---\n\n## Outcome\n\nx\n');
    write(root, 'specflow/impl/billing/old.spec.md', spec('billing.old', { status: 'retired', front: 'serves: [P-BILLING-1]\n' }));
    expect(hits(await lint(root), 'lint.orphan').join()).toContain('promises/billing/p.md');
  });
});
