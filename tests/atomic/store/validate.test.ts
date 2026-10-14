/**
 * Atomic tests — `store.validate` (schema Part II S11), one per acceptance
 * criterion.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { storeInit } from '../../../src/store/init.js';
import { validateStore } from '../../../src/store/validate.js';
import { storeCli } from '../../../src/store/cli.js';
import { tmpRepo, cleanRepos, writeStoreFile, baseFm, gitInit, commitAll } from '../../fixtures/store.js';

afterEach(cleanRepos);

const TODAY = '2026-10-14';
const of = (root: string, check: string) => validateStore(root, TODAY).findings.filter((f) => f.check === check);

describe('store.validate', () => {
  it('a clean store validates with exit 0', () => {
    const root = tmpRepo('clean');
    storeInit(root);
    writeStoreFile(root, 'world/terms/fare.md', baseFm({ about: 'What a fare is on these ferries' }), 'The price of one crossing.\n');
    const r = validateStore(root, TODAY);
    expect(r.findings).toEqual([]);
    expect(r.exitCode).toBe(0);
  });

  it('missing required frontmatter is an error', () => {
    const root = tmpRepo('missing');
    storeInit(root);
    const fm = baseFm();
    delete fm['verified'];
    writeStoreFile(root, 'world/terms/fare.md', fm);
    const r = validateStore(root, TODAY);
    const hit = r.findings.find((f) => f.check === 'check.frontmatter' && f.path === 'world/terms/fare.md');
    expect(hit?.level).toBe('error');
    expect(hit?.message).toContain('verified');
    expect(r.exitCode).toBe(1);
  });

  it('a file without an origin is an error', () => {
    const root = tmpRepo('no-origin');
    storeInit(root);
    const fm = baseFm();
    delete fm['origin'];
    writeStoreFile(root, 'world/terms/fare.md', fm);
    const r = validateStore(root, TODAY);
    const hit = r.findings.find((f) => f.check === 'check.frontmatter' && f.path === 'world/terms/fare.md');
    expect(hit?.level).toBe('error');
    expect(hit?.message).toContain('origin');
    expect(r.exitCode).toBe(1);
  });

  it('a malformed or misplaced origin is an error', () => {
    const root = tmpRepo('bad-origin');
    storeInit(root);
    writeStoreFile(root, 'world/terms/fare.md', baseFm({ origin: '/Users/someone/.claude/projects/x.jsonl' }));
    writeStoreFile(root, 'world/terms/tide.md', baseFm({ about: 'When the tide turns', origin: 'external:a client email' }));
    const errs = of(root, 'check.frontmatter').filter((f) => f.level === 'error');
    expect(errs.find((f) => f.path === 'world/terms/fare.md')?.message).toMatch(/no known form/);
    expect(errs.find((f) => f.path === 'world/terms/tide.md')?.message).toMatch(/external: is allowed only in history\/sources/);
  });

  it('a folder outside the layout is an error', () => {
    const root = tmpRepo('layout');
    storeInit(root);
    writeStoreFile(root, 'world/misc/x.md', baseFm());
    const hit = of(root, 'check.store-layout').find((f) => f.path === 'world/misc');
    expect(hit?.level).toBe('error');
  });

  it('naming: ids and dates are refused where they do not belong', () => {
    const root = tmpRepo('naming');
    storeInit(root);
    writeStoreFile(root, 'world/rules/R-002.md', baseFm({ applies_when: 'always', scope: ['action'], source: 'user@2026-10-12' }), 'Never push.\n');
    writeStoreFile(root, 'world/terms/2026-10-01-fare.md', baseFm());
    const paths = of(root, 'check.naming').filter((f) => f.level === 'error').map((f) => f.path);
    expect(paths).toContain('world/rules/R-002.md');
    expect(paths).toContain('world/terms/2026-10-01-fare.md');
  });

  it('near-duplicates are flagged once, naming both files', () => {
    const root = tmpRepo('neardup');
    storeInit(root);
    writeStoreFile(root, 'code/hooks/read-hook-latency.md', baseFm({ about: 'The read hook adds latency to every read' }));
    writeStoreFile(root, 'world/systems/read-hook.md', baseFm({ about: 'Every read gets latency added by the read hook' }));
    const hits = of(root, 'check.near-duplicate');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.level).toBe('warning');
    expect(`${hits[0]!.path} ${hits[0]!.message}`).toContain('code/hooks/read-hook-latency.md');
    expect(`${hits[0]!.path} ${hits[0]!.message}`).toContain('world/systems/read-hook.md');
  });

  it('an alias shared by two files is an error', () => {
    const root = tmpRepo('alias');
    storeInit(root);
    writeStoreFile(root, 'code/schema/xref-check.md', baseFm({ about: 'The xref check misses stale ids', aliases: ['B-019'] }));
    writeStoreFile(root, 'history/incidents/2026-09-01-xref.md', baseFm({ about: 'Xref incident', aliases: ['B-019'] }));
    const hit = of(root, 'check.aliases')[0];
    expect(hit?.level).toBe('error');
    expect(hit?.message).toContain('code/schema/xref-check.md');
    expect(hit?.message).toContain('history/incidents/2026-09-01-xref.md');
  });

  it('an edited history file is flagged; an appended correction is not', () => {
    const root = tmpRepo('append');
    gitInit(root);
    storeInit(root);
    const p = writeStoreFile(root, 'history/incidents/2026-09-01-x.md', baseFm({ about: 'The September outage' }), 'The queue stalled.\n');
    commitAll(root, 'incident');
    const original = fs.readFileSync(p, 'utf8');
    fs.writeFileSync(p, original.replace('The queue stalled.', 'The queue was fine.'));
    expect(of(root, 'check.append-only')).toHaveLength(1);
    fs.writeFileSync(p, original + '\n## Correction 2026-10-14\nIt stalled for two hours, not one.\n');
    expect(of(root, 'check.append-only')).toHaveLength(0);
  });

  it('with no store, it fails clearly', async () => {
    const root = tmpRepo('nostore');
    const out: string[] = [];
    const code = await storeCli(['validate'], root, { stdout: (l) => out.push(l) });
    expect(out).toEqual(['no 4.0 store (cortex/cortex.json not found)']);
    expect(code).toBe(1);
    expect(fs.existsSync(path.join(root, 'cortex'))).toBe(false);
  });
});
