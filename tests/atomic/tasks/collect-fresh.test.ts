/** Atomic tests for loops.fresh-task Rule 2: `cortex tasks collect fresh`. */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { collectFresh } from '../../../src/tasks/collect-fresh.js';
import { tasksCollect } from '../../../src/tasks/collect.js';
import { storeInit } from '../../../src/store/init.js';
import { writeMapAndBlocks } from '../../../src/store/managed-block.js';
import { baseFm, cleanRepos, snapshot, tmpRepo, writeStoreFile } from '../../fixtures/store.js';

const TODAY = '2026-11-04';

function store(): string {
  const root = tmpRepo('fresh');
  storeInit(root);
  writeMapAndBlocks(root, {});
  return root;
}

const fm = (verified: string, extra: Record<string, unknown> = {}): Record<string, unknown> =>
  baseFm({ about: `About ${Math.random()}`, verified, ...extra });

afterEach(cleanRepos);

describe('Collect reports every section, even when empty', () => {
  it('[LOOPS-FRESH-TASK-1] holds all eight keys, empty, with exit 0 and no file changed', () => {
    const root = store();
    const before = snapshot(root);
    const out: string[] = [];
    const code = tasksCollect(['fresh', '--json', '--today', TODAY], root, { stdout: (l) => out.push(l) });
    expect(code).toBe(0);
    expect(JSON.parse(out.join('\n'))).toEqual({
      expired: [], stale: [], validate: { errors: [], warnings: [] }, nearDuplicates: [],
      aged: [], deadRules: [], scaffolding: [], openPitfalls: { count: 0, aged: [] },
    });
    expect(snapshot(root)).toEqual(before);
  });
});

describe('An old person file is aged, a recent one is not', () => {
  it('[LOOPS-FRESH-TASK-2] holds rui and not ana', () => {
    const root = store();
    writeStoreFile(root, 'world/people/rui.md', fm('2026-07-01 (told)'));
    writeStoreFile(root, 'world/people/ana.md', fm('2026-10-20 (told)'));
    expect(collectFresh(root, TODAY).aged.map((a) => a.file)).toEqual(['world/people/rui.md']);
  });

  it('[LOOPS-FRESH-TASK-15] covers orgs, systems and agreements, and not terms or rules', () => {
    const root = store();
    for (const f of ['world/orgs/a.md', 'world/systems/b.md', 'world/agreements/c.md', 'world/terms/d.md']) {
      writeStoreFile(root, f, fm('2026-01-01 (told)'));
    }
    expect(collectFresh(root, TODAY).aged.map((a) => a.file).sort()).toEqual(
      ['world/agreements/c.md', 'world/orgs/a.md', 'world/systems/b.md'],
    );
  });
});

describe('Decisions use the longer window and name who cites them', () => {
  it('[LOOPS-FRESH-TASK-3] holds a.md with citedBy, and not c.md', () => {
    const root = store();
    writeStoreFile(root, 'world/decisions/a.md', fm('2026-04-18 (told)'));
    writeStoreFile(root, 'world/decisions/c.md', fm('2026-07-27 (told)'));
    writeStoreFile(root, 'code/repo/b.md', fm('2026-11-01 (observed)'), 'See [why](world/decisions/a.md).\n');
    expect(collectFresh(root, TODAY).aged).toEqual([
      { file: 'world/decisions/a.md', verified: '2026-04-18', citedBy: ['code/repo/b.md'] },
    ]);
  });
});

describe('A rule whose paths match nothing is dead', () => {
  const rule = (extra: Record<string, unknown>): Record<string, unknown> =>
    fm('2026-11-01 (told)', { applies_when: 'The agent edits code', scope: ['action'], source: 'user@2026-11-01', ...extra });

  it('[LOOPS-FRESH-TASK-4] holds the first with its glob, and not the rule with no match.paths or a live one', () => {
    const root = store();
    fs.mkdirSync(path.join(root, 'src', 'live'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'live', 'x.ts'), '');
    writeStoreFile(root, 'world/rules/gone.md', rule({ match: { paths: ['src/gone/**'] } }));
    writeStoreFile(root, 'world/rules/none.md', rule({}));
    writeStoreFile(root, 'world/rules/live.md', rule({ match: { paths: ['src/gone/**', 'src/live/**'] } }));
    expect(collectFresh(root, TODAY).deadRules).toEqual([{ file: 'world/rules/gone.md', paths: ['src/gone/**'] }]);
  });
});

describe('A lagging managed block is reported', () => {
  it('[LOOPS-FRESH-TASK-5] names the mismatch', () => {
    const root = store();
    const file = path.join(root, 'CLAUDE.md');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf-8').replace('cortex:start v4.0', 'cortex:start v3.4'));
    const hits = collectFresh(root, TODAY).scaffolding.filter((s) => s.check === 'managed-block');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.message).toContain('v3.4');
    expect(hits[0]!.message).toContain('4.0');
  });

  it('[LOOPS-FRESH-TASK-16] names a missing block', () => {
    const root = store();
    fs.rmSync(path.join(root, 'CLAUDE.md'));
    expect(collectFresh(root, TODAY).scaffolding.map((s) => s.message).join()).toContain('missing');
  });
});

describe('Open pitfalls are counted and aged', () => {
  it('[LOOPS-FRESH-TASK-6] counts two and ages one', () => {
    const root = store();
    writeStoreFile(root, 'code/hooks/a.md', fm('2026-09-01 (observed)', { status: 'open' }));
    writeStoreFile(root, 'code/hooks/b.md', fm('2026-10-20 (observed)', { status: 'open' }));
    writeStoreFile(root, 'code/hooks/c.md', fm('2026-09-01 (observed)'));
    expect(collectFresh(root, TODAY).openPitfalls).toEqual({ count: 2, aged: ['code/hooks/a.md'] });
  });
});

describe('Collect does not expire anything', () => {
  it('[LOOPS-FRESH-TASK-7] lists the item and leaves the file byte-identical', () => {
    const root = store();
    const file = writeStoreFile(root, 'now/sprint.md', fm('2026-10-01 (told)', { permanence: 'volatile' }), '## Sprint nine\nuntil: 2026-10-30\n');
    const before = fs.readFileSync(file, 'utf-8');
    expect(collectFresh(root, TODAY).expired).toEqual([{ file: 'now/sprint.md', until: '2026-10-30', item: 'Sprint nine' }]);
    expect(fs.readFileSync(file, 'utf-8')).toBe(before);
  });
});

describe('near-duplicates and stale', () => {
  it('[LOOPS-FRESH-TASK-17, LOOPS-FRESH-TASK-18] reports the pair, and no stale outside git', () => {
    const root = store();
    writeStoreFile(root, 'world/terms/fare.md', baseFm({ about: 'What a fare means here' }));
    writeStoreFile(root, 'world/systems/fare.md', baseFm({ about: 'The fare service' }));
    const r = collectFresh(root, TODAY);
    expect(r.nearDuplicates).toHaveLength(1);
    expect(r.nearDuplicates[0]).toMatchObject({ a: expect.stringContaining('fare.md'), b: expect.stringContaining('fare.md') });
    expect(r.stale).toEqual([]);
  });
});
