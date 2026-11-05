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

import { INSTALLED_MARKER_FILENAME } from '../../../src/cli/scaffold.js';
import { FINAL_BUNDLES, RETIRED_SKILL_NAMES } from '../../../src/store/migrate/system.js';

const guard = await import(path.join(PKG_ROOT, 'scripts', 'measure-skill-descriptions.mjs'));
const { evaluate, measureWorkingTree, TIERS, TIER_CEILING } = guard;

const rows = measureWorkingTree(SKILLS);
const byName = new Map(rows.map((r: { bundle: string }) => [r.bundle, r]));

/** The bundles this spec rewrote that still ship. */
const REWRITTEN = [
  'verification-before-completion',
];

describe('AC: the guard covers every bundle without a flag', () => {
  it('[SCAFFOLDING-SKILL-LISTING-BUDGET-7] measures every directory under skills/ that has a SKILL.md', () => {
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

  it.each(REWRITTEN)('[SCAFFOLDING-SKILL-LISTING-BUDGET-1] %s is within its tier ceiling', (bundle) => {
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
  it('[SCAFFOLDING-SKILL-LISTING-BUDGET-1] verification-before-completion is at most 120 chars and keeps its pinned phrases', () => {
    const row = byName.get('verification-before-completion') as { after: number; description: string };
    expect(row.after).toBeLessThanOrEqual(120);
    expect(row.description.toLowerCase()).toContain('evidence gate');
  });
});

describe('AC: a cold-phrasing entry point keeps its surface', () => {
  it('[SCAFFOLDING-SKILL-LISTING-BUDGET-2] specflow-spec is at most 250 chars and keeps its pinned phrases', () => {
    const row = byName.get('specflow-spec') as { after: number; description: string };
    expect(row.after).toBeLessThanOrEqual(250);
    const d = row.description.toLowerCase();
    expect(d).toContain('spec this');
    expect(d).toContain('brainstorm');
  });
});

describe('AC: a callable-only bundle carries no trigger surface', () => {
  const tierD = Object.entries(TIERS)
    .filter(([, t]) => t === 'D')
    .map(([b]) => b);

  it('every Tier D member is on disk and none is silently mis-tiered', () => {
    // Derived from TIERS rather than pinned to a literal: adding a Tier D bundle
    // is a deliberate act that updates TIERS, and it should not break a test
    // about an unrelated bundle.
    expect(tierD.length).toBeGreaterThan(0);
    for (const bundle of tierD) {
      expect(fs.existsSync(path.join(SKILLS, bundle, 'SKILL.md')), bundle).toBe(true);
    }
  });

  it.each(tierD)('[SCAFFOLDING-SKILL-LISTING-BUDGET-3] %s is at most 60 chars', (bundle) => {
    expect((byName.get(bundle) as { after: number }).after).toBeLessThanOrEqual(60);
  });

  it.each(tierD)('[SCAFFOLDING-SKILL-LISTING-BUDGET-3] %s advertises no triggers', (bundle) => {
    const d = (byName.get(bundle) as { description: string }).description;
    expect(d).not.toMatch(/PROACTIVELY/i);
    expect(d).not.toMatch(/trigger/i);
    expect(d, 'a quoted example utterance is trigger surface').not.toMatch(/["“]/);
    expect(d).not.toMatch(/\buse this skill\b/i);
  });

  it.each(tierD)('%s says in its body that it is callable-only', (bundle) => {
    const body = fs.readFileSync(path.join(SKILLS, bundle, 'SKILL.md'), 'utf-8');
    expect(body).toContain('callable-only');
    expect(body).toContain(`/${bundle}`);
  });
});


/**
 * One distinctive phrase per rewritten bundle, taken from the description it
 * shed. Checked into the test rather than recovered from git: the pre-shrink
 * text only exists in history, and a test that reads `HEAD` stops testing
 * anything the moment this change is committed.
 */
const SHED_PHRASE: Record<string, string> = {
  'verification-before-completion': 'It is the evidence gate',
};

describe('AC: shed content survives in the body', () => {
  it('pins a phrase for every rewritten bundle', () => {
    expect(Object.keys(SHED_PHRASE).sort()).toEqual([...REWRITTEN].sort());
  });

  it.each(REWRITTEN)('[SCAFFOLDING-SKILL-LISTING-BUDGET-11] %s has a non-empty "## When to use" section', (bundle) => {
    const raw = fs.readFileSync(path.join(SKILLS, bundle, 'SKILL.md'), 'utf-8');
    expect(raw).toMatch(/^## When to use$/m);
    const section = raw.split(/^## When to use$/m)[1]?.split(/^## /m)[0] ?? '';
    expect(section.trim().length, `${bundle}'s section is empty`).toBeGreaterThan(80);
  });

  it.each(REWRITTEN)('[SCAFFOLDING-SKILL-LISTING-BUDGET-11] %s keeps a distinctive phrase from its pre-shrink description', (bundle) => {
    const raw = fs.readFileSync(path.join(SKILLS, bundle, 'SKILL.md'), 'utf-8');
    // Normalised: the moved text is re-wrapped, so a phrase may span lines.
    expect(raw.replace(/\s+/g, ' ')).toContain(SHED_PHRASE[bundle]);
  });
});

describe('AC: the mirror matches the source', () => {
  it.each(REWRITTEN)('[SCAFFOLDING-SKILL-LISTING-BUDGET-12] %s is byte-identical in .claude/skills/', (bundle) => {
    const src = fs.readFileSync(path.join(SKILLS, bundle, 'SKILL.md'));
    const mirrored = fs.readFileSync(path.join(MIRROR, bundle, 'SKILL.md'));
    expect(mirrored.equals(src)).toBe(true);
  });

  it('[SCAFFOLDING-SKILL-LISTING-BUDGET-12] mirrors every shipped bundle, not only the rewritten ones', () => {
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

const SHIPPED = [...FINAL_BUNDLES, 'cortex-migrate'].sort();

function filesUnder(dir: string): string[] {
  return (fs.readdirSync(dir, { recursive: true, withFileTypes: true }) as fs.Dirent[])
    .filter((e) => e.isFile() && e.name !== INSTALLED_MARKER_FILENAME)
    .map((e) => path.relative(dir, path.join(e.parentPath, e.name)))
    .sort();
}

describe('AC: the package ships exactly the ten', () => {
  const shipped = fs
    .readdirSync(SKILLS, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(SKILLS, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort();

  it('[SCAFFOLDING-SKILL-LISTING-BUDGET-13] lists FINAL_BUNDLES and cortex-migrate, and nothing else', () => {
    expect(shipped).toHaveLength(10);
    expect(shipped).toEqual(SHIPPED);
  });

  it('[SCAFFOLDING-SKILL-LISTING-BUDGET-13] ships no bundle with a retired name', () => {
    const patterns = RETIRED_SKILL_NAMES.map((n) => new RegExp(`^${n.replace('*', '.+')}$`));
    for (const name of shipped) {
      expect(patterns.some((p) => p.test(name)), `${name} is retired`).toBe(false);
    }
  });
});

describe('AC: the mirror holds the same ten', () => {
  it('[SCAFFOLDING-SKILL-LISTING-BUDGET-14] lists the ten and coordinate-sessions, and nothing else', () => {
    const mirrored = fs
      .readdirSync(MIRROR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    expect(mirrored).toEqual([...SHIPPED, 'coordinate-sessions'].sort());
  });

  it.each(SHIPPED)('[SCAFFOLDING-SKILL-LISTING-BUDGET-14] %s is byte-identical, with no strays on either side', (bundle) => {
    const files = filesUnder(path.join(SKILLS, bundle));
    expect(files).toContain('SKILL.md');
    expect(filesUnder(path.join(MIRROR, bundle))).toEqual(files);
    for (const file of files) {
      const source = fs.readFileSync(path.join(SKILLS, bundle, file));
      expect(source.equals(fs.readFileSync(path.join(MIRROR, bundle, file))), file).toBe(true);
    }
  });
});
