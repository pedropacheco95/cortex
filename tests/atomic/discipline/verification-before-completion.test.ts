/**
 * Atomic tests for discipline.verification-skill and discipline.hardening-convention —
 * phrase-presence assertions over the PACKAGE bundles (skills/, the source of truth;
 * byte-identity with .claude/skills/ is the spec tier's job).
 *
 * Per the plan's §0 "Cut", skill verification is phrase-presence plus a worked
 * example — there is no behavioural eval harness. These tests pin the grafted
 * mechanisms (Iron Law line, claim→evidence rows, rationalization table) so a
 * later edit cannot quietly soften them.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// tests/atomic/discipline/ → package root is three levels up.
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const SKILL = fs.readFileSync(
  path.join(PKG_ROOT, 'skills', 'verification-before-completion', 'SKILL.md'),
  'utf-8',
);
const CONVENTION = fs.readFileSync(
  path.join(PKG_ROOT, 'skills', '_conventions', 'hardening.md'),
  'utf-8',
);

// ---------------------------------------------------------------------------
// AC: The Iron Law and its letter-and-spirit clause are present
// ---------------------------------------------------------------------------

describe('AC: the Iron Law and its letter-and-spirit clause are present', () => {
  it('carries the Iron Law verbatim on one line', () => {
    expect(SKILL).toContain('NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE');
  });

  it('follows the law with the letter-and-spirit clause', () => {
    const lawIdx = SKILL.indexOf('NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE');
    const after = SKILL.slice(lawIdx);
    expect(after).toMatch(/Violating the letter of this law is violating the spirit/);
  });

  it('states the law before the workflow, not buried in an appendix', () => {
    const lawIdx = SKILL.indexOf('NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE');
    expect(lawIdx).toBeGreaterThan(-1);
    // Everything before the law is frontmatter + title: under 1500 chars.
    expect(lawIdx).toBeLessThan(1500);
  });

  it('references the shared hardening convention rather than restating it', () => {
    expect(SKILL).toContain('skills/_conventions/hardening.md');
  });
});

// ---------------------------------------------------------------------------
// AC: The gate requires fresh evidence before a "tests pass" claim
// ---------------------------------------------------------------------------

describe('AC: the gate requires fresh evidence before a claim', () => {
  it('defines freshness as this turn, after the last change', () => {
    expect(SKILL).toMatch(/\*\*after\*\* your most recent change/);
    expect(SKILL).toMatch(/produced in the current turn/);
  });

  it('spells out the gate as a numbered procedure ending in obtain-or-narrow', () => {
    expect(SKILL).toMatch(/##\s+The gate/);
    expect(SKILL).toMatch(/\*\*Name the claim\.\*\*/);
    expect(SKILL).toMatch(/\*\*Check freshness\.\*\*/);
    expect(SKILL).toMatch(/obtain the evidence before speaking/i);
  });

  it('requires the test command to be run and cited for a "tests pass" claim', () => {
    expect(SKILL).toMatch(/The test command run this turn/);
  });
});

// ---------------------------------------------------------------------------
// AC: The claim→evidence table covers the named claim kinds
// ---------------------------------------------------------------------------

describe('AC: the claim→evidence table covers the spec Rule-4 claim kinds', () => {
  const REQUIRED_CLAIMS = [
    'The tests pass',
    'The bug is fixed',
    'It builds',
    'The spec / schema is valid',
    "I didn't change X",
  ];

  it('has a two-column claim → evidence table', () => {
    expect(SKILL).toMatch(/\|\s*Claim\s*\|\s*Evidence that discharges it\s*\|/);
  });

  for (const claim of REQUIRED_CLAIMS) {
    it(`maps "${claim}" to its required evidence`, () => {
      expect(SKILL).toContain(claim);
    });
  }

  it('names cortex validate as the evidence for a schema/spec claim', () => {
    expect(SKILL).toMatch(/`cortex validate` run this turn/);
  });

  it('gives the generalisation rule for unlisted claims', () => {
    expect(SKILL).toMatch(/what observation would be different if this claim were/i);
  });
});

// ---------------------------------------------------------------------------
// AC: The rationalization table answers the pressure excuses
// ---------------------------------------------------------------------------

describe('AC: the rationalization table answers the pressure excuses', () => {
  it('uses the pinned two-column header form', () => {
    expect(SKILL).toMatch(/\|\s*Thought\/Excuse\s*\|\s*Reality\s*\|/);
  });

  const REQUIRED_EXCUSES = [
    /too trivial to re-verify/i,
    /tests passed earlier/i,
    /obviously works/i,
    /user is waiting/i,
    /verification pass at the end/i,
  ];

  for (const excuse of REQUIRED_EXCUSES) {
    it(`answers the excuse ${excuse}`, () => {
      expect(SKILL).toMatch(excuse);
    });
  }

  it('has at least five rationalization rows', () => {
    const section = SKILL.slice(SKILL.indexOf('## Rationalization table'));
    const rows = section.split('\n').filter((l) => /^\|\s*"/.test(l));
    expect(rows.length).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// AC: An unverifiable claim is narrowed, not skipped
// ---------------------------------------------------------------------------

describe('AC: an unverifiable claim is narrowed, not skipped', () => {
  it('directs the agent to narrow the claim and state what was not verified', () => {
    expect(SKILL).toMatch(/\*\*narrow the claim\*\*/);
    expect(SKILL).toMatch(/state plainly what you did not/i);
  });

  it('forbids making the unqualified claim anyway', () => {
    expect(SKILL).toMatch(/Never make the unqualified claim anyway/);
  });
});

// ---------------------------------------------------------------------------
// AC: The skill runs without a spec tree (process-agnostic)
// ---------------------------------------------------------------------------

describe('AC: the skill is process-agnostic', () => {
  it('states that it requires no spec tree and no Cortex module', () => {
    expect(SKILL).toMatch(/requires no spec tree/i);
  });

  it('treats any Cortex-layer read as enrichment, never a precondition', () => {
    expect(SKILL).toMatch(/enrichment, never a precondition/);
  });

  it('never makes a step conditional on .specflow/ existing', () => {
    // The only permitted mention is the negative one in the Scope section.
    for (const line of SKILL.split('\n')) {
      if (!line.includes('.specflow/')) continue;
      expect(line, `unexpected .specflow/ dependency: ${line}`).toMatch(/no |requires no/i);
    }
  });
});

// ---------------------------------------------------------------------------
// AC: a worked example is present (plan §0 Cut — the substitute for an eval harness)
// ---------------------------------------------------------------------------

describe('AC: the body carries a worked example', () => {
  it('shows the mechanism firing on a realistic case', () => {
    expect(SKILL).toMatch(/##\s+Worked example/);
    const section = SKILL.slice(SKILL.indexOf('## Worked example'));
    expect(section).toMatch(/Go get it|Re-run it/);
  });
});

// ---------------------------------------------------------------------------
// discipline.hardening-convention
// ---------------------------------------------------------------------------

describe('AC: the three patterns are each defined with a shape and a worked example', () => {
  for (const heading of ['Iron Law', 'Rationalization table', 'HARD-GATE']) {
    it(`defines ${heading}`, () => {
      expect(CONVENTION).toMatch(new RegExp(`##\\s+\\d\\.\\s+${heading}`, 'i'));
    });
  }

  it('gives each pattern a required form and the failure mode it prevents', () => {
    expect(CONVENTION.match(/\*\*Required form:\*\*|\*\*Shape\.\*\*/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(CONVENTION.match(/\*\*Failure mode it prevents\.\*\*/g)?.length ?? 0).toBe(3);
  });
});

describe('AC: the rationalization-table headers are pinned', () => {
  it('pins the two-column Thought/Excuse → Reality form', () => {
    expect(CONVENTION).toMatch(/\|\s*Thought\/Excuse\s*\|\s*Reality\s*\|/);
  });

  it('states the authoring test that keeps strawmen out', () => {
    expect(CONVENTION).toMatch(/never seen an agent/i);
  });
});

describe('AC: the HARD-GATE carries the too-simple anti-pattern', () => {
  it('requires the "too simple to need the gate" paragraph', () => {
    expect(CONVENTION).toMatch(/too simple to need the gate/i);
  });

  it('explains why the gate fails without it', () => {
    expect(CONVENTION).toMatch(/gate without it is defeated/i);
  });
});

describe('AC: the convention is not registered as a skill', () => {
  it('skills/_conventions/ contains no SKILL.md', () => {
    expect(fs.existsSync(path.join(PKG_ROOT, 'skills', '_conventions', 'SKILL.md'))).toBe(false);
  });

  it('forbids the hedged Iron Law', () => {
    expect(CONVENTION).toMatch(/A hedged Iron Law is not an Iron Law/);
  });

  it('warns against reflowing grafted lines across line breaks', () => {
    expect(CONVENTION).toMatch(/Do not reflow the grafted lines/);
  });
});
