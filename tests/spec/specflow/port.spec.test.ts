/**
 * Spec tests — specflow.port: the move, ids, links, classes, the report and
 * `--verify`. Each test is named after its criterion, in real git repositories.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { cleanRepos, tmpRepo } from '../../fixtures/store.js';
import { reversible, specsPort } from '../../../src/specflow/port.js';
import { validate } from '../../../src/schema/validate.js';
import { validateStore } from '../../../src/store/validate.js';

afterEach(cleanRepos);

const DEV = '.specflow/specs/billing/refunds.spec.md';
const BIZ = '.specflow/specs-business/billing/refunds-are-fair.business.md';
const NEW_DEV = 'specflow/impl/billing/refunds.spec.md';
const NEW_BIZ = 'specflow/promises/billing/refunds-are-fair.business.md';
const OVERVIEW = '# Billing\n\nWhat this groups.\n';

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function write(root: string, file: string, body: string): void {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), body);
}
function read(root: string, file: string): string {
  return fs.readFileSync(path.join(root, file), 'utf-8');
}
function devSpec(id: string, headings: string[], opts: { level?: number; status?: string; extra?: string; link?: string } = {}): string {
  const h = '#'.repeat(opts.level ?? 2);
  const link = opts.link ?? '../../specs-business/billing/refunds-are-fair.business.md';
  const body = headings.map((t) => `${h}# ${t}\n\n- **Given** x\n- **Then** y\n`).join('\n');
  return `---\nid: ${id}\nstatus: ${opts.status ?? 'draft'}\nimplements: ${link}\n---\n\n# ${id}\n\n${opts.extra ?? ''}${h} Acceptance Criteria\n\n${body}`;
}
function bizSpec(id = 'billing.refunds-are-fair', status = 'draft', by = ['../../specs/billing/refunds.spec.md']): string {
  return `---\nid: ${id}\nstatus: ${status}\nimplemented_by:\n${by.map((b) => `  - ${b}`).join('\n')}\n---\n\n# Fair\n`;
}
function repo(files: Record<string, string>, opts: { store?: boolean; config?: unknown } = {}): string {
  const root = tmpRepo('port');
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 't@example.com');
  git(root, 'config', 'user.name', 'T');
  if (opts.store !== false) {
    write(root, 'cortex/cortex.json', JSON.stringify({ schemaVersion: '4.0', ...(opts.config ? { specflow: opts.config } : {}) }));
  }
  for (const [f, body] of Object.entries(files)) write(root, f, body);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  return root;
}
function twoTree(extra: Record<string, string> = {}, opts: { store?: boolean; config?: unknown } = {}): string {
  return repo({
    [DEV]: devSpec('billing.refunds', ['Refund is issued']),
    [BIZ]: bizSpec(),
    '.specflow/specs/billing/_overview.md': OVERVIEW,
    '.specflow/specs-business/billing/_overview.md': OVERVIEW,
    ...extra,
  }, opts);
}
function port(root: string, args: string[] = []): { code: number; out: string; err: string } {
  const out: string[] = [];
  const err: string[] = [];
  const code = specsPort(args, root, { stdout: (l) => out.push(l), stderr: (l) => err.push(l) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}
const report = (root: string): any => JSON.parse(read(root, '.cortex-port/report.json'));
const classOf = (root: string, id: string): any => report(root).specs.find((s: any) => s.id === id);
const nothingMoved = (root: string): void => {
  expect(git(root, 'status', '--porcelain')).toBe('');
  expect(fs.existsSync(path.join(root, '.cortex-port'))).toBe(false);
};

describe('specflow.port: the move', () => {
  it('A two-tree project moves', () => {
    const root = twoTree();
    const r = port(root);
    expect(r.code).toBe(0);
    for (const f of [NEW_DEV, NEW_BIZ, 'specflow/impl/billing/_overview.md', 'specflow/promises/billing/_overview.md']) {
      expect(fs.existsSync(path.join(root, f)), f).toBe(true);
    }
    expect(fs.existsSync(path.join(root, '.specflow'))).toBe(false);
    const status = git(root, 'status', '--porcelain');
    expect(status).toMatch(/^R/m);
    expect(git(root, 'rev-list', '--count', 'HEAD').trim()).toBe('1');
  });

  it('A bench-layout project moves', () => {
    const spec = devSpec('billing.refunds', ['BILLING-REFUNDS-1: A'], { link: '../../promises/billing/x.md' });
    const root = repo({ 'specs/impl/billing/refunds.spec.md': spec, 'specs/promises/billing/x.md': '# x\n', 'specs/INDEX.md': 'old' });
    expect(port(root).code).toBe(0);
    expect(read(root, NEW_DEV)).toBe(spec);
    expect(fs.existsSync(path.join(root, 'specflow/promises/billing/x.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'specs'))).toBe(false);
    expect(read(root, 'specflow/INDEX.md')).toContain('GENERATED');
  });

  it('Ids are written into headings at either level', () => {
    const root = twoTree({
      '.specflow/specs/billing/other.spec.md': devSpec('billing.other', ['Refund is issued'], { level: 3 }),
    });
    port(root);
    expect(read(root, NEW_DEV)).toContain('\n### BILLING-REFUNDS-1: Refund is issued\n');
    expect(read(root, 'specflow/impl/billing/other.spec.md')).toContain('\n#### BILLING-OTHER-1: Refund is issued\n');
  });

  it('Existing ids are kept and numbering continues', () => {
    const root = twoTree({ [DEV]: devSpec('billing.refunds', ['BILLING-REFUNDS-4: A', 'B']) });
    port(root);
    const text = read(root, NEW_DEV);
    expect(text).toContain('### BILLING-REFUNDS-4: A\n');
    expect(text).toContain('### BILLING-REFUNDS-5: B\n');
  });

  it('Frontmatter links still resolve', async () => {
    const root = twoTree();
    port(root);
    expect(read(root, NEW_DEV)).toContain('implements: ../../promises/billing/refunds-are-fair.business.md\n');
    expect(read(root, NEW_BIZ)).toContain('  - ../../impl/billing/refunds.spec.md\n');
    const { violations } = await validate(root);
    expect(violations.filter((v) => /check\.(dev-spec$|business-spec|xref)/.test(v.check) && v.severity === 'error')).toEqual([]);
  });

  it('Everything else is byte-identical', () => {
    const cite = 'See `.specflow/specs/billing/other.spec.md` for more.\n\n';
    const source = devSpec('billing.refunds', ['Refund is issued'], { extra: cite });
    const root = twoTree({ [DEV]: source });
    port(root);
    const moved = read(root, NEW_DEV);
    expect(moved).toContain(cite);
    const undone = moved
      .replace('BILLING-REFUNDS-1: ', '')
      .replace('../../promises/billing/refunds-are-fair.business.md', '../../specs-business/billing/refunds-are-fair.business.md');
    expect(undone).toBe(source);
  });

  it('a change beyond ids and links does not reverse (Rule 6)', () => {
    const edits = [{ line: 0, from: 'a', to: 'b' }];
    expect(reversible('a\nc', 'b\nc', edits)).toBe(true);
    expect(reversible('a\nc', 'b\nd', edits)).toBe(false);
  });
});

describe('specflow.port: retired', () => {
  it('A retired dev spec moves and stays as it was', () => {
    const source = devSpec('billing.old', ['Refund is issued'], { status: 'retired' });
    const root = twoTree({ '.specflow/specs/billing/old.spec.md': source });
    port(root);
    const moved = read(root, 'specflow/impl/billing/old.spec.md');
    expect(moved).toContain('\n### Refund is issued\n');
    expect(moved.replace('../../promises/', '../../specs-business/')).toBe(source);
    expect(classOf(root, 'billing.old').class).toBe('retired');
  });

  it('A retired business spec moves and keeps its name', () => {
    const source = bizSpec('billing.old', 'retired', ['../../specs/billing/refunds.spec.md']);
    const root = twoTree({ '.specflow/specs-business/billing/old.business.md': source });
    port(root);
    const moved = read(root, 'specflow/promises/billing/old.business.md');
    expect(moved.replace('../../impl/', '../../specs/')).toBe(source);
  });

  it('A retired spec outranks every other class', () => {
    const root = twoTree({ '.specflow/specs/billing/old.spec.md': devSpec('billing.old', [], { status: 'retired' }) });
    port(root);
    expect(classOf(root, 'billing.old').class).toBe('retired');
  });

  it('A live spec on a retired business spec is flagged', () => {
    const root = twoTree({
      [BIZ]: bizSpec('billing.refunds-are-fair', 'retired'),
      'tests/a.test.ts': "// billing.refunds\nit('x', f);\n",
    });
    port(root);
    const row = classOf(root, 'billing.refunds');
    expect(row.class).toBe('needs-edit');
    expect(row.reason).toContain(NEW_BIZ);
  });

  it("A tag proposal naming a retired spec's criterion fails verify", () => {
    const root = twoTree({
      '.specflow/specs/billing/old.spec.md': devSpec('billing.old', ['BILLING-OLD-1: A'], { status: 'retired' }),
      'tests/a.test.ts': "it('x', f);\n",
    });
    port(root);
    write(root, '.cortex-port/tagging/b.jsonl', `${JSON.stringify({ file: 'tests/a.test.ts', name: 'x', line: 1, action: 'tag', reason: 'r', criterion: 'BILLING-OLD-1' })}\n`);
    const r = port(root, ['--verify']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('b.jsonl:1');
  });
});

describe('specflow.port: refusals', () => {
  it('Both layouts present is refused', () => {
    const root = twoTree({ 'specs/impl/x/y.spec.md': 'x' });
    expect(port(root).code).toBe(1);
    nothingMoved(root);
  });

  it('No tree is refused', () => {
    const root = repo({ 'README.md': 'x' });
    expect(port(root).code).toBe(1);
    nothingMoved(root);
  });

  it('An existing target is refused', () => {
    const root = twoTree({ 'specflow/impl/x.md': 'x' });
    expect(port(root).code).toBe(1);
    nothingMoved(root);
  });

  it('An unaccepted migration is refused', () => {
    const root = twoTree({ '.cortex/cortex.config.json': '{}' }, { config: undefined });
    write(root, 'cortex/cortex.json', JSON.stringify({ schemaVersion: '4.0', migration: { from: '3.4', accepted: null } }));
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'x');
    const r = port(root);
    expect(r.code).toBe(1);
    expect(r.err).toContain('cortex migrate --accept');
    nothingMoved(root);
  });

  it('A 3.x project beside a bare store is refused', () => {
    for (const legacy of ['.cortex/cortex.config.json', '.cortex/compass/r.md']) {
      const root = twoTree({ [legacy]: '{}' }, { config: undefined });
      write(root, 'cortex/cortex.json', JSON.stringify({ schemaVersion: '4.0', visibility: { repo: 'private' } }));
      git(root, 'add', '-A');
      git(root, 'commit', '-q', '-m', 'x');
      const r = port(root);
      expect(r.code).toBe(1);
      expect(r.err).toContain('cortex migrate');
      nothingMoved(root);
    }
  });

  it('A migration with no accepted date is refused', () => {
    for (const migration of [{ from: '3.4' }, { from: '3.4', accepted: 'soon' }]) {
      const root = twoTree({}, { config: undefined });
      write(root, 'cortex/cortex.json', JSON.stringify({ schemaVersion: '4.0', migration }));
      git(root, 'add', '-A');
      git(root, 'commit', '-q', '-m', 'x');
      const r = port(root);
      expect(r.code).toBe(1);
      expect(r.err).toContain('cortex migrate --accept');
      nothingMoved(root);
    }
  });

  it('An unreadable store file is refused', () => {
    const root = twoTree({}, { config: undefined });
    write(root, 'cortex/cortex.json', '{nope');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'x');
    const r = port(root);
    expect(r.code).toBe(1);
    expect(r.err).toContain('cortex/cortex.json');
    nothingMoved(root);
  });

  it('A dirty source is refused', () => {
    const root = twoTree();
    write(root, DEV, 'edited');
    expect(port(root).code).toBe(1);
    expect(fs.existsSync(path.join(root, 'specflow'))).toBe(false);
  });

  it('No store is refused', () => {
    const root = twoTree({}, { store: false });
    expect(port(root).code).toBe(1);
    nothingMoved(root);
  });

  it('A dry run writes nothing', () => {
    const root = twoTree();
    const r = port(root, ['--dry-run']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('# Port report');
    nothingMoved(root);
  });
});

describe('specflow.port: test config', () => {
  it('Test config defaults are written', () => {
    const root = twoTree({ 'tests/a.test.ts': "it('x', f);\n", 'backend/tests/test_b.py': 'def test_b():\n    pass\n' });
    const r = port(root);
    const config = JSON.parse(read(root, 'cortex/cortex.json')).specflow;
    expect(config.tests.map((t: any) => t.runner)).toEqual(['vitest', 'pytest']);
    expect(config.rules).toEqual({ b: 'off', c: 'off' });
    expect(r.out).toContain('"runner": "vitest"');
    expect(r.out).toContain('"b": "off"');
  });

  it('Only runners with files are written', () => {
    const root = twoTree({ 'tests/a.test.ts': "it('x', f);\n" });
    port(root);
    expect(JSON.parse(read(root, 'cortex/cortex.json')).specflow.tests.map((t: any) => t.runner)).toEqual(['vitest']);
  });

  it('the store accepts the specflow key', () => {
    const root = twoTree({ 'tests/a.test.ts': "it('x', f);\n" });
    port(root);
    const r = validateStore(root, '2026-11-05');
    expect(r.findings.filter((f) => f.check === 'check.store-config')).toEqual([]);
  });

  it('An existing test config is kept', () => {
    const tests = [{ runner: 'vitest', include: ['t/**/*.ts'] }];
    const root = twoTree({}, { config: { tests } });
    port(root);
    expect(JSON.parse(read(root, 'cortex/cortex.json')).specflow).toEqual({ tests });
  });
});

describe('specflow.port: classes', () => {
  const noThen = '---\nid: billing.nothen\nstatus: draft\nimplements: ../../specs-business/billing/refunds-are-fair.business.md\n---\n\n## Acceptance Criteria\n\n### A\n\n- **Given** x\n';
  const stray = devSpec('billing.stray', ['A']).replace('## Acceptance Criteria\n', '## Acceptance Criteria\n\nStray text.\n');
  const cites = ['billing.nothen', 'billing.stray', 'billing.twice', 'billing.clean'].map((id) => `// ${id}`).join('\n');

  it('Each class is reported', () => {
    const root = twoTree({
      '.specflow/specs/billing/none.spec.md': devSpec('billing.none', []),
      '.specflow/specs/billing/uncited.spec.md': devSpec('billing.uncited', ['A']),
      '.specflow/specs/billing/nothen.spec.md': noThen,
      '.specflow/specs/billing/stray.spec.md': stray,
      '.specflow/specs/billing/twice.spec.md': devSpec('billing.twice', ['A', 'A']),
      '.specflow/specs/billing/clean.spec.md': devSpec('billing.clean', ['A']),
      'tests/a.test.ts': `${cites}\nit('x', f);\n`,
    });
    expect(port(root).code).toBe(0);
    const expected: Record<string, string> = {
      'billing.none': 'no-ACs',
      'billing.uncited': 'not-mappable',
      'billing.nothen': 'needs-edit',
      'billing.stray': 'needs-edit',
      'billing.twice': 'needs-edit',
      'billing.clean': 'clean',
    };
    for (const [id, c] of Object.entries(expected)) {
      expect(classOf(root, id).class, id).toBe(c);
      if (c !== 'clean') expect(classOf(root, id).reason, id).not.toBe('');
      expect(fs.existsSync(path.join(root, `specflow/impl/billing/${id.split('.')[1]}.spec.md`))).toBe(true);
    }
  });

  it('repeated titles are needs-edit even with ids already in the headings', () => {
    const root = twoTree({
      '.specflow/specs/billing/twice.spec.md': devSpec('billing.twice', ['BILLING-TWICE-1: A', 'BILLING-TWICE-2: A']),
      'tests/a.test.ts': '// billing.twice\n',
    });
    port(root);
    expect(classOf(root, 'billing.twice').class).toBe('needs-edit');
  });

  it('Precedence holds', () => {
    const root = twoTree({ '.specflow/specs/billing/none.spec.md': devSpec('billing.none', []) });
    port(root);
    expect(classOf(root, 'billing.none').class).toBe('no-ACs');
  });

  it('A ticket cited by one spec links it', () => {
    const root = twoTree({
      '.specflow/specs/billing/t.spec.md': devSpec('billing.t', ['A'], { extra: 'See TKT-7.\n\n' }),
      'tests/a.test.ts': "// TKT-7\nit('x', f);\n",
    });
    port(root, ['--ticket-pattern', 'TKT-[0-9]+']);
    expect(classOf(root, 'billing.t').class).toBe('clean');
  });

  it('A ticket shared by two specs does not link', () => {
    const root = twoTree({
      '.specflow/specs/billing/t.spec.md': devSpec('billing.t', ['A'], { extra: 'See TKT-7.\n\n' }),
      '.specflow/specs/billing/u.spec.md': devSpec('billing.u', ['A'], { extra: 'See TKT-7.\n\n' }),
      'tests/a.test.ts': "// TKT-7\nit('x', f);\n",
    });
    port(root, ['--ticket-pattern', 'TKT-[0-9]+']);
    expect(classOf(root, 'billing.t').class).toBe('needs-edit');
    expect(classOf(root, 'billing.u').class).toBe('needs-edit');
  });

  it('with no ticket pattern there are no tickets', () => {
    const root = twoTree({
      '.specflow/specs/billing/t.spec.md': devSpec('billing.t', ['A'], { extra: 'See TKT-7.\n\n' }),
      'tests/a.test.ts': "// TKT-7\nit('x', f);\n",
    });
    port(root);
    expect(classOf(root, 'billing.t').class).toBe('not-mappable');
  });

  it('a bad ticket pattern is a usage error', () => {
    const root = twoTree();
    expect(port(root, ['--ticket-pattern', '(']).code).toBe(2);
    nothingMoved(root);
  });
});

describe('specflow.port: report and next steps', () => {
  it('Untagged tests are listed', () => {
    const root = twoTree({ 'tests/a.test.ts': "it('a', f);\nit('b', f);\nit('c', f);\n" });
    port(root);
    expect(report(root).untagged).toHaveLength(3);
    expect(report(root).untagged[0]).toEqual({ file: 'tests/a.test.ts', name: 'a', line: 1 });
    expect(read(root, '.cortex-port/report.md')).toContain('- `tests/a.test.ts`: 3');
  });

  it('Names built at run time are counted', () => {
    const root = twoTree({ 'tests/a.test.ts': "it(`${x} pays`, f);\nit('a', f);\n" });
    port(root);
    expect(report(root).counts.dynamicNames).toBe(1);
    expect(report(root).counts.testCases).toBe(1);
    expect(read(root, '.cortex-port/report.md')).toContain('names built at run time: 1');
  });

  it('The working folder stays out of git', () => {
    const root = twoTree();
    port(root);
    expect(git(root, 'status', '--porcelain')).not.toContain('.cortex-port');
  });

  it('Next steps are printed and not run', () => {
    const root = twoTree();
    const r = port(root);
    expect(r.out).toContain('cortex store map');
    expect(r.out).toContain('cortex hooks install');
    expect(r.out.indexOf('cortex store map')).toBeLessThan(r.out.indexOf('cortex hooks install'));
    expect(fs.existsSync(path.join(root, 'cortex/MAP.md'))).toBe(false);
    expect(() => git(root, 'config', 'core.hooksPath')).toThrow();
  });
});

describe('specflow.port: --verify', () => {
  const line = (o: object): string => `${JSON.stringify(o)}\n`;
  function ported(): string {
    const root = twoTree({ [DEV]: devSpec('billing.refunds', ['BILLING-REFUNDS-1: A']), 'tests/a.test.ts': "it('a', f);\nit('b', f);\n" });
    port(root);
    return root;
  }
  const tagA = { file: 'tests/a.test.ts', name: 'a', line: 1, action: 'tag', reason: 'r', criterion: 'BILLING-REFUNDS-1' };
  const tagB = { file: 'tests/a.test.ts', name: 'b', line: 2, action: 'delete', reason: 'r' };

  it('Verify finds a case with no proposal', () => {
    const root = ported();
    write(root, '.cortex-port/tagging/billing.jsonl', line(tagA));
    const r = port(root, ['--verify']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('tests/a.test.ts › b');
  });

  it('Verify finds a tag proposal naming no criterion', () => {
    const root = ported();
    write(root, '.cortex-port/tagging/billing.jsonl', line({ ...tagA, criterion: 'BILLING-REFUNDS-99' }) + line(tagB));
    const r = port(root, ['--verify']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('BILLING-REFUNDS-99');
  });

  it('Verify passes on a full set', () => {
    const root = ported();
    write(root, '.cortex-port/tagging/billing.jsonl', line(tagA) + line(tagB));
    const before = git(root, 'status', '--porcelain');
    expect(port(root, ['--verify']).code).toBe(0);
    expect(git(root, 'status', '--porcelain')).toBe(before);
  });

  it('a malformed line is named', () => {
    const root = ported();
    write(root, '.cortex-port/tagging/billing.jsonl', `not json\n${line({ file: 'x' })}`);
    const r = port(root, ['--verify']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('billing.jsonl:1');
    expect(r.out).toContain('billing.jsonl:2');
  });
});
