/**
 * Atomic tests for specflow.intent-reconcile — phrase-presence over the
 * PACKAGE bundle. The fixture pair exercising both branches through the
 * validator lives in tests/spec/specflow/intent-reconcile.spec.test.ts.
 *
 * The load-bearing assertion here is Rule 4: subsumption is counterfactual,
 * not lexical. Everything else in the skill is scaffolding around that one
 * judgment, and a body that softens it is back to "the spec mentions it".
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// tests/atomic/specflow/ → package root is three levels up.
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SKILL = fs.readFileSync(
  path.join(PKG_ROOT, 'skills', 'specflow-intent-reconcile', 'SKILL.md'),
  'utf-8',
);

describe('AC: the Iron Law and rationalization table are present', () => {
  it('carries the Iron Law verbatim on one line', () => {
    expect(SKILL).toContain('NO ANCHOR RETIRED WITHOUT A SPEC TEST THAT WOULD FAIL WITHOUT IT');
  });

  it('follows it with the letter-and-spirit clause', () => {
    const after = SKILL.slice(SKILL.indexOf('NO ANCHOR RETIRED WITHOUT A SPEC TEST THAT WOULD FAIL WITHOUT IT'));
    expect(after).toMatch(/Violating the letter of this law is violating the spirit/);
  });

  it('references the shared hardening convention', () => {
    expect(SKILL).toContain('skills/_conventions/hardening.md');
  });

  it('carries a two-column rationalization table with at least five rows', () => {
    expect(SKILL).toMatch(/\|\s*Thought\/Excuse\s*\|\s*Reality\s*\|/);
    const section = SKILL.slice(SKILL.indexOf('## Rationalization table'));
    const rows = section.split('\n').filter((l) => /^\|\s*"/.test(l));
    expect(rows.length).toBeGreaterThanOrEqual(5);
  });

  const EXCUSES = [
    /spec obviously covers this/,
    /mentions the same words/,
    /keep the anchor around too/,
    /Paraphrasing the intent/,
    /Filing a bug for a missing criterion is heavy/,
  ];
  for (const excuse of EXCUSES) {
    it(`answers the excuse ${excuse}`, () => {
      expect(SKILL).toMatch(excuse);
    });
  }
});

describe('AC: subsumption is decided counterfactually', () => {
  it('states the counterfactual question, not a lexical one', () => {
    expect(SKILL).toMatch(/\*\*Would the spec-derived test fail if the specific behaviour changed\?\*\*/);
  });

  it('explicitly rejects lexical overlap as subsumption', () => {
    expect(SKILL).toMatch(/Not "does the spec mention it"/);
    expect(SKILL).toMatch(/Those are\s+lexical checks/);
  });

  it('gives the operational probe as numbered steps, and says to revert it', () => {
    expect(SKILL).toMatch(/\*\*The operational check — actually do it:\*\*/);
    expect(SKILL).toMatch(/Revert your change either way — this is a probe, not an edit/);
  });

  it('names both outcomes of the probe', () => {
    expect(SKILL).toMatch(/\*\*It fails → subsumed\.\*\*/);
    expect(SKILL).toMatch(/\*\*It passes → not subsumed\.\*\*/);
  });
});

describe('AC: an operational ask is not pinned at all (Phase-6 finding)', () => {
  it('separates behavioural from operational asks before anything is pinned', () => {
    expect(SKILL).toMatch(/### \(a0\) First: is the ask even spec-shaped\?/);
    expect(SKILL).toMatch(/\*\*Behavioural\*\* — something that must \*stay\* true/);
    expect(SKILL).toMatch(/\*\*Operational\*\* — something to \*do\*, once/);
  });

  it('states the discriminating question', () => {
    expect(SKILL).toMatch(/\*\*would you want a test that fails if this stopped being true\?\*\*/);
  });

  it('gives an operational ask no anchor, no entry, and no bug', () => {
    expect(SKILL).toMatch(/no anchor, no\s+register entry, no bug/);
    expect(SKILL).toMatch(/ledger noise wearing the costume of rigour/);
  });

  it('names the reverse failure mode and tie-breaks toward behavioural', () => {
    expect(SKILL).toMatch(/the commonest mistake is treating a behavioural ask as\s+operational/);
    expect(SKILL).toMatch(/When genuinely unsure, treat it as\s+behavioural/);
  });

  it('declares the exclusion in the does-NOT-do list', () => {
    expect(SKILL).toMatch(/\*\*Does not pin operational asks\.\*\*/);
  });
});

describe('AC: the intent is recorded verbatim', () => {
  it('requires the user own words and rejects paraphrase', () => {
    expect(SKILL).toMatch(/\*\*Verbatim means verbatim\.\*\*/);
    expect(SKILL).toMatch(/A paraphrase is already the generalisation this skill exists to/);
  });
});

describe('AC: the anchor is watched failing correctly', () => {
  it('requires the anchor to fail for the right reason before the flow proceeds', () => {
    expect(SKILL).toMatch(/it must fail \*\*for the right reason\*\*/);
    expect(SKILL).toMatch(/an anchor never observed failing pins nothing/i);
  });
});

describe('AC: a subsumed anchor is retired into the register', () => {
  it('requires deleting the anchor from the suite', () => {
    expect(SKILL).toMatch(/\*\*Delete the anchor test from the suite\.\*\*/);
  });

  it('records reconciled with its landing and covering_spec_test', () => {
    expect(SKILL).toMatch(/status: reconciled/);
    expect(SKILL).toMatch(/covering_spec_test: /);
  });

  it('states the register holds words and links, never copies of tests', () => {
    expect(SKILL).toMatch(/never copies of\s+tests/);
  });
});

describe('AC: an unsubsumed anchor files a bug and is flagged', () => {
  it('routes to specflow-bugs as Type 1 or Type 4', () => {
    expect(SKILL).toMatch(/Route to\s+`specflow-bugs` — Type 1 \(missing acceptance criterion\)/);
    expect(SKILL).toMatch(/Type 4 \(missing dev spec\)/);
  });

  it('records flagged with a resolving bug id', () => {
    expect(SKILL).toMatch(/status: flagged/);
    expect(SKILL).toMatch(/flagged_bug: B-\d{3}/);
  });

  it('forbids keeping the anchor as a substitute for the missing criterion', () => {
    expect(SKILL).toMatch(/\*\*Do NOT keep the anchor running as a substitute for the missing criterion\.\*\*/);
    expect(SKILL).toMatch(/the gap would be hidden behind/);
  });
});

describe('AC: the skill is a tap on the existing flow', () => {
  it('routes the landing decision through the change-router', () => {
    expect(SKILL).toMatch(/is the \*\*router's\*\* classification, not a second decision made here/);
  });

  it('leaves the normal spec-first flow unchanged', () => {
    expect(SKILL).toMatch(/### \(b\) Run the normal flow — unchanged/);
    expect(SKILL).toMatch(/Nothing here changes\./);
  });

  it('declares it does not maintain a parallel suite', () => {
    expect(SKILL).toMatch(/\*\*Does not maintain a parallel suite\.\*\* One anchor per intent/);
  });

  it('leaves shape validation to Core and keeps subsumption as its own judgment', () => {
    expect(SKILL).toMatch(/`check\.archive-intent-register`/);
    expect(SKILL).toMatch(/subsumption is this skill's judgment/);
  });

  it('names the register file the schema defines', () => {
    expect(SKILL).toContain('.cortex/archive/intent-register.yaml');
  });

  it('carries a worked example that lands on the not-subsumed branch', () => {
    expect(SKILL).toMatch(/## Worked example/);
    const section = SKILL.slice(SKILL.indexOf('## Worked example'));
    expect(section).toMatch(/\*\*Not subsumed\.\*\*/);
  });
});
