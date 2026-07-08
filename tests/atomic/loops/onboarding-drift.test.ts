/**
 * Atomic tests — loops.onboarding-drift signals in isolation (Rule 2's four
 * drift signals). Sandboxed tmp fixtures; the CLAUDE.md block and templates
 * come from the real shipped templates module.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';
import { writeAt, makeCortexProject, decisionMd, daysAgoIso } from '../../fixtures/loops-harness.js';
import {
  checkClaudeMdVersion,
  checkIndexHeadings,
  checkIndexBudgets,
  checkTemplateIdentical,
  INDEX_TOKEN_BUDGET,
} from '../../../src/loops/onboarding-drift.js';
import { claudeMdBlock, CORTEX_INDEXES, SCHEMA_VERSION } from '../../../src/cli/templates.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`onboarding-atomic-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

describe('signal (a): CLAUDE.md managed-block version vs schemaVersion', () => {
  it('flags a v0.9 block against schemaVersion 1.0 and proposes a refresh', () => {
    const root = tmp('version-lag');
    makeCortexProject(root, '1.0');
    writeAt(root, 'CLAUDE.md', '<!-- cortex:start v0.9 -->\n## Cortex\n<!-- cortex:end -->\n');
    const findings = checkClaudeMdVersion(root);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.finding).toContain('v0.9');
    expect(findings[0]?.finding).toContain('1.0');
    expect(findings[0]?.action).toContain('cortex init --force');
  });

  it('flags a CLAUDE.md with no managed block', () => {
    const root = tmp('no-block');
    makeCortexProject(root);
    writeAt(root, 'CLAUDE.md', '# My project\n\nNo cortex here.\n');
    const findings = checkClaudeMdVersion(root);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.finding).toContain('no cortex managed block');
  });

  it('flags a missing CLAUDE.md entirely', () => {
    const root = tmp('no-file');
    makeCortexProject(root);
    expect(checkClaudeMdVersion(root)).toHaveLength(1);
  });

  it(`the shipped block (v${SCHEMA_VERSION}) against a matching config is silent`, () => {
    const root = tmp('current');
    makeCortexProject(root, SCHEMA_VERSION);
    writeAt(root, 'CLAUDE.md', claudeMdBlock('fixture') + '\n');
    expect(checkClaudeMdVersion(root)).toEqual([]);
  });
});

describe('signal (b): _index.md missing a §7.1 heading (via check.index-shape)', () => {
  it('flags an index missing "Read this when:" and names the file', () => {
    const root = tmp('heading');
    makeCortexProject(root);
    writeAt(root, '.cortex/compass/_index.md', "# Compass\n\n**What's here:** stuff.\n\n**How to navigate:** around.\n");
    const findings = checkIndexHeadings(root);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.finding).toContain('.cortex/compass/_index.md');
    expect(findings[0]?.finding).toContain('Read this when:');
    expect(findings[0]?.finding).toContain('check.index-shape');
  });

  it('a well-shaped index is silent', () => {
    const root = tmp('heading-ok');
    makeCortexProject(root);
    writeAt(root, '.cortex/compass/_index.md', CORTEX_INDEXES['compass'] as string);
    expect(checkIndexHeadings(root)).toEqual([]);
  });
});

describe(`signal (c): _index.md over the ${INDEX_TOKEN_BUDGET}-token budget (chars/4)`, () => {
  it('a ~2000-character index is flagged with a ~500-token estimate', async () => {
    const root = tmp('budget');
    makeCortexProject(root);
    const filler = 'word '.repeat(392); // 1960 chars
    writeAt(root, '.cortex/atlas/_index.md', `**Read this when:** always.\n\n**What's here:** ${filler}\n`);
    const findings = await checkIndexBudgets(root);
    expect(findings).toHaveLength(1);
    const m = /estimated (\d+) tokens/.exec(findings[0]?.finding ?? '');
    expect(m).not.toBeNull();
    const estimate = Number(m?.[1]);
    expect(estimate).toBeGreaterThanOrEqual(450);
    expect(estimate).toBeLessThanOrEqual(550);
  });

  it('an under-budget index is silent', async () => {
    const root = tmp('budget-ok');
    makeCortexProject(root);
    writeAt(root, '.cortex/atlas/_index.md', CORTEX_INDEXES['atlas'] as string);
    expect(await checkIndexBudgets(root)).toEqual([]);
  });
});

describe('signal (d): template-identical index in a grown directory (heuristic)', () => {
  it('flags a shipped-template index whose directory gained artefacts, labelled heuristic', () => {
    const root = tmp('template-grown');
    makeCortexProject(root);
    writeAt(root, '.cortex/atlas/decisions/_index.md', CORTEX_INDEXES['atlas/decisions'] as string);
    writeAt(root, '.cortex/atlas/decisions/2026-06-01-x.md', decisionMd('2026-06-01-x', daysAgoIso(3)));
    const findings = checkTemplateIdentical(root);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.heuristic).toBe(true);
    expect(findings[0]?.finding).toContain('atlas/decisions/_index.md');
    expect(findings[0]?.finding).toContain('never have been localised');
  });

  it('a template-identical index over an empty directory is silent', () => {
    const root = tmp('template-empty');
    makeCortexProject(root);
    writeAt(root, '.cortex/atlas/decisions/_index.md', CORTEX_INDEXES['atlas/decisions'] as string);
    expect(checkTemplateIdentical(root)).toEqual([]);
  });

  it('a localised index over a grown directory is silent', () => {
    const root = tmp('localised');
    makeCortexProject(root);
    writeAt(root, '.cortex/atlas/decisions/_index.md', '# Decisions — localised\n\n**Read this when:** deciding.\n');
    writeAt(root, '.cortex/atlas/decisions/2026-06-01-x.md', decisionMd('2026-06-01-x', daysAgoIso(3)));
    expect(checkTemplateIdentical(root)).toEqual([]);
  });

  it("init's own compass skeleton leaves do not count as gained artefacts", () => {
    const root = tmp('skeleton');
    makeCortexProject(root);
    writeAt(root, '.cortex/compass/_index.md', CORTEX_INDEXES['compass'] as string);
    writeAt(root, '.cortex/compass/preferences.md', '# Preferences\n');
    writeAt(root, '.cortex/compass/environment.md', '# Environment\n');
    expect(checkTemplateIdentical(root)).toEqual([]);
  });
});
