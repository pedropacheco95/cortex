/**
 * Spec tests for specflow.insight-awareness — the insight-query pass over the
 * SpecFlow skills, updated for the v3 query surface (`cortex insight
 * file/concept/element`, schema §4.10.8 — the v2 `query/get/neighbors/list`
 * verbs are retired). Mechanical prompt-structure assertions over the skill
 * bodies (atomic + spec tier; behavioural verification is journey-tier,
 * deferred):
 *
 *   - each benefiting skill names `cortex insight` in an instruction, and
 *     specflow-develop names all three v3 verbs (file / concept / element);
 *   - every insight mention carries the trust caveat (inferred context, not
 *     authority / ungated-unreviewed; the gated layers win);
 *   - the excluded specflow skills gain no insight instruction (design §5.12:
 *     lint, viewer, bugs — plus deep-onboard and spec-editor);
 *   - the edited bundles stay byte-identical between the package `skills/`
 *     (source of truth) and the `.claude/skills/` mirror.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// tests/spec/specflow/ → package root is three levels up.
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PKG_SKILLS = path.join(PKG_ROOT, 'skills');
const LOCAL_SKILLS = path.join(PKG_ROOT, '.claude', 'skills');

/** The skills that carry an insight-query step (design §5.12 + the early
 *  new-project scaffolding note). */
const BENEFITING = [
  'specflow-brainstorm',
  'specflow-develop',
  'specflow-plan',
  'specflow-entry',
  'specflow-tests',
  'specflow-ingest',
  'specflow-new-project',
  'specflow-onboard-codebase',
];

/** The specflow skills explicitly out of scope (design §5.12 names lint,
 *  viewer, and bugs as not integrated; deep-onboard and spec-editor gained
 *  nothing either). */
const EXCLUDED = [
  'specflow-bugs',
  'specflow-deep-onboard',
  'specflow-intent-reconcile',
  'specflow-receive-review',
  'specflow-request-review',
  'specflow-lint',
  'specflow-spec-editor',
  'specflow-viewer',
];

/** The trust caveat: insight is inferred/ungated context, never authority. */
const CAVEAT_RE = /not authority|ungated\/unreviewed/;
const GATED_RE = /gated/;

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
describe('AC: each benefiting skill names cortex insight with the trust caveat', () => {
  for (const name of BENEFITING) {
    it(`${name} instructs cortex insight and carries the trust caveat`, () => {
      const raw = body(PKG_SKILLS, name);
      const norm = normalized(raw);
      // Names the command in an instruction.
      expect(raw, `${name} names cortex insight`).toContain('cortex insight');
      // The trust caveat is present: context-not-authority + the gated layers.
      expect(norm, `${name} states the insight trust caveat`).toMatch(CAVEAT_RE);
      expect(norm, `${name} points at the gated layer(s)`).toMatch(GATED_RE);
    });
  }
});

// ---------------------------------------------------------------------------
// AC: specflow-develop names all three v3 verbs (§4.10.8)
// ---------------------------------------------------------------------------
describe('AC: specflow-develop names the three v3 insight verbs', () => {
  it('the develop body instructs file, concept, and element queries', () => {
    const raw = body(PKG_SKILLS, 'specflow-develop');
    expect(raw).toContain('cortex insight file');
    expect(raw).toContain('cortex insight concept');
    expect(raw).toContain('cortex insight element');
    // No retired v2 verbs linger.
    expect(raw).not.toContain('cortex insight query');
    expect(raw).not.toContain('cortex insight neighbors');
    // Framed as ungated leads to confirm, never gated rules.
    expect(normalized(raw)).toMatch(CAVEAT_RE);
  });
});

// ---------------------------------------------------------------------------
// AC: The caveat is present, not just the command
// ---------------------------------------------------------------------------
describe('AC: the trust caveat accompanies every cortex insight mention', () => {
  for (const name of BENEFITING) {
    it(`${name} does not name cortex insight without the trust caveat`, () => {
      const norm = normalized(body(PKG_SKILLS, name));
      // A command mention without the caveat fails the spec.
      expect(norm.includes('cortex insight') && CAVEAT_RE.test(norm)).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// AC: The unedited skills are untouched
// ---------------------------------------------------------------------------
describe('AC: the excluded specflow skills gain no insight instruction', () => {
  for (const name of EXCLUDED) {
    it(`${name} contains no cortex insight instruction`, () => {
      expect(body(PKG_SKILLS, name)).not.toContain('cortex insight');
    });
  }
});

// ---------------------------------------------------------------------------
// AC: Package and local copies stay byte-identical
// ---------------------------------------------------------------------------
describe('AC: the edited bundles are byte-identical package vs .claude mirror', () => {
  for (const name of BENEFITING) {
    it(`${name}/SKILL.md matches its .claude/skills/ counterpart byte-for-byte`, () => {
      const pkg = fs.readFileSync(path.join(PKG_SKILLS, name, 'SKILL.md'));
      const local = fs.readFileSync(path.join(LOCAL_SKILLS, name, 'SKILL.md'));
      expect(pkg.equals(local), `${name}/SKILL.md diverged between mirrors`).toBe(true);
    });
  }
});
