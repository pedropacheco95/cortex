/**
 * Atomic tests — `src/pulse/promote.ts` after B-020 (`insight.promotion-mechanism`
 * Rules 5–6 as corrected 2026-09-17; schema §4.5 Source clause, §4.5.1; plan
 * Task 2.5). A promotion's `**Source:**` names one of exactly two artefact
 * kinds — an insight per-file entry or an archive extraction — and
 * `planPromotion` resolves it per kind: the insight kind stamps the promoted
 * trailer, the archive kind touches no insight file and may target only
 * compass/atlas. Pure function tests over a tmp root (fs reads only, R-001).
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { makeTmpDir, cleanTmp } from '../../fixtures/init-harness.js';
import { extractPromotionSource, planPromotion, injectSourceFrontmatter } from '../../../src/pulse/promote.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`promote-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function write(root: string, rel: string, content: string): void {
  const abs = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
}

const ARCHIVE_REL = 'archive/documents/brief/extracted/summary.md';
const PAYLOAD = `---\nid: stakeholder.coordinator\nname: Coordinator\nrole: r\nprovenance:\n  - derives_from: ${ARCHIVE_REL}\n---\n\n# Coordinator\n`;

describe('R-001 — Core makes no LLM calls', () => {
  it('promote.ts imports no LLM SDK', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../../src/pulse/promote.ts'), 'utf-8');
    expect(src).not.toMatch(/@anthropic-ai\/sdk|openai|child_process/);
  });
});

describe('extractPromotionSource — the two accepted source kinds', () => {
  it('an insight anatomy entry with the .cortex/ prefix → insight kind, project-relative', () => {
    expect(extractPromotionSource('distil; promoting .cortex/insight/anatomy/src/deploy.ts.md; sessions s1')).toEqual({
      kind: 'insight',
      rel: '.cortex/insight/anatomy/src/deploy.ts.md',
    });
  });

  it('an insight scope entry without the prefix is re-rooted under .cortex/', () => {
    expect(extractPromotionSource('promoting insight/scopes/web/anatomy/src/a.ts.md')).toEqual({
      kind: 'insight',
      rel: '.cortex/insight/scopes/web/anatomy/src/a.ts.md',
    });
  });

  it('the archive-ingest producer\'s exact Source line → archive kind, re-rooted under .cortex/', () => {
    expect(extractPromotionSource(`cortex-archive-ingest — ${ARCHIVE_REL}`)).toEqual({
      kind: 'archive',
      rel: `.cortex/${ARCHIVE_REL}`,
    });
  });

  it('an archive path already carrying .cortex/ is not double-prefixed; a nested extracted/ path is matched whole', () => {
    expect(extractPromotionSource(`see .cortex/${ARCHIVE_REL} (C-01)`)).toEqual({ kind: 'archive', rel: `.cortex/${ARCHIVE_REL}` });
    expect(extractPromotionSource('x — archive/documents/brief-2026/extracted/sections/03-asks.md, extracted/asks.md (A-08)')).toEqual({
      kind: 'archive',
      rel: '.cortex/archive/documents/brief-2026/extracted/sections/03-asks.md',
    });
  });

  it('a retired insight/map/ path, a pulse report, a bare loop name, or null → null', () => {
    expect(extractPromotionSource('promoting .cortex/insight/map/deploy.md')).toBeNull();
    expect(extractPromotionSource('cortex-loop — pulse/reports/session-observe.md')).toBeNull();
    expect(extractPromotionSource('archive/documents/brief/metadata.yaml')).toBeNull();
    expect(extractPromotionSource('distil; sessions s1')).toBeNull();
    expect(extractPromotionSource(null)).toBeNull();
  });
});

describe('planPromotion — archive kind lands the lineage and touches no insight file', () => {
  it('returns a plan with a null insight write and source: equal to the provenance path', () => {
    const root = tmp('archive-ok');
    write(root, `.cortex/${ARCHIVE_REL}`, '# Summary\n');
    const plan = planPromotion({
      root,
      suggestionId: 'S-060',
      targetRel: '.cortex/atlas/stakeholders/coordinator.md',
      isCreate: true,
      block: PAYLOAD,
      existingTarget: '',
      sourceField: `cortex-archive-ingest — ${ARCHIVE_REL}`,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.kind).toBe('archive');
    expect(plan.insightAbs).toBeNull();
    expect(plan.nextInsight).toBeNull();
    expect(plan.sourceRel).toBe(`.cortex/${ARCHIVE_REL}`);
    expect(plan.landedContent).toContain(`\nsource: ${ARCHIVE_REL}\n`);
    expect(plan.landedContent).toContain(`derives_from: ${ARCHIVE_REL}`);
    expect(plan.landedContent.endsWith('# Coordinator\n')).toBe(true);
  });

  it('an append to an existing compass file lands the block plus a _source:_ trailer', () => {
    const root = tmp('archive-append');
    write(root, `.cortex/${ARCHIVE_REL}`, '# Summary\n');
    const plan = planPromotion({
      root,
      suggestionId: 'S-060',
      targetRel: '.cortex/compass/preferences.md',
      isCreate: false,
      block: '- A new preference.\n',
      existingTarget: '# Preferences\n\nExisting.\n',
      sourceField: `cortex-archive-ingest — ${ARCHIVE_REL}`,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.landedContent).toBe(`# Preferences\n\nExisting.\n\n- A new preference.\n\n_source: ${ARCHIVE_REL}_`);
    expect(plan.insightAbs).toBeNull();
  });

  it('an archive source with a target outside compass/atlas is refused naming the two roots', () => {
    const root = tmp('archive-rules');
    write(root, `.cortex/${ARCHIVE_REL}`, '# Summary\n');
    write(root, 'RULES.md', '# Rules\n');
    const plan = planPromotion({
      root,
      suggestionId: 'S-060',
      targetRel: 'RULES.md',
      isCreate: false,
      block: 'rule text\n',
      existingTarget: '# Rules\n',
      sourceField: `cortex-archive-ingest — ${ARCHIVE_REL}`,
    });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toContain('S-060');
    expect(plan.error).toContain('.cortex/compass/');
    expect(plan.error).toContain('.cortex/atlas/');
  });

  it('an archive source whose file does not exist is refused', () => {
    const root = tmp('archive-missing');
    const plan = planPromotion({
      root,
      suggestionId: 'S-061',
      targetRel: '.cortex/atlas/stakeholders/x.md',
      isCreate: true,
      block: PAYLOAD,
      existingTarget: '',
      sourceField: `cortex-archive-ingest — ${ARCHIVE_REL}`,
    });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toContain('S-061');
    expect(plan.error).toContain(`.cortex/${ARCHIVE_REL}`);
    expect(plan.error).toContain('Nothing changed');
  });
});

describe('planPromotion — insight kind still stamps the trailer', () => {
  it('returns the insight write with the promoted trailer and a target-relative source:', () => {
    const root = tmp('insight-ok');
    const insightRel = '.cortex/insight/anatomy/src/deploy.ts.md';
    write(root, insightRel, '---\nkind: anatomy\n---\n\n## Deploy\n\nRuns via the runbook.\n');
    const plan = planPromotion({
      root,
      suggestionId: 'S-055',
      targetRel: '.cortex/atlas/decisions/2026-07-06-deploy-runbook.md',
      isCreate: true,
      block: '---\nid: decision.2026-07-06-deploy-runbook\ntitle: Deploy runbook\ndate: 2026-07-06T00:00:00Z\n---\n\nBody.\n',
      existingTarget: '',
      sourceField: `distil; promoting ${insightRel}; sessions s1`,
      now: new Date('2026-07-06T10:00:00Z'),
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.kind).toBe('insight');
    expect(plan.insightAbs).toBe(path.resolve(root, insightRel));
    expect(plan.nextInsight).toBe(
      '---\nkind: anatomy\n---\n\n## Deploy\n\nRuns via the runbook.\n\n_(promoted 2026-07-06 → .cortex/atlas/decisions/2026-07-06-deploy-runbook.md via S-055)_\n',
    );
    expect(plan.landedContent).toContain('\nsource: ../../insight/anatomy/src/deploy.ts.md\n');
  });

  it('an insight source may still target RULES.md (the archive-only root restriction does not apply)', () => {
    const root = tmp('insight-rules');
    const insightRel = '.cortex/insight/anatomy/src/a.ts.md';
    write(root, insightRel, '# a\n');
    const plan = planPromotion({
      root,
      suggestionId: 'S-055',
      targetRel: 'RULES.md',
      isCreate: false,
      block: 'rule\n',
      existingTarget: '# Rules\n',
      sourceField: `promoting ${insightRel}`,
    });
    expect(plan.ok).toBe(true);
  });
});

describe('planPromotion — a missing or unrecognised source refuses with the pinned text', () => {
  const PINNED =
    '**Source:** must name the artefact being promoted — an insight entry (.cortex/insight/anatomy/**) or an archive extraction (.cortex/archive/documents/<id>/extracted/**)';

  it('a source naming neither kind names both accepted shapes and never insight/map/', () => {
    const root = tmp('neither');
    const plan = planPromotion({
      root,
      suggestionId: 'S-061',
      targetRel: '.cortex/atlas/decisions/x.md',
      isCreate: true,
      block: 'body\n',
      existingTarget: '',
      sourceField: 'cortex-loop — pulse/reports/session-observe.md',
    });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toBe(`promotion S-061: ${PINNED}`);
    expect(plan.error).not.toContain('insight/map/');
  });

  it('a null source (no **Source:** line) is the same refusal', () => {
    const root = tmp('null-source');
    const plan = planPromotion({
      root,
      suggestionId: 'S-062',
      targetRel: '.cortex/atlas/decisions/x.md',
      isCreate: true,
      block: 'body\n',
      existingTarget: '',
      sourceField: null,
    });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toBe(`promotion S-062: ${PINNED}`);
  });

  it('an insight source whose file does not exist is refused, and nothing on disk changes', () => {
    const root = tmp('insight-missing');
    const plan = planPromotion({
      root,
      suggestionId: 'S-056',
      targetRel: '.cortex/atlas/decisions/x.md',
      isCreate: true,
      block: 'body\n',
      existingTarget: '',
      sourceField: 'promoting .cortex/insight/anatomy/src/nonexistent.ts.md',
    });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toContain('.cortex/insight/anatomy/src/nonexistent.ts.md');
    expect(plan.error).toContain('Nothing changed');
    expect(fs.readdirSync(root)).toEqual([]);
  });
});

describe('injectSourceFrontmatter', () => {
  it('adds source: before the closing fence, or prepends a minimal block', () => {
    expect(injectSourceFrontmatter('---\nid: x\n---\n\nBody\n', 'a/b.md')).toBe('---\nid: x\nsource: a/b.md\n---\n\nBody\n');
    expect(injectSourceFrontmatter('Body\n', 'a/b.md')).toBe('---\nsource: a/b.md\n---\n\nBody\n');
  });

  it('leaves a payload that already declares a top-level source: byte-identical (a rule\'s §4.1 source list — a second key would be a YAML duplicate)', () => {
    const rule = `---\nid: R-004\ntitle: T\nsource:\n  - ../../${ARCHIVE_REL}\ngoverns:\n  - "src/**"\nprovenance:\n  - derives_from: ${ARCHIVE_REL}\n---\n\n# R-004 — T\n`;
    expect(injectSourceFrontmatter(rule, ARCHIVE_REL)).toBe(rule);
    const scalar = '---\nid: x\nsource: already/here.md\n---\n\nBody\n';
    expect(injectSourceFrontmatter(scalar, 'a/b.md')).toBe(scalar);
    // Only a top-level key counts: an indented `source:` inside a mapping is not one.
    expect(injectSourceFrontmatter('---\nid: x\ncheck:\n  source: nested\n---\n\nBody\n', 'a/b.md')).toBe('---\nid: x\ncheck:\n  source: nested\nsource: a/b.md\n---\n\nBody\n');
  });

  it('planPromotion lands the skill\'s rule template parseable, with its own source list intact', () => {
    const root = tmp('archive-rule-template');
    write(root, `.cortex/${ARCHIVE_REL}`, '# Summary\n');
    const block = `---\nid: R-004\ntitle: T\nsource:\n  - ../../${ARCHIVE_REL}\ngoverns:\n  - "src/**"\nconfidence: EXTRACTED\nprovenance:\n  - derives_from: ${ARCHIVE_REL}\n---\n\n# R-004 — T\n`;
    const plan = planPromotion({ root, suggestionId: 'S-001', targetRel: '.cortex/compass/rules/R-004-t.md', isCreate: true, block, existingTarget: '', sourceField: `cortex-archive-ingest — ${ARCHIVE_REL}` });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.landedContent).toBe(block);
    expect(plan.landedContent.match(/^source:/gm)).toHaveLength(1);
  });
});
