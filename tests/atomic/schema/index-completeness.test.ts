/**
 * schema.validator Rule 14 — compass index completeness (§7.1). A literal id or
 * a same-prefix range counts as referenced; a collapsed index (`… and N more`
 * or a generated block) counts as complete; otherwise one warning per index,
 * `index lists N of M rules|bugs (missing: …)`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { validate } from '../../../src/schema/validate.js';
import { checkIndexCompleteness, referencedIds, isCollapsed } from '../../../src/schema/checks/index-completeness.js';
import { makeTmpFixture, cleanup, writeRule, writeBug, writeCompassIndex, rulesDir, bugsDir, REPO_ROOT } from '../../fixtures/validator-tmp.js';

function plantBugs(root: string, ids: string[]): void {
  for (const id of ids) writeBug(root, `${id}-x.md`, id);
}

describe('referencedIds', () => {
  it('collects literal tokens of the prefix only', () => {
    expect([...referencedIds('see B-004 and R-001, then B-019.', 'B')].sort()).toEqual(['B-004', 'B-019']);
    expect([...referencedIds('see B-004 and R-001, then B-019.', 'R')]).toEqual(['R-001']);
  });

  it('expands an en-dash, an em-dash and a hyphen range inclusively', () => {
    expect([...referencedIds('B-001–B-003', 'B')].sort()).toEqual(['B-001', 'B-002', 'B-003']);
    expect([...referencedIds('R-002—R-004', 'R')].sort()).toEqual(['R-002', 'R-003', 'R-004']);
    expect([...referencedIds('B-010-B-012', 'B')].sort()).toEqual(['B-010', 'B-011', 'B-012']);
  });

  it('a mixed-prefix pair is two literals, not a range', () => {
    expect([...referencedIds('R-001–B-003', 'B')]).toEqual(['B-003']);
    expect([...referencedIds('R-001–B-003', 'R')]).toEqual(['R-001']);
  });

  it('a range wrapped in backticks (`B-001`–`B-020`) still expands', () => {
    expect(referencedIds('twenty bugs, `B-001`–`B-005`, one file each', 'B').size).toBe(5);
  });

  it('zero-pads to the wider width', () => {
    expect([...referencedIds('B-0998–B-1001', 'B')].sort()).toEqual(['B-0998', 'B-0999', 'B-1000', 'B-1001']);
  });
});

describe('isCollapsed', () => {
  it('true on a `… and N more` line', () => {
    expect(isCollapsed('- B-005\n- … and 4 more (`cortex …`)\n')).toBe(true);
  });
  it('true on a generated recall block', () => {
    expect(isCollapsed('<!-- cortex:recall:start v3.4 -->\nnothing\n<!-- cortex:recall:end -->')).toBe(true);
  });
  it('false on a plain index', () => {
    expect(isCollapsed('- B-001–B-003\n- B-005\n')).toBe(false);
  });
});

describe('An index that omits a bug is warned with the count', () => {
  let root: string;
  beforeAll(() => {
    root = makeTmpFixture('index-completeness-ac1');
    plantBugs(root, ['B-001', 'B-002', 'B-003', 'B-004', 'B-005']);
    writeCompassIndex(bugsDir(root), '- `B-001–B-003` — early ones\n- `B-005` — the latest');
  });
  afterAll(() => cleanup(root));

  it('exactly one warning at compass/bugs/_index.md: index lists 4 of 5 bugs (missing: B-004); conformant', async () => {
    const report = await validate(root);
    const found = report.violations.filter((v) => v.check === 'check.index-completeness');
    expect(found).toHaveLength(1);
    const v = found[0]!;
    expect(v.severity).toBe('warning');
    expect(v.clause).toBe('§7.1');
    expect(v.location.path).toBe(path.join(bugsDir(root), '_index.md'));
    expect(v.message).toBe('index lists 4 of 5 bugs (missing: B-004)');
    expect(report.conformant).toBe(true);
  });
});

describe('A collapsed index counts as complete', () => {
  let root: string;
  beforeAll(() => {
    root = makeTmpFixture('index-completeness-ac2');
    plantBugs(root, ['B-001', 'B-002', 'B-003', 'B-004', 'B-005']);
    writeCompassIndex(bugsDir(root), '- `B-005` — the latest\n- … and 4 more (`cortex …`)');
    // rules: R-001 on disk, the index's only "content" is a generated block naming no rule
    writeCompassIndex(rulesDir(root), '<!-- cortex:recall:start v3.4 -->\n- nothing here\n<!-- cortex:recall:end -->');
  });
  afterAll(() => cleanup(root));

  it('neither index produces a check.index-completeness finding', async () => {
    const report = await validate(root);
    expect(report.violations.filter((v) => v.check === 'check.index-completeness')).toEqual([]);
  });
});

describe('checkIndexCompleteness details', () => {
  let root: string;
  beforeAll(() => {
    root = makeTmpFixture('index-completeness-details');
  });
  afterAll(() => cleanup(root));

  it('names at most five missing ids, then `, …`', () => {
    plantBugs(root, ['B-001', 'B-002', 'B-003', 'B-004', 'B-005', 'B-006', 'B-007', 'B-008']);
    writeCompassIndex(bugsDir(root), '- B-008 only');
    const found = checkIndexCompleteness(root).filter((v) => v.location.path.endsWith(path.join('bugs', '_index.md')));
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toBe('index lists 1 of 8 bugs (missing: B-001, B-002, B-003, B-004, B-005, …)');
  });

  it('a rules index that omits a rule is warned as rules', () => {
    writeRule(root, 'R-002-second.md', 'R-002');
    writeCompassIndex(rulesDir(root), '- R-001 — the sample rule');
    const found = checkIndexCompleteness(root).filter((v) => v.location.path.endsWith(path.join('rules', '_index.md')));
    expect(found).toHaveLength(1);
    expect(found[0]!.check).toBe('check.index-completeness');
    expect(found[0]!.message).toBe('index lists 1 of 2 rules (missing: R-002)');
  });

  it('a duplicated id on disk counts once toward M', () => {
    writeRule(root, 'R-002-twin.md', 'R-002');
    const found = checkIndexCompleteness(root).filter((v) => v.location.path.endsWith(path.join('rules', '_index.md')));
    expect(found[0]!.message).toBe('index lists 1 of 2 rules (missing: R-002)');
  });

  it('an absent index or directory is not this check\'s finding', () => {
    fs.rmSync(path.join(rulesDir(root), '_index.md'));
    fs.rmSync(bugsDir(root), { recursive: true, force: true });
    expect(checkIndexCompleteness(root)).toEqual([]);
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-index-completeness-empty-'));
    try {
      expect(checkIndexCompleteness(empty)).toEqual([]);
    } finally {
      cleanup(empty);
    }
  });
});

describe("this repo's own compass indexes are complete", () => {
  it('compass/rules/_index.md and compass/bugs/_index.md produce no finding', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, '.cortex', 'compass', 'rules', '_index.md'))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, '.cortex', 'compass', 'bugs', '_index.md'))).toBe(true);
    expect(checkIndexCompleteness(REPO_ROOT)).toEqual([]);
  });
});
