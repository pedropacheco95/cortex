/**
 * Atomic tests — `store.freshness` (schema Part II S6, S3 `depends_on`), one
 * per acceptance criterion.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { storeInit } from '../../../src/store/init.js';
import { storeCli } from '../../../src/store/cli.js';
import { validateStore } from '../../../src/store/validate.js';
import { parseFile } from '../../../src/store/frontmatter.js';
import { tmpRepo, cleanRepos, writeStoreFile, baseFm, gitInit, commitAll, snapshot } from '../../fixtures/store.js';

afterEach(cleanRepos);

const nowFm = () => baseFm({ about: 'Who is away', permanence: 'volatile' });

async function cli(root: string, args: string[]): Promise<{ code: number; out: string[] }> {
  const out: string[] = [];
  const code = await storeCli(args, root, { stdout: (l) => out.push(l) });
  return { code, out };
}

const read = (root: string, rel: string) => fs.readFileSync(path.join(root, 'cortex', rel), 'utf8');

describe('store.freshness', () => {
  it('[STORE-FRESHNESS-1] a now/ item without until is an error', () => {
    const root = tmpRepo('nountil');
    storeInit(root);
    writeStoreFile(root, 'now/team.md', nowFm(), '- Rui is away\n');
    const hit = validateStore(root, '2026-10-14').findings.find((f) => f.check === 'check.now-until');
    expect(hit).toMatchObject({ level: 'error', path: 'now/team.md' });
    expect(hit!.message).toContain('Rui is away');
  });

  it('[STORE-FRESHNESS-2] an expired item is a warning', () => {
    const root = tmpRepo('expired');
    storeInit(root);
    writeStoreFile(root, 'now/team.md', nowFm(), '- Rui is away until: 2026-10-01\n');
    const hit = validateStore(root, '2026-10-14').findings.find((f) => f.check === 'check.now-until');
    expect(hit?.level).toBe('warning');
    expect(hit?.message).toContain('expired');
  });

  it('[STORE-FRESHNESS-3] expiry moves items to history', async () => {
    const root = tmpRepo('move');
    storeInit(root);
    writeStoreFile(root, 'now/team.md', nowFm(), '- Rui is away until: 2026-10-01\n- Ana is away until: 2026-10-30\n');
    await cli(root, ['expire', '--apply', '--today', '2026-10-14']);
    const team = read(root, 'now/team.md');
    expect(team).toContain('Ana is away');
    expect(team).not.toContain('Rui is away');
    const rec = read(root, 'history/changes/2026-10-14-now-expired.md');
    expect(rec).toContain('- Rui is away until: 2026-10-01');
    expect(parseFile(rec).frontmatter!['origin']).toEqual(['expired:now/team.md']);
    expect(validateStore(root, '2026-10-14').findings.filter((f) => f.level === 'error')).toEqual([]);
  });

  it('[STORE-FRESHNESS-4] marks and counts unreviewed proposals on expiry', async () => {
    const root = tmpRepo('proposals');
    storeInit(root);
    writeStoreFile(root, 'now/proposals.md', baseFm({ about: 'Proposals waiting for a decision', permanence: 'volatile' }),
      '## S-021: Headless cortex commands hang\nuntil: 2026-10-10\nstatus: pending decision\nIn scheduled runs, pulse-hygiene blocks.\n');
    const { out } = await cli(root, ['expire', '--apply', '--today', '2026-10-14']);
    expect(out).toContain('1 proposal(s) expired unreviewed: S-021');
    const rec = read(root, 'history/changes/2026-10-14-now-expired.md');
    expect(rec).toContain('S-021');
    expect(rec).toContain('In scheduled runs, pulse-hygiene blocks.');
    expect(rec).toContain('pending decision, expired unreviewed');
  });

  it('[STORE-FRESHNESS-5] a second expiry on the same day writes a new file', async () => {
    const root = tmpRepo('second');
    gitInit(root);
    storeInit(root);
    writeStoreFile(root, 'now/team.md', nowFm(), '- Rui is away until: 2026-10-01\n');
    await cli(root, ['expire', '--apply', '--today', '2026-10-14']);
    commitAll(root, 'first expiry');
    const first = read(root, 'history/changes/2026-10-14-now-expired.md');
    fs.appendFileSync(path.join(root, 'cortex/now/team.md'), '- Ana is away until: 2026-10-02\n');
    await cli(root, ['expire', '--apply', '--today', '2026-10-14']);
    expect(read(root, 'history/changes/2026-10-14-now-expired.md')).toBe(first);
    expect(read(root, 'history/changes/2026-10-14-now-expired-2.md')).toContain('Ana is away');
    expect(validateStore(root, '2026-10-14').findings.filter((f) => f.check === 'check.append-only')).toEqual([]);
  });

  it('[STORE-FRESHNESS-6] expire without --apply changes nothing', async () => {
    const root = tmpRepo('dry');
    storeInit(root);
    writeStoreFile(root, 'now/team.md', nowFm(), '- Rui is away until: 2026-10-01\n- Ana is away until: 2026-10-30\n');
    const before = snapshot(root);
    const { out } = await cli(root, ['expire', '--today', '2026-10-14']);
    expect(out.join('\n')).toContain('Rui is away');
    expect(snapshot(root)).toEqual(before);
  });

  it('[STORE-FRESHNESS-7] reports a changed dependency as stale', async () => {
    const root = tmpRepo('stale');
    gitInit(root);
    storeInit(root);
    fs.mkdirSync(path.join(root, 'src/hooks'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/hooks/pre-read.ts'), 'export {};\n');
    writeStoreFile(root, 'code/hooks/latency.md', baseFm({ about: 'Read hook latency', verified: '2026-10-01 (observed)', depends_on: ['src/hooks/pre-read.ts'] }));
    commitAll(root, 'base', '2026-10-01T10:00:00');
    fs.writeFileSync(path.join(root, 'src/hooks/pre-read.ts'), 'export const x = 1;\n');
    commitAll(root, 'change the hook', '2026-10-05T10:00:00');
    const sha = (await import('child_process')).execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    const { out } = await cli(root, ['stale']);
    expect(out).toEqual([`code/hooks/latency.md → src/hooks/pre-read.ts: ${sha} 2026-10-05`]);
  });

  it('[STORE-FRESHNESS-8] does not report an unchanged dependency', async () => {
    const root = tmpRepo('fresh');
    gitInit(root);
    storeInit(root);
    fs.mkdirSync(path.join(root, 'src/hooks'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/hooks/pre-read.ts'), 'export {};\n');
    writeStoreFile(root, 'code/hooks/latency.md', baseFm({ about: 'Read hook latency', verified: '2026-10-01 (observed)', depends_on: ['src/hooks/pre-read.ts'] }));
    commitAll(root, 'base', '2026-10-01T10:00:00');
    fs.writeFileSync(path.join(root, 'README.md'), 'x\n');
    commitAll(root, 'unrelated', '2026-10-05T10:00:00');
    const { out } = await cli(root, ['stale']);
    expect(out).toEqual(['no stale facts']);
  });

  it('[STORE-FRESHNESS-9] is a no-op outside git', async () => {
    const root = tmpRepo('nogit');
    storeInit(root);
    const { code, out } = await cli(root, ['stale']);
    expect(out).toEqual(['not a git repository']);
    expect(code).toBe(0);
  });
});
