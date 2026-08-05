/**
 * Atomic tests for specflow.cortex-awareness — one labeled describe per skill,
 * asserting the Rule 1 tier contract strings against the PACKAGE bundles
 * (skills/specflow-*, the source of truth; byte-identity with .claude/skills/
 * is the spec tier's job).
 *
 * Deep skills: index-first + insight + compass (incl. `check:` predicates
 * where specified) + atlas + `cortex validate` where specified.
 * Moderate skills: their targeted reads. Light skills: their minimal touch.
 * specflow-bugs: ledger path present AND no root-bugs.md write instruction.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// tests/atomic/specflow/ → package root is three levels up.
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function body(name: string): string {
  return fs.readFileSync(path.join(PKG_ROOT, 'skills', name, 'SKILL.md'), 'utf-8');
}

function bundleFile(name: string, rel: string): string {
  return fs.readFileSync(path.join(PKG_ROOT, 'skills', name, rel), 'utf-8');
}

/**
 * Every line mentioning the legacy filename must be an explicit prohibition
 * ("never ...") — allowing for the prohibition wrapping onto the next line.
 */
function expectOnlyProhibitions(text: string, legacy: string, label: string): void {
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (!line.includes(legacy)) return;
    const context = `${i > 0 ? lines[i - 1] : ''}\n${line}`;
    expect(context, `${label}: legacy ${legacy} write instruction: ${line}`).toMatch(/never/i);
  });
}

// ---------------------------------------------------------------------------
// Deep tier
// ---------------------------------------------------------------------------

describe('specflow-develop (Deep): index-first, insight, compass incl. predicates, atlas, validate', () => {
  const s = body('specflow-develop');

  it('carries a clearly-delimited Cortex awareness section', () => {
    expect(s).toMatch(/^## Cortex [Aa]wareness$/m);
  });

  it('reads .cortex/_index.md first (index-first protocol)', () => {
    expect(s).toContain('.cortex/_index.md');
    expect(s).toContain('Index first');
  });

  it('pulls insight for the touched files via governs globs and uses Purpose lines + Connections', () => {
    expect(s).toContain('Insight for the touched files.');
    expect(s).toContain('cortex insight file');
    expect(s).toContain('`governs:`');
    expect(s).toMatch(/Purpose line.*replaces a whole-file read/s);
    expect(s).toContain('Connections');
  });

  it('collects both governs-matched and check:-predicated compass rules and honours them', () => {
    expect(s).toContain('.cortex/compass/rules/R-*.md');
    expect(s).toMatch(/`governs` globs match.*AND every rule whose\s+`check:` predicate/s);
    expect(s).toMatch(/Honour them while coding/);
  });

  it('consults atlas decisions for the touched domain', () => {
    expect(s).toContain('.cortex/atlas/decisions/');
  });

  it('runs cortex validate before finishing', () => {
    expect(s).toMatch(/Run `cortex validate` before reporting completion/);
  });

  it('gap documentation lands at .cortex/pulse/gaps.md, never a root gaps.md (§8.5)', () => {
    expect(s).toContain('.cortex/pulse/gaps.md');
    expect(s).toContain('§8.5');
    expectOnlyProhibitions(s, 'gaps.md`', 'specflow-develop SKILL.md root-gaps');
    // The gap-documentation reference is redirected too.
    const ref = bundleFile('specflow-develop', 'references/gap-documentation.md');
    expect(ref).toContain('.cortex/pulse/gaps.md');
    expectOnlyProhibitions(ref, 'gaps.md`', 'gap-documentation.md root-gaps');
  });
});

describe('specflow-tests (Deep): compass check: predicates into generated tests, insight, covers: conventions', () => {
  const s = body('specflow-tests');

  it('carries a clearly-delimited Cortex awareness section', () => {
    expect(s).toMatch(/^## Cortex [Aa]wareness$/m);
  });

  it('reads applicable compass rules via governed_by: and governs globs', () => {
    expect(s).toContain('`governed_by:`');
    expect(s).toContain('.cortex/compass/rules/R-*.md');
  });

  it('incorporates check: predicates into generated atomic/spec tests (bridge 1) as assertions, not comments', () => {
    expect(s).toMatch(/Incorporate each rule's `check:`\s+predicate into the generated atomic and spec tests/);
    expect(s).toMatch(/becomes an executed assertion/);
    expect(s).toContain('bridge 1');
  });

  it('reads insight for the governed files of the spec under test', () => {
    expect(s).toContain('Insight for the governed files.');
    expect(s).toContain('cortex insight file');
    expect(s).toContain('`governs:`');
    expect(s).toMatch(/Purpose lines/);
  });

  it('notes the four-tier and covers: conventions per schema §3/§4.8', () => {
    expect(s).toMatch(/cortex-schema §3 and §4\.8/);
    expect(s).toContain('`covers:`');
  });

  it('verification output lands at .cortex/pulse/reports/verification.md, never tests/verification-report.md (§8.5)', () => {
    expect(s).toContain('.cortex/pulse/reports/verification.md');
    expect(s).toContain('§8.5');
    expectOnlyProhibitions(s, 'tests/verification-report.md', 'specflow-tests');
    // The write instructions themselves are redirected, not just prohibited.
    expect(s).toMatch(/verification agent writes `\.cortex\/pulse\/reports\/verification\.md`/);
    expect(s).toMatch(/placed at\s+`\.cortex\/pulse\/reports\/verification\.md`/);
  });
});

describe('specflow-entry (Deep): routes by Cortex module touched, bug reports to §4.3 ledger', () => {
  const s = body('specflow-entry');

  it('carries a clearly-delimited Cortex awareness section', () => {
    expect(s).toMatch(/^## Cortex [Aa]wareness$/m);
  });

  it('routes by checking which Cortex module the request touches (bridge 6)', () => {
    expect(s).toMatch(/which Cortex module the request touches/);
    expect(s).toContain('bridge 6');
  });

  it('names the insight layer, compass, and atlas indexes as part of classification', () => {
    expect(s).toContain('cortex insight file <path>');
    expect(s).toContain('cortex insight concept <name>');
    expect(s).toContain('`governs:`');
    expect(s).toContain('.cortex/compass/_index.md');
    expect(s).toContain('.cortex/atlas/_index.md');
  });

  it('routes bug-shaped reports toward the §4.3 ledger flow', () => {
    expect(s).toMatch(/Bug-shaped reports route toward the ledger flow/);
    expect(s).toContain('.cortex/compass/bugs/B-NNN-<slug>.md');
    expect(s).toContain('§4.3');
  });

  it('no longer instructs updating a root bugs.md (Category 2 flow uses the ledger)', () => {
    for (const line of s.split('\n').filter((l) => l.includes('bugs.md'))) {
      expect(line, `legacy bugs.md write instruction: ${line}`).toMatch(/never/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Moderate tier
// ---------------------------------------------------------------------------

describe('specflow-onboard-codebase (Moderate): insight-first build (bridge 5), §4.2 rule drafts', () => {
  const s = body('specflow-onboard-codebase');

  it('carries a clearly-delimited Cortex awareness section', () => {
    expect(s).toMatch(/^## Cortex [Aa]wareness$/m);
  });

  it('builds from the extracted insight instead of re-walking the tree when .cortex/insight/ exists', () => {
    expect(s).toContain('a `.cortex/insight/` directory');
    expect(s).toMatch(/instead of re-walking the tree/);
    expect(s).toMatch(/Phase 1 starts from insight/);
    expect(s).toContain('.cortex/insight/graph.json');
    expect(s).toContain('`imports` edges');
    expect(s).toMatch(/only where a file has no insight entry/);
    expect(s).toContain('bridge 5');
  });

  it('drafts rules referencing the schema §4.2 format', () => {
    expect(s).toMatch(/cortex-schema §4\.2/);
    expect(s).toContain('.cortex/compass/rules/R-NNN-<slug>.md');
    expect(s).toContain('`check:` predicate');
  });

  it('bug findings land in the §4.3 ledger, never a root bugs.md deliverable (§8.5)', () => {
    expect(s).toContain('.cortex/compass/bugs/B-NNN-<slug>.md');
    expect(s).toContain('§4.3');
    expect(s).toMatch(/seven-type/);
    expectOnlyProhibitions(s, 'bugs.md', 'specflow-onboard-codebase SKILL.md');
    expect(s).not.toContain('BUG-001');
    // The generated-CLAUDE.md template points at the ledger too.
    const ref = bundleFile('specflow-onboard-codebase', 'references/claude-md-template.md');
    expect(ref).toContain('.cortex/compass/bugs/');
    expectOnlyProhibitions(ref, 'bugs.md', 'claude-md-template.md');
  });
});

describe('specflow-deep-onboard (Moderate): insight-first input, §8.5 pulse output homes', () => {
  const s = body('specflow-deep-onboard');

  it('carries a clearly-delimited Cortex awareness section', () => {
    expect(s).toMatch(/^## Cortex [Aa]wareness$/m);
  });

  it('inherits the insight-first input from specflow-onboard-codebase', () => {
    expect(s).toContain('.cortex/insight/anatomy/<path>.md');
    expect(s).toContain('.cortex/insight/graph.json');
    expect(s).toMatch(/[Ii]nsight-first/);
  });

  it('passes outputs through the .cortex/pulse/ homes the design names (§8.5)', () => {
    expect(s).toContain('§8.5');
    expect(s).toContain('.cortex/pulse/onboarding-scratch/');
    expect(s).toContain('.cortex/pulse/deep-onboard-report.md');
    expect(s).toMatch(/`proposed-notes\.md` \/ `corrections\.md`\s+to `\.cortex\/pulse\/`/);
  });

  it('pass-merge instructions reference the ledger, not per-pass bugs.md files', () => {
    expect(s).toMatch(/Merge the bug ledgers/);
    expect(s).toContain('.cortex/compass/bugs/');
    expect(s).toContain('compass/bugs/B-NNN-');
    expect(s).toMatch(/Compare bug ledgers/);
    expectOnlyProhibitions(s, 'bugs.md', 'specflow-deep-onboard SKILL.md');
  });

  it('the legacy deep-onboard.md reference file carries the same ledger merge instructions', () => {
    const ref = bundleFile('specflow-deep-onboard', 'deep-onboard.md');
    expect(ref).toMatch(/Merge the bug ledgers/);
    expect(ref).toContain('.cortex/compass/bugs/');
    expect(ref).toContain('compass/bugs/B-NNN-');
    expectOnlyProhibitions(ref, 'bugs.md', 'deep-onboard.md');
  });
});

describe('specflow-ingest (Moderate): cortex-ingest sibling boundary both ways, atlas cross-references (bridge 2)', () => {
  const s = body('specflow-ingest');

  it('carries a clearly-delimited Cortex awareness section', () => {
    expect(s).toMatch(/^## Cortex [Aa]wareness$/m);
  });

  it('hands the memory-shaped remainder to cortex-archive-ingest (which preserves the source under archive/)', () => {
    // The sibling was `cortex-ingest` at v2; its atlas-only ingestion re-homed
    // into `cortex-archive-ingest` (v3 archive module), which stores sources
    // under .cortex/archive/documents/<slug>/ instead of atlas/sources/.
    expect(s).toContain('`cortex-archive-ingest`');
    expect(s).toContain('.cortex/archive/documents/');
    expect(s).toMatch(/requirement-shaped/);
    expect(s).toMatch(/memory-shaped/);
  });

  it('the boundary runs in both directions', () => {
    expect(s).toMatch(/both directions/);
    expect(s).toMatch(/when `cortex-archive-ingest` encounters\s+requirement-shaped material, it hands off here/);
  });

  it('business specs are proposed alongside atlas cross-references (bridge 2)', () => {
    expect(s).toContain('bridge 2');
    expect(s).toContain('.cortex/atlas/decisions/');
  });
});

describe('specflow-new-project (Moderate): preferences.md read before proposing defaults, schema tree conventions', () => {
  const s = body('specflow-new-project');

  it('carries a clearly-delimited Cortex awareness section', () => {
    expect(s).toMatch(/^## Cortex [Aa]wareness$/mi);
  });

  it('reads compass/preferences.md (when present) before proposing stack/convention defaults', () => {
    expect(s).toContain('.cortex/compass/preferences.md');
    expect(s).toMatch(/\(when present\) before proposing stack or\s+convention defaults/);
  });

  it('scaffolds per the schema tree conventions', () => {
    expect(s).toMatch(/cortex-schema §2/);
  });
});

describe('specflow-spec-editor (Moderate): governed_by check on edit, cortex validate after modifications', () => {
  const s = body('specflow-spec-editor');

  it('carries a clearly-delimited Cortex awareness section', () => {
    expect(s).toMatch(/^## Cortex [Aa]wareness$/m);
  });

  it('checks governed_by:/rule references when editing specs', () => {
    expect(s).toContain('`governed_by:`');
    expect(s).toContain('.cortex/compass/rules/R-*.md');
  });

  it('runs cortex validate after modifications as the mechanical backbone, keeping the judgment layer', () => {
    expect(s).toMatch(/Run `cortex validate` after modifications/);
    expect(s).toMatch(/mechanical\s+backbone/);
    expect(s).toMatch(/coherence check below remains this skill's judgment\s+layer/);
    expect(s).toMatch(/don't\s+hand-roll checks the validator already enforces/);
  });
});

// ---------------------------------------------------------------------------
// Light tier
// ---------------------------------------------------------------------------

describe('specflow-viewer (Light): one optional-insight note, no required reads', () => {
  const s = body('specflow-viewer');

  it('carries exactly one Cortex awareness note', () => {
    const notes = s.match(/Cortex awareness/gi) ?? [];
    expect(notes).toHaveLength(1);
  });

  it('the note says insight Purpose lines MAY enrich rendering and no reads are required', () => {
    expect(s).toContain('.cortex/insight/anatomy/<path>.md');
    expect(s).toMatch(/MAY read/);
    expect(s).toMatch(/No Cortex[\s>]+reads are required/);
  });

  it('adds no full Cortex awareness section (light tier: a note, not a workflow phase)', () => {
    expect(s).not.toMatch(/^## Cortex [Aa]wareness$/m);
  });
});

describe('specflow-lint (Light): names cortex validate as the mechanical backbone, no duplicate checks', () => {
  const s = body('specflow-lint');

  it('names cortex validate as the mechanical backbone it layers judgment on', () => {
    expect(s).toMatch(/`cortex validate` is the mechanical backbone/);
    expect(s).toMatch(/layers judgment on/);
  });

  it('forbids reimplementing the validator checks', () => {
    expect(s).toMatch(/do not reimplement those checks/);
  });
});

describe('specflow-bugs (Light): every bug write goes to the §4.3 ledger, no root bugs.md remains', () => {
  const s = body('specflow-bugs');

  it('files bugs at .cortex/compass/bugs/B-NNN-<slug>.md', () => {
    expect(s).toContain('.cortex/compass/bugs/B-NNN-<slug>.md');
  });

  it('the ledger format carries the schema §4.3 seven-type frontmatter', () => {
    expect(s).toContain('§4.3');
    for (const slug of [
      'missing-criterion',
      'incomplete-rule',
      'wrong-rule',
      'missing-dev-spec',
      'missing-business-spec',
      'layer-drift',
      'test-defect',
    ]) {
      expect(s, `missing seven-type slug ${slug}`).toContain(`\`${slug}\``);
    }
    // Frontmatter fields per §4.3.
    for (const field of ['id: B-NNN', 'title:', 'type:', 'severity:', 'status:', 'affects:', 'proposed_fix:', 'opened:']) {
      expect(s, `missing frontmatter field ${field}`).toContain(field);
    }
    // Schema enums, not the legacy major/normal/minor and diagnosed/in-progress.
    expect(s).toContain('critical | high | medium | low');
    expect(s).toMatch(/`open` when filed, `triaged` once classified/);
  });

  it('no instruction to write a root bugs.md remains', () => {
    const lines = s.split('\n').filter((l) => l.includes('bugs.md'));
    // The only tolerated mention is the explicit prohibition.
    for (const line of lines) {
      expect(line, `legacy bugs.md reference: ${line}`).toMatch(/[Nn]ever/);
    }
    expect(s).not.toContain('BUG-001');
    expect(s).not.toMatch(/appended to `bugs\.md`/);
  });
});
