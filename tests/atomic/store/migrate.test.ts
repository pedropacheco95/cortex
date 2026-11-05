/**
 * Atomic tests — `store.migrate` (schema Part II S9.3), one per acceptance
 * criterion.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { migrateCli } from '../../../src/store/migrate/cli.js';
import { readLegacyStore } from '../../../src/store/migrate/entries.js';
import { parseFile } from '../../../src/store/frontmatter.js';
import { validateStore } from '../../../src/store/validate.js';
import { tmpRepo, cleanRepos, gitInit, commitAll, git, snapshot } from '../../fixtures/store.js';
import { writeLegacyStore, writeLegacyExtras } from '../../fixtures/legacy-store.js';

afterEach(cleanRepos);

const TODAY = '2026-10-14';

function repo(label: string): string {
  const root = tmpRepo(label);
  gitInit(root);
  writeLegacyStore(root);
  commitAll(root, '3.x store');
  return root;
}

async function run(root: string, args: string[]): Promise<{ code: number; text: string }> {
  const lines: string[] = [];
  const code = await migrateCli([...args, '--today', TODAY], root, { stdout: (l) => lines.push(l), stderr: (l) => lines.push(l) });
  return { code, text: lines.join('\n') };
}

const sha = (root: string) => git(root, ['rev-parse', '--short=7', 'HEAD']).trim();
const fm = (root: string, rel: string) => parseFile(fs.readFileSync(path.join(root, 'cortex', rel), 'utf8')).frontmatter!;

function row(text: string, ref: string): string {
  return text.split('\n').find((l) => l.startsWith(`| ${ref} |`)) ?? '';
}

describe('store.migrate', () => {
  it('[STORE-MIGRATE-1] accounts for every entry in a dry run and writes nothing', async () => {
    const root = repo('dry');
    const before = snapshot(root);
    const { code, text } = await run(root, []);
    expect(code).toBe(0);
    expect(text).toContain('Coverage: 100.0%');
    const legacy = readLegacyStore(root)!;
    for (const e of legacy.entries) if (e.row !== 'dropped') expect(row(text, e.ref)).not.toBe('');
    expect(snapshot(root)).toEqual(before);
  });

  it('[STORE-MIGRATE-2] follows the mapping table by default', async () => {
    const root = repo('defaults');
    const { text } = await run(root, []);
    expect(row(text, 'compass/rules/R-001-core-no-llm-calls.md')).toMatch(/world\/rules\/core-no-llm-calls\.md \| review/);
    expect(row(text, 'compass/bugs/B-001-path-noise.md')).toContain('history/incidents/2026-07-02-path-noise.md');
    expect(row(text, 'compass/bugs/B-002-orphaned-workspace.md')).toContain('code/harness/orphaned-workspace.md');
    expect(row(text, 'atlas/decisions/2026-07-08-single-home.md')).toContain('world/decisions/single-home.md, history/changes/2026-07-08-single-home.md');
    expect(row(text, 'archive/intent-register.yaml#IR-001')).toContain('history/changes/2026-08-05-add-the-presence-filter.md');
    expect(row(text, 'insight/observations/jev-evaluation.md')).toMatch(/code\/repo\/jev-evaluation\.md \| review/);
    expect(text).toMatch(/\| dropped by decision \| 6 \|/);
  });

  it('[STORE-MIGRATE-3] dropped insight summaries are counted, left on disk, and observations still migrate', async () => {
    const root = repo('dropped');
    const { text } = await run(root, ['--apply']);
    expect(text).toContain('| anatomy | 3 |');
    expect(text).toContain('| concepts | 2 |');
    expect(text).toContain('| graph | 1 |');
    expect(text).toContain('Removal command (not run): `git rm -r -q --ignore-unmatch .cortex/insight/anatomy .cortex/insight/concepts .cortex/insight/graph.json && rm -rf .cortex/insight/anatomy .cortex/insight/concepts .cortex/insight/graph.json`');
    expect(text).toContain('Coverage: 100.0%');
    await run(root, ['--accept']);
    for (const f of ['anatomy/src/a.ts.md', 'anatomy/src/b.ts.md', 'anatomy/src/c.ts.md', 'concepts/one.md', 'concepts/two.md', 'graph.json']) {
      expect(fs.existsSync(path.join(root, '.cortex/insight', f))).toBe(true);
    }
    const written = Object.keys(snapshot(path.join(root, 'cortex')));
    expect(written.some((f) => /anatomy|concepts|graph/.test(f))).toBe(false);
    expect(written).toContain('code/repo/jev-evaluation.md');
  });

  it('[STORE-MIGRATE-4] carries the 3.x citation graph into origin', async () => {
    const root = repo('provenance');
    const { text } = await run(root, ['--apply']);
    const s = sha(root);
    expect(fm(root, 'world/decisions/tiering.md')['origin']).toEqual([
      `migrated:atlas/decisions/2026-07-07-tiering.md@${s}`,
      'source:history/sources/2026-01-02-brief.md',
    ]);
    const ruleOrigin = fm(root, 'world/rules/core-no-llm-calls.md')['origin'] as string[];
    expect(ruleOrigin[ruleOrigin.length - 1]).toBe(`migrated:atlas/decisions/2026-07-07-tiering.md@${s}`);
    expect(text).toContain('- atlas/decisions/2026-07-07-tiering.md → atlas/decisions/2026-01-01-gone.md');
    expect(text).toContain('provenance refs: 2/3');
  });

  it('[STORE-MIGRATE-7] migrated files carry their 3.x origin, one per merged entry', async () => {
    const root = repo('origin');
    await run(root, ['--apply']);
    const s = sha(root);
    expect(fm(root, 'world/terms/fare.md')['origin']).toEqual([`migrated:atlas/domain/fare.md@${s}`]);
    expect(fm(root, 'world/agreements/working-preferences.md')['origin']).toEqual([1, 2, 3].map((n) => `migrated:compass/preferences.md#${n}@${s}`));
  });

  it('[STORE-MIGRATE-8] counts multi-entry files per entry', async () => {
    const root = repo('multi');
    const { text } = await run(root, []);
    for (const n of [1, 2, 3]) expect(row(text, `compass/preferences.md#${n}`)).toContain('world/agreements/working-preferences.md');
    expect(row(text, 'compass/preferences.md#4')).toBe('');
  });

  it('[STORE-MIGRATE-9] unmapped entries block apply', async () => {
    const root = repo('unmapped');
    fs.mkdirSync(path.join(root, '.cortex/atlas/unknown-kind'), { recursive: true });
    fs.writeFileSync(path.join(root, '.cortex/atlas/unknown-kind/x.md'), 'x\n');
    const { code, text } = await run(root, ['--apply']);
    expect(code).toBe(1);
    expect(text).toContain('- atlas/unknown-kind/x.md');
    expect(text).not.toContain('Coverage: 100.0%');
    expect(fs.existsSync(path.join(root, 'cortex'))).toBe(false);
  });

  it('[STORE-MIGRATE-10] a plan file overrides a default', async () => {
    const root = repo('plan');
    const plan = path.join(root, 'plan.json');
    fs.writeFileSync(plan, JSON.stringify({ 'insight/observations/jev-evaluation.md': 'world/systems/jev.md' }));
    const { text } = await run(root, ['--plan', plan]);
    expect(row(text, 'insight/observations/jev-evaluation.md')).toMatch(/\| world\/systems\/jev\.md \| plan \|/);
  });

  it('[STORE-MIGRATE-11] refuses a bad plan', async () => {
    const root = repo('badplan');
    const plan = path.join(root, 'plan.json');
    fs.writeFileSync(plan, JSON.stringify({ 'compass/nope.md': 'world/terms/x.md' }));
    let r = await run(root, ['--plan', plan]);
    expect(r.code).toBe(1);
    expect(r.text).toContain('compass/nope.md');
    fs.writeFileSync(plan, JSON.stringify({ 'atlas/domain/fare.md': 'world/misc/x.md' }));
    r = await run(root, ['--plan', plan]);
    expect(r.code).toBe(1);
    expect(r.text).toContain('world/misc/x.md');
  });

  it('[STORE-MIGRATE-12] apply writes a valid store and keeps the old one', async () => {
    const root = repo('apply');
    const before = snapshot(path.join(root, '.cortex'));
    const { code } = await run(root, ['--apply']);
    expect(code).toBe(0);
    expect(validateStore(root, TODAY).findings.filter((f) => f.level === 'error')).toEqual([]);
    expect(fs.readFileSync(path.join(root, 'cortex/history/incidents/2026-07-02-path-noise.md'), 'utf8')).toContain('The hook warned on every path match.');
    expect(fs.readFileSync(path.join(root, 'cortex/world/agreements/working-preferences.md'), 'utf8')).toContain('Tests come first.');
    expect(fs.readFileSync(path.join(root, 'cortex/world/terms/fare.md'), 'utf8')).toContain('The price of one crossing.');
    expect(snapshot(path.join(root, '.cortex'))).toEqual(before);
  });

  it('[STORE-MIGRATE-13] apply is re-runnable', async () => {
    const root = repo('rerun');
    await run(root, ['--apply']);
    const first = snapshot(path.join(root, 'cortex'));
    const { code } = await run(root, ['--apply']);
    expect(code).toBe(0);
    expect(snapshot(path.join(root, 'cortex'))).toEqual(first);
  });

  it('[STORE-MIGRATE-14] carries pending proposals over, not dropped', async () => {
    const root = repo('proposals');
    const { text } = await run(root, ['--apply']);
    const p = fs.readFileSync(path.join(root, 'cortex/now/proposals.md'), 'utf8');
    expect(p).toContain('## S-021: Headless commands hang\nuntil: 2026-11-13\nstatus: pending decision');
    expect(p).toContain('**Pattern:** run them backgrounded.');
    expect(p).toContain('##### Detail\nPoll with a timeout.');
    expect(p).toContain('```\n## not a heading\n```');
    expect(text).toContain('- S-021: Headless commands hang → now/proposals.md');
    expect(validateStore(root, TODAY).findings.filter((f) => f.check === 'check.now-until')).toEqual([]);
  });

  it('[STORE-MIGRATE-18] accept switches the blocks and deletes nothing', async () => {
    const root = repo('accept');
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# P\n\n<!-- cortex:start v3.4 -->\nold\n<!-- cortex:end -->\n');
    await run(root, ['--apply']);
    expect(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8')).toContain('v3.4');
    const { code } = await run(root, ['--accept']);
    expect(code).toBe(0);
    const claude = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('<!-- cortex:start v4.0 -->');
    expect(claude).toContain('@cortex/MAP.md');
    expect(JSON.parse(fs.readFileSync(path.join(root, 'cortex/cortex.json'), 'utf8')).migration).toEqual({ from: '3.4', accepted: TODAY });
    expect(fs.existsSync(path.join(root, '.cortex'))).toBe(true);
  });
});

describe('store.migrate Rules 13–14 (amendment 2026-10-14)', () => {
  function repoX(label: string): string {
    const root = tmpRepo(label);
    gitInit(root);
    writeLegacyStore(root);
    writeLegacyExtras(root);
    commitAll(root, '3.x store');
    return root;
  }

  it('[STORE-MIGRATE-5] turns session and source references into origins', async () => {
    const root = repoX('sessions');
    const { code } = await run(root, ['--apply']);
    expect(code).toBe(0);
    const obs = fs.readFileSync(path.join(root, 'cortex/code/repo/nightly-runs.md'), 'utf8');
    expect(fm(root, 'code/repo/nightly-runs.md')['origin']).toContain('session:abc12345');
    expect(fm(root, 'world/terms/crossing.md')['origin']).toContain('source:history/sources/2026-01-03-brief-notes.md');
    const term = fs.readFileSync(path.join(root, 'cortex/world/terms/crossing.md'), 'utf8');
    for (const t of [obs, term]) {
      expect(t).not.toMatch(/^\s*sessions:/m);
      expect(t).not.toMatch(/^\s*sources:/m);
      expect(t).not.toContain('someone');
    }
  });

  it('[STORE-MIGRATE-6] applies redactions and edits to the migrated text only', async () => {
    const root = repoX('redact');
    const before = snapshot(path.join(root, '.cortex'));
    const r = path.join(root, 'r.json');
    fs.writeFileSync(r, JSON.stringify({ replace: { acme: 'client-A' }, edits: { 'compass/environment.md#1': [['(private)', '(public)']] } }));
    const { code, text } = await run(root, ['--redact', r, '--apply']);
    expect(code).toBe(0);
    const bug = fs.readFileSync(path.join(root, 'cortex/history/incidents/2026-07-05-acme-sync.md'), 'utf8');
    expect(bug).toContain('client-A');
    expect(bug.replace('B-003-acme-sync', '')).not.toMatch(/\bacme\b(?!-sync)/);
    const sys = Object.entries(snapshot(path.join(root, 'cortex/world/systems'))).map(([, v]) => v).join('\n');
    expect(sys).toContain('(public)');
    expect(snapshot(path.join(root, '.cortex'))).toEqual(before);
    const section = text.slice(text.indexOf('## Redactions'), text.indexOf('## Retired threads'));
    expect(section).toContain('compass/bugs/B-003-acme-sync.md');
    expect(section).toContain('compass/environment.md#1');
    expect(section.replace(/compass\/bugs\/B-003-acme-sync\.md/g, '')).not.toContain('acme');
    fs.writeFileSync(r, JSON.stringify({ edits: { 'compass/environment.md#1': [['not there', 'x']] } }));
    expect((await run(root, ['--redact', r])).code).toBe(1);
  });
});
