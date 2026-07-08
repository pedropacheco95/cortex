/**
 * Spec tests for specflow.insight-awareness — the insight-query pass over five
 * SpecFlow skills. Mechanical prompt-structure assertions over the skill bodies
 * (atomic + spec tier; behavioural verification is journey-tier, deferred):
 *
 *   - Rule 1: each of the five benefiting skills names `cortex insight` in an
 *     instruction, and specflow-develop names BOTH `query` and `neighbors`;
 *   - Rule 2: every insight step carries the ungated-trust caveat (insight is
 *     ungated/unreviewed; confirm against the gated layers before deciding);
 *   - Rule 1 exclusion AC: the six unedited specflow skills gain no insight
 *     instruction this pass;
 *   - Rule 4: the five edited bundles stay byte-identical between the package
 *     `skills/` (source of truth) and the `.claude/skills/` mirror.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// tests/spec/specflow/ → package root is three levels up.
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PKG_SKILLS = path.join(PKG_ROOT, 'skills');
const LOCAL_SKILLS = path.join(PKG_ROOT, '.claude', 'skills');

/** The five skills that gain an insight-query step (spec Rule 1 table). */
const BENEFITING = [
  'specflow-develop',
  'specflow-tests',
  'specflow-ingest',
  'specflow-new-project',
  'specflow-onboard-codebase',
];

/** The six specflow skills explicitly out of scope (spec Rule 1 exclusion AC). */
const EXCLUDED = [
  'specflow-bugs',
  'specflow-change-router',
  'specflow-deep-onboard',
  'specflow-lint',
  'specflow-spec-editor',
  'specflow-viewer',
];

/** The standardized ungated-trust caveat phrasing pinned for this pass (Rule 2). */
const CAVEAT_UNGATED = 'ungated/unreviewed';
const CAVEAT_GATED_LAYERS = 'the gated layers (cerebrum/atlas/`RULES.md`)';
const CAVEAT_DECISION = 'before it drives a decision';

/** SKILL.md body, whitespace-normalized so line-wrapped phrases match cleanly. */
function body(skillsDir: string, name: string): string {
  return fs.readFileSync(path.join(skillsDir, name, 'SKILL.md'), 'utf8');
}
function normalized(text: string): string {
  return text.replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// AC: Each benefiting skill carries its insight-query contract
// ---------------------------------------------------------------------------
describe('AC: each benefiting skill names cortex insight with the ungated caveat', () => {
  for (const name of BENEFITING) {
    it(`${name} instructs cortex insight and carries the ungated-trust caveat`, () => {
      const raw = body(PKG_SKILLS, name);
      const norm = normalized(raw);
      // Rule 1: names the command in an instruction.
      expect(raw, `${name} names cortex insight`).toContain('cortex insight');
      // Rule 2: the ungated-trust caveat is present near the command.
      expect(norm, `${name} states insight is ungated/unreviewed`).toContain(CAVEAT_UNGATED);
      expect(norm, `${name} points at the gated layers`).toContain(CAVEAT_GATED_LAYERS);
      expect(norm, `${name} frames the hit as a lead before a decision`).toContain(CAVEAT_DECISION);
    });
  }
});

// ---------------------------------------------------------------------------
// AC: specflow-develop names both query and neighbors
// ---------------------------------------------------------------------------
describe('AC: specflow-develop names both cortex insight query and neighbors', () => {
  it('the develop body instructs both query and neighbors as ungated leads', () => {
    const raw = body(PKG_SKILLS, 'specflow-develop');
    expect(raw).toContain('cortex insight query');
    expect(raw).toContain('cortex insight neighbors');
    // Both framed as ungated leads to confirm, never gated rules.
    expect(normalized(raw)).toContain(CAVEAT_UNGATED);
  });
});

// ---------------------------------------------------------------------------
// AC: The ungated caveat is present, not just the command (Rule 2)
// ---------------------------------------------------------------------------
describe('AC: the ungated caveat accompanies every cortex insight mention', () => {
  for (const name of BENEFITING) {
    it(`${name} does not name cortex insight without the ungated/unreviewed caveat`, () => {
      const norm = normalized(body(PKG_SKILLS, name));
      // A command mention without the caveat fails the spec.
      expect(norm.includes('cortex insight') && norm.includes(CAVEAT_UNGATED)).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// AC: The unedited skills are untouched (Rule 1 exclusion)
// ---------------------------------------------------------------------------
describe('AC: the six excluded specflow skills gain no insight instruction', () => {
  for (const name of EXCLUDED) {
    it(`${name} contains no cortex insight instruction`, () => {
      expect(body(PKG_SKILLS, name)).not.toContain('cortex insight');
    });
  }
});

// ---------------------------------------------------------------------------
// AC: Package and local copies stay byte-identical (Rule 4)
// ---------------------------------------------------------------------------
describe('AC: the five edited bundles are byte-identical package vs .claude mirror', () => {
  for (const name of BENEFITING) {
    it(`${name}/SKILL.md matches its .claude/skills/ counterpart byte-for-byte`, () => {
      const pkg = fs.readFileSync(path.join(PKG_SKILLS, name, 'SKILL.md'));
      const local = fs.readFileSync(path.join(LOCAL_SKILLS, name, 'SKILL.md'));
      expect(pkg.equals(local), `${name}/SKILL.md diverged between mirrors`).toBe(true);
    });
  }
});
