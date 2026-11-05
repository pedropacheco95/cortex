/**
 * Spec tests — specflow.viewer: one test per criterion, named after it, in
 * temp repositories. The criteria read the page data, not pixels.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { cleanRepos, tmpRepo } from '../../fixtures/store.js';
import { specsIndex } from '../../../src/specflow/index.js';
import { specsView } from '../../../src/specflow/view/index.js';

afterEach(cleanRepos);

const OVERVIEW = '# Billing\n\nMoney in and out of the shop. More text follows.\n\n## What it covers\n\nx\n';
const outDirs: string[] = [];
afterEach(() => {
  for (const d of outDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function write(root: string, file: string, body: string): void {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), body);
}
function spec(id: string, criteria: string[], opts: { status?: string; front?: string } = {}): string {
  const prefix = id.toUpperCase().replace(/[^A-Z0-9]+/g, '-');
  const crit = criteria.map((t, i) => `### ${prefix}-${i + 1}: ${t}\n\n- **Given** a thing\n- **When** it runs\n- **Then** ok\n`).join('\n');
  return `---\nid: ${id}\nstatus: ${opts.status ?? 'draft'}\n${opts.front ?? 'serves: [P-BILLING-1]\n'}---\n\n# ${id}\n\n## Intent\n\nWhy.\n\n## Entities\n\n- **READS:** \`billing/\`, the ledger\n- **WRITES:** one file\n\n## Rules\n\n1. A rule.\n\n## Acceptance Criteria\n\n${crit}`;
}

/** A ported tree: 2 specs, 3 criteria, 1 tagged, 1 promise, 1 constant, 1 untagged test. */
function ported(): string {
  const root = tmpRepo('view');
  const git = (...a: string[]) => execFileSync('git', a, { cwd: root, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  write(root, 'cortex/cortex.json', JSON.stringify({ schemaVersion: '4.0', specflow: { tests: [{ runner: 'vitest', include: ['tests/**/*.test.ts'] }] } }));
  write(root, 'tests/a.test.ts', "it('[BILLING-REFUNDS-1] refunds a payment', f);\nit('plain test', f);\n");
  write(root, 'specflow/impl/billing/_overview.md', OVERVIEW);
  write(root, 'specflow/promises/billing/_overview.md', OVERVIEW);
  write(root, 'specflow/impl/billing/refunds.spec.md', spec('billing.refunds', ['Refund runs', 'Refund is checked']));
  write(root, 'specflow/impl/billing/invoices.spec.md', spec('billing.invoices', ['Invoice runs'], { front: 'depends_on:\n  - billing.refunds\nserves: [P-BILLING-1]\n' }));
  write(root, 'specflow/promises/billing/fair.md', '---\nid: P-BILLING-1\ntitle: Refunds are fair\nstatus: approved\n---\n\n# Refunds are fair\n\nA customer gets money back.\n');
  write(root, 'specflow/impl/billing/constants.md', '---\nconstants:\n  FEE_PERCENT: 3\n---\n\n# Constants\n');
  return root;
}

interface Run {
  code: number;
  out: string;
  err: string;
}
function view(root: string, args: string[] = []): Run {
  const out: string[] = [];
  const err: string[] = [];
  const code = specsView(args, root, { stdout: (l) => out.push(l), stderr: (l) => err.push(l) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

interface PageSpec {
  id: string;
  status: string;
  path: string;
  broken: boolean;
  warnings: string[];
  implements: string[];
  implemented_by: string[];
  acceptance_criteria: { id: string; unverified?: boolean; tests: { file: string; name: string }[] }[];
}
interface PageData {
  counts: Record<string, number>;
  constants: unknown[];
  untagged: unknown[];
  warnings: { spec_id: string; message: string }[];
  trees: { business: { specs: PageSpec[] }; dev: { specs: PageSpec[] } };
}
/** The JSON on the `const SPEC_DATA = ...;` line. */
function pageData(html: string): PageData {
  const line = html.split('\n').find((l) => l.startsWith('const SPEC_DATA = '));
  expect(line).toBeDefined();
  return JSON.parse((line as string).slice('const SPEC_DATA = '.length).replace(/;$/, '')) as PageData;
}
const page = (root: string, file = 'specs.html'): string => fs.readFileSync(path.join(root, file), 'utf-8');
const specOf = (data: PageData, id: string): PageSpec => data.trees.dev.specs.find((s) => s.id === id) as PageSpec;

describe('specflow.viewer: the command', () => {
  it('One file is written', () => {
    const root = ported();
    const r = view(root);
    expect(r.code).toBe(0);
    expect(fs.existsSync(path.join(root, 'specs.html'))).toBe(true);
    expect(r.out).toContain('specs.html');
    expect(r.out).toContain('2 specs');
    expect(r.out).toContain('3 criteria');
    expect(r.out).toContain('2 unverified');
  });

  it('The output path can be chosen', () => {
    const root = ported();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'view-out-'));
    outDirs.push(dir);
    const target = path.join(dir, 'x', 'site.html');
    const r = view(root, ['--out', target, '--title', 'Demo']);
    expect(r.code).toBe(0);
    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readFileSync(target, 'utf-8')).toMatch(/<title>Demo[^<]*<\/title>/);
    expect(fs.existsSync(path.join(root, 'specs.html'))).toBe(false);
  });

  it('No folder exits 1', () => {
    const root = tmpRepo('view-empty');
    const r = view(root);
    expect(r.code).toBe(1);
    expect(r.err).toContain('specflow: no specflow/ folder here');
  });

  it('A bad flag is a usage error', () => {
    const root = ported();
    expect(view(root, ['--nope']).code).toBe(2);
    expect(view(root, ['--out']).code).toBe(2);
    expect(fs.existsSync(path.join(root, 'specs.html'))).toBe(false);
  });

  it('Nothing loads from the network', () => {
    const root = ported();
    view(root);
    const html = page(root);
    expect(html).not.toContain('http://');
    expect(html).not.toContain('https://');
    expect(html).not.toMatch(/(src|href)\s*=\s*["']?\/\/fonts/);
    expect(html).not.toMatch(/@import/);
  });

  it('It runs with no Python', () => {
    const root = ported();
    const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'view-bin-'));
    outDirs.push(bin);
    const git = execFileSync('which', ['git'], { encoding: 'utf-8' }).trim();
    fs.symlinkSync(git, path.join(bin, 'git'));
    const saved = process.env['PATH'];
    process.env['PATH'] = bin;
    try {
      expect(spawnSync('python3', ['-V']).error).toBeDefined();
      expect(view(root).code).toBe(0);
    } finally {
      process.env['PATH'] = saved;
    }
  });

  it('Criteria carry their id and mark', () => {
    const root = ported();
    view(root);
    const refunds = specOf(pageData(page(root)), 'billing.refunds');
    const [first, second] = refunds.acceptance_criteria;
    expect(first?.id).toBe('BILLING-REFUNDS-1');
    expect(first?.tests.map((t) => t.name)).toEqual(['[BILLING-REFUNDS-1] refunds a payment']);
    expect(first?.unverified).toBe(false);
    expect(second?.id).toBe('BILLING-REFUNDS-2');
    expect(second?.unverified).toBe(true);
  });

  it('The dashboard counts match the index', () => {
    const root = ported();
    view(root);
    const data = pageData(page(root));
    const lines: string[] = [];
    specsIndex(['--json'], root, { stdout: (l) => lines.push(l) });
    const index = JSON.parse(lines.join('\n')) as { counts: Record<string, number>; constants: unknown[]; untagged: unknown[] };
    for (const key of ['tagged', 'unverified', 'untagged']) expect(data.counts[key]).toBe(index.counts[key]);
    expect(data.counts['untagged']).toBe(1);
    expect(data.untagged.length).toBe(index.untagged.length);
    expect(data.constants.length).toBe(index.constants.length);
    expect(data.constants.length).toBe(1);
  });

  it('Promises and specs link both ways', () => {
    const root = ported();
    view(root);
    const data = pageData(page(root));
    expect(specOf(data, 'billing.refunds').implements).toEqual(['P-BILLING-1']);
    const promise = data.trees.business.specs.find((s) => s.id === 'P-BILLING-1') as PageSpec;
    expect(promise.implemented_by).toEqual(['billing.invoices', 'billing.refunds']);
  });

  it('A retired spec shows its status', () => {
    const root = ported();
    write(root, 'specflow/impl/billing/old.spec.md', spec('billing.old', ['Old thing'], { status: 'retired', front: '' }));
    view(root);
    expect(specOf(pageData(page(root)), 'billing.old').status).toBe('retired');
  });

  it('The same tree gives the same bytes', () => {
    const root = ported();
    view(root);
    const first = page(root);
    view(root);
    expect(page(root)).toBe(first);
  });

  it('A broken file does not stop the build', () => {
    const root = ported();
    write(root, 'specflow/impl/billing/broken.spec.md', '---\nid: [\nstatus: draft\n---\n\n# Broken\n\n## Intent\n\nx\n');
    const r = view(root);
    expect(r.code).toBe(0);
    expect(r.err).toContain('specflow/impl/billing/broken.spec.md');
    const broken = pageData(page(root)).trees.dev.specs.find((s) => s.path === 'specflow/impl/billing/broken.spec.md') as PageSpec;
    expect(broken.broken).toBe(true);
    expect(broken.warnings.join('\n')).toContain('frontmatter does not parse');
  });

  it('The output stays out of git', () => {
    const root = ported();
    view(root);
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf-8' });
    expect(fs.existsSync(path.join(root, 'specs.html'))).toBe(true);
    expect(status).not.toContain('specs.html');
    expect(status).toContain('specflow/');
  });
});
