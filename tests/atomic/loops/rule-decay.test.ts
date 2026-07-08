/**
 * Atomic tests — loops.rule-decay decay signals in isolation (Rule 2's three
 * signals, Rule 3's retired-skip). Sandboxed tmp fixtures; rule age uses the
 * mtime fallback (non-git fixtures) backdated via utimes.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';
import {
  writeAt,
  ruleMd,
  setMtimeDaysAgo,
} from '../../fixtures/loops-harness.js';
import { scanRuleDecay, RULE_DECAY_AGE_DAYS } from '../../../src/loops/rule-decay.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`rule-decay-atomic-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

describe('signal (a): every governs glob matches zero on-disk files', () => {
  it('proposes the rule with the dead globs quoted as evidence', async () => {
    const root = tmp('dead-governs');
    writeAt(root, 'README.md', '# t\n');
    writeAt(root, '.cortex/compass/rules/R-101-dead.md', ruleMd('R-101', { governs: ['src/gone/**/*.ts', 'lib/**'] }));
    const scan = await scanRuleDecay(root);
    expect(scan.candidates).toHaveLength(1);
    expect(scan.candidates[0]?.id).toBe('R-101');
    const signals = scan.candidates[0]?.signals.join('\n') ?? '';
    expect(signals).toContain('zero on-disk files');
    expect(signals).toContain('`src/gone/**/*.ts`');
    expect(signals).toContain('`lib/**`');
  });

  it('a rule with at least one matching glob does not fire signal (a)', async () => {
    const root = tmp('partial-governs');
    writeAt(root, 'README.md', '# t\n');
    writeAt(root, 'src/app.ts', 'export {};\n');
    writeAt(
      root,
      '.cortex/compass/rules/R-102-partial.md',
      ruleMd('R-102', { governs: ['src/**/*.ts', 'lib/nothing/**'] }),
    );
    const scan = await scanRuleDecay(root);
    expect(scan.candidates).toEqual([]);
  });
});

describe('signal (b): a source no longer resolves', () => {
  it('proposes the rule and names the unresolvable path', async () => {
    const root = tmp('dead-source');
    writeAt(root, 'src/app.ts', 'export {};\n');
    writeAt(
      root,
      '.cortex/compass/rules/R-103-src.md',
      ruleMd('R-103', { source: ['../../../docs/vanished.md'], governs: ['src/**/*.ts'] }),
    );
    const scan = await scanRuleDecay(root);
    expect(scan.candidates).toHaveLength(1);
    expect(scan.candidates[0]?.signals.join('\n')).toContain('docs/vanished.md');
  });

  it('sources resolving by bare ID (validator logic) are healthy', async () => {
    const root = tmp('id-source');
    writeAt(root, 'src/app.ts', 'export {};\n');
    writeAt(root, '.specflow/specs/a/thing.spec.md', '---\nid: a.thing\n---\n\n# t\n');
    writeAt(root, '.cortex/compass/rules/R-104-id.md', ruleMd('R-104', { source: ['a.thing'], governs: ['src/**/*.ts'] }));
    const scan = await scanRuleDecay(root);
    expect(scan.candidates).toEqual([]);
  });
});

describe('signal (c): age over threshold while (a) holds', () => {
  it(`adds the age signal when the rule file is older than ${RULE_DECAY_AGE_DAYS} days with dead governs`, async () => {
    const root = tmp('aged');
    writeAt(root, 'README.md', '# t\n');
    const ruleFile = writeAt(root, '.cortex/compass/rules/R-105-old.md', ruleMd('R-105', { governs: ['src/gone/**'] }));
    setMtimeDaysAgo(ruleFile, 200);
    const scan = await scanRuleDecay(root);
    expect(scan.candidates).toHaveLength(1);
    expect(scan.candidates[0]?.signals.join('\n')).toContain('200 days old');
  });

  it('a young rule with dead governs fires (a) but not the age signal', async () => {
    const root = tmp('young');
    writeAt(root, 'README.md', '# t\n');
    writeAt(root, '.cortex/compass/rules/R-106-young.md', ruleMd('R-106', { governs: ['src/gone/**'] }));
    const scan = await scanRuleDecay(root);
    expect(scan.candidates).toHaveLength(1);
    const signals = scan.candidates[0]?.signals ?? [];
    expect(signals.some((s) => s.includes('zero on-disk files'))).toBe(true);
    expect(signals.some((s) => s.includes('days old'))).toBe(false);
  });
});

describe('Rule 3: retired rules are skipped', () => {
  it('a retired rule with dead globs is not a candidate and is counted as skipped', async () => {
    const root = tmp('retired');
    writeAt(root, 'README.md', '# t\n');
    writeAt(
      root,
      '.cortex/compass/rules/R-107-retired.md',
      ruleMd('R-107', { governs: ['src/gone/**'], status: 'retired' }),
    );
    const scan = await scanRuleDecay(root);
    expect(scan.candidates).toEqual([]);
    expect(scan.retiredSkipped).toEqual(['R-107']);
    expect(scan.reviewed).toBe(0);
  });
});

describe('healthy rules stay silent', () => {
  it('resolving sources + matching governs → no candidate', async () => {
    const root = tmp('healthy');
    writeAt(root, 'README.md', '# t\n');
    writeAt(root, 'src/app.ts', 'export {};\n');
    writeAt(root, '.cortex/compass/rules/R-108-ok.md', ruleMd('R-108'));
    const scan = await scanRuleDecay(root);
    expect(scan.candidates).toEqual([]);
    expect(scan.reviewed).toBe(1);
  });

  it('a project with no rules dir scans clean', async () => {
    const root = tmp('no-rules');
    const scan = await scanRuleDecay(root);
    expect(scan.candidates).toEqual([]);
    expect(scan.reviewed).toBe(0);
  });
});
