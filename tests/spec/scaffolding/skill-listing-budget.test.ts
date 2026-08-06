/**
 * Spec tests for scaffolding.skill-listing-budget — the real bundles on disk.
 *
 * The atomic tier proves the guard's logic; this tier proves the shipped listing
 * actually conforms to it, so a regression fails `pnpm test` rather than waiting
 * for someone to remember `pnpm check:skill-budget`.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// tests/spec/scaffolding/ → package root is three levels up.
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SKILLS = path.join(PKG_ROOT, 'skills');
const MIRROR = path.join(PKG_ROOT, '.claude', 'skills');

const guard = await import(path.join(PKG_ROOT, 'scripts', 'measure-skill-descriptions.mjs'));
const { evaluate, measureWorkingTree, TIERS, TIER_CEILING } = guard;

const rows = measureWorkingTree(SKILLS);
const byName = new Map(rows.map((r: { bundle: string }) => [r.bundle, r]));

/** The 16 bundles this spec rewrote. specflow-entry (Tier C) is deliberately not among them. */
const REWRITTEN = [
  'specflow-bugs',
  'specflow-plan',
  'specflow-develop',
  'specflow-tests',
  'specflow-onboard-codebase',
  'specflow-spec-editor',
  'specflow-ingest',
  'specflow-brainstorm',
  'specflow-lint',
  'specflow-receive-review',
  'specflow-intent-reconcile',
  'verification-before-completion',
  'specflow-new-project',
  'specflow-request-review',
  'specflow-viewer',
  'specflow-deep-onboard',
];

describe('AC: the guard covers every bundle without a flag', () => {
  it('measures every directory under skills/ that has a SKILL.md', () => {
    const onDisk = fs
      .readdirSync(SKILLS, { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(SKILLS, e.name, 'SKILL.md')))
      .map((e) => e.name)
      .sort();
    expect(rows.map((r: { bundle: string }) => r.bundle)).toEqual(onDisk);
  });

  it('classifies every measured bundle — none falls through unclassified', () => {
    const unclassified = rows.filter((r: { tier?: string }) => !r.tier);
    expect(unclassified.map((r: { bundle: string }) => r.bundle)).toEqual([]);
  });

  it('lists no bundle in TIERS that is not on disk', () => {
    for (const bundle of Object.keys(TIERS)) {
      expect(fs.existsSync(path.join(SKILLS, bundle, 'SKILL.md')), `${bundle} in TIERS but not on disk`).toBe(true);
    }
  });

  it('parses every bundle frontmatter', () => {
    const unparseable = rows.filter((r: { unparseable?: boolean }) => r.unparseable);
    expect(unparseable.map((r: { bundle: string }) => r.bundle)).toEqual([]);
  });
});

describe('AC: the shipped listing conforms to its tier ceilings', () => {
  it('reports no failures across all bundles', () => {
    expect(evaluate(rows)).toEqual([]);
  });

  it.each(REWRITTEN)('%s is within its tier ceiling', (bundle) => {
    const row = byName.get(bundle) as { after: number; tier: string };
    const ceiling = TIER_CEILING[row.tier];
    expect(ceiling).not.toBeNull();
    expect(row.after).toBeLessThanOrEqual(ceiling);
  });

  it('keeps the whole listing well under the ~2k-token budget', () => {
    const chars = rows.reduce((sum: number, r: { after: number }) => sum + r.after, 0);
    // chars/4 is the estimate the budget conversation uses.
    expect(Math.round(chars / 4)).toBeLessThan(1600);
  });
});

describe('AC: a name-dispatched bundle fits Tier A', () => {
  it('specflow-bugs is at most 120 chars and keeps its pinned phrases', () => {
    const row = byName.get('specflow-bugs') as { after: number; description: string };
    expect(row.after).toBeLessThanOrEqual(120);
    expect(row.description.toLowerCase()).toContain('is broken');
  });
});

describe('AC: a cold-phrasing entry point keeps its surface', () => {
  it('specflow-new-project is at most 250 chars and keeps its pinned phrases', () => {
    const row = byName.get('specflow-new-project') as { after: number; description: string };
    expect(row.after).toBeLessThanOrEqual(250);
    const d = row.description.toLowerCase();
    expect(d).toContain('new project');
    expect(d).toContain('i want to build');
  });
});

describe('AC: a callable-only bundle carries no trigger surface', () => {
  const tierD = Object.entries(TIERS)
    .filter(([, t]) => t === 'D')
    .map(([b]) => b);

  it('has the two expected members', () => {
    expect(tierD.sort()).toEqual(['specflow-deep-onboard', 'specflow-viewer']);
  });

  it.each(['specflow-viewer', 'specflow-deep-onboard'])('%s is at most 60 chars', (bundle) => {
    expect((byName.get(bundle) as { after: number }).after).toBeLessThanOrEqual(60);
  });

  it.each(['specflow-viewer', 'specflow-deep-onboard'])('%s advertises no triggers', (bundle) => {
    const d = (byName.get(bundle) as { description: string }).description;
    expect(d).not.toMatch(/PROACTIVELY/i);
    expect(d).not.toMatch(/trigger/i);
    expect(d, 'a quoted example utterance is trigger surface').not.toMatch(/["“]/);
    expect(d).not.toMatch(/\buse this skill\b/i);
  });

  it.each(['specflow-viewer', 'specflow-deep-onboard'])('%s says in its body that it is callable-only', (bundle) => {
    const body = fs.readFileSync(path.join(SKILLS, bundle, 'SKILL.md'), 'utf-8');
    expect(body).toContain('callable-only');
    expect(body).toContain(`/${bundle}`);
  });
});

describe('AC: specflow-entry is exempt and is not shrunk', () => {
  it('is Tier C with no ceiling', () => {
    expect(TIERS['specflow-entry']).toBe('C');
    expect(TIER_CEILING.C).toBeNull();
  });

  it('keeps the full routing surface it had before this spec', () => {
    // Pinned by size and content rather than by diffing against a git ref: once
    // this change lands, HEAD is the post-spec tree, so a git comparison would
    // pass vacuously (and would say nothing about a future shrink).
    const row = byName.get('specflow-entry') as { after: number; description: string };
    expect(row.after).toBeGreaterThan(1000);
    const d = row.description.toLowerCase();
    for (const phrase of ['add a feature', 'fix this bug', 'change this behavior', "what's the goal of"]) {
      expect(d, `specflow-entry lost "${phrase}"`).toContain(phrase.toLowerCase());
    }
  });
});

/**
 * One distinctive phrase per rewritten bundle, taken from the description it
 * shed. Checked into the test rather than recovered from git: the pre-shrink
 * text only exists in history, and a test that reads `HEAD` stops testing
 * anything the moment this change is committed.
 */
const SHED_PHRASE: Record<string, string> = {
  'specflow-bugs': 'walking the spec-model diagnostic tree',
  'specflow-plan': 'bite-sized tasks with exact paths',
  'specflow-develop': 'the last stage of the spec-first spine',
  'specflow-tests': 'A test that does not execute is not a test.',
  'specflow-onboard-codebase': 'bottom-up atom extraction',
  'specflow-spec-editor': 'manage bidirectional links',
  'specflow-ingest': 'structured change manifest',
  'specflow-brainstorm': 'asks ONE question at a time',
  'specflow-lint': 'frontmatter schema, entity reference style',
  'specflow-receive-review': 'instead of performative agreement',
  'specflow-intent-reconcile': 'verbatim RED anchor test',
  'verification-before-completion': 'It is the evidence gate',
  'specflow-new-project': 'tooling manifest, agents, skills, rules',
  'specflow-request-review': 'Correctness belongs to the test suite',
  'specflow-viewer': 'Business⇄Developer toggle',
  'specflow-deep-onboard': 'compares structurally, investigates disagreements',
};

describe('AC: shed content survives in the body', () => {
  it('pins a phrase for every rewritten bundle', () => {
    expect(Object.keys(SHED_PHRASE).sort()).toEqual([...REWRITTEN].sort());
  });

  it.each(REWRITTEN)('%s has a non-empty "## When to use" section', (bundle) => {
    const raw = fs.readFileSync(path.join(SKILLS, bundle, 'SKILL.md'), 'utf-8');
    expect(raw).toMatch(/^## When to use$/m);
    const section = raw.split(/^## When to use$/m)[1]?.split(/^## /m)[0] ?? '';
    expect(section.trim().length, `${bundle}'s section is empty`).toBeGreaterThan(80);
  });

  it.each(REWRITTEN)('%s keeps a distinctive phrase from its pre-shrink description', (bundle) => {
    const raw = fs.readFileSync(path.join(SKILLS, bundle, 'SKILL.md'), 'utf-8');
    // Normalised: the moved text is re-wrapped, so a phrase may span lines.
    expect(raw.replace(/\s+/g, ' ')).toContain(SHED_PHRASE[bundle]);
  });
});

describe('AC: the mirror matches the source', () => {
  it.each(REWRITTEN)('%s is byte-identical in .claude/skills/', (bundle) => {
    const src = fs.readFileSync(path.join(SKILLS, bundle, 'SKILL.md'));
    const mirrored = fs.readFileSync(path.join(MIRROR, bundle, 'SKILL.md'));
    expect(mirrored.equals(src)).toBe(true);
  });

  it('mirrors every shipped bundle, not only the rewritten ones', () => {
    for (const bundle of Object.keys(TIERS)) {
      const src = fs.readFileSync(path.join(SKILLS, bundle, 'SKILL.md'));
      const mirrored = fs.readFileSync(path.join(MIRROR, bundle, 'SKILL.md'));
      expect(mirrored.equals(src), `${bundle} drifted from its mirror`).toBe(true);
    }
  });
});

describe('descriptions are single-line quoted scalars (Rule 5)', () => {
  it.each(REWRITTEN)('%s uses no block scalar', (bundle) => {
    const raw = fs.readFileSync(path.join(SKILLS, bundle, 'SKILL.md'), 'utf-8');
    const fm = /^---\n([\s\S]*?\n)---\n/.exec(raw)![1];
    expect(fm).not.toMatch(/^description:[ \t]*(>-|>|\|-|\|)[ \t]*$/m);
    expect(fm).toMatch(/^description: '.*'$/m);
  });
});
