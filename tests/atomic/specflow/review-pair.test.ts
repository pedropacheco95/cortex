/**
 * Atomic tests for specflow.review-pair — phrase-presence over the PACKAGE
 * bundles (skills/specflow-request-review, skills/specflow-receive-review).
 *
 * The orthogonality claim (Fork 3) is the load-bearing one: tests own
 * correctness and block; review owns craft and does not — with the single
 * compass-rule exception. Both halves are asserted, in both bodies.
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

const REQUEST = body('specflow-request-review');
const RECEIVE = body('specflow-receive-review');

// ---------------------------------------------------------------------------
// AC: Both bodies carry their Iron Law and rationalization table
// ---------------------------------------------------------------------------

describe('AC: both bodies carry their Iron Law and rationalization table', () => {
  it('request-review carries its Iron Law with the letter-and-spirit clause', () => {
    expect(REQUEST).toContain('NO FINDING WITHOUT A FILE, A LINE, AND A FIX');
    const after = REQUEST.slice(REQUEST.indexOf('NO FINDING WITHOUT A FILE, A LINE, AND A FIX'));
    expect(after).toMatch(/Violating the letter of this law is violating the spirit/);
  });

  it('receive-review carries its Iron Law with the letter-and-spirit clause', () => {
    expect(RECEIVE).toContain('NO SUGGESTION APPLIED WITHOUT VERIFYING IT FIRST');
    const after = RECEIVE.slice(RECEIVE.indexOf('NO SUGGESTION APPLIED WITHOUT VERIFYING IT FIRST'));
    expect(after).toMatch(/Violating the letter of this law is violating the spirit/);
  });

  for (const [label, text] of [['request-review', REQUEST], ['receive-review', RECEIVE]] as const) {
    it(`${label} carries a two-column rationalization table`, () => {
      expect(text).toMatch(/\|\s*Thought\/Excuse\s*\|\s*Reality\s*\|/);
      const section = text.slice(text.indexOf('## Rationalization table'));
      const rows = section.split('\n').filter((l) => /^\|\s*"/.test(l));
      expect(rows.length).toBeGreaterThanOrEqual(5);
    });

    it(`${label} references the shared hardening convention`, () => {
      expect(text).toContain('skills/_conventions/hardening.md');
    });
  }
});

// ---------------------------------------------------------------------------
// AC: Review checks craft against the plan, not correctness
// ---------------------------------------------------------------------------

describe('AC: review checks craft against the plan, not correctness', () => {
  it('anchors to the plan task and the spec criterion it cites', () => {
    expect(REQUEST).toMatch(/## Scope: the diff, not the tree/);
    expect(REQUEST).toMatch(/\*\*The plan task\*\* it implements/);
    expect(REQUEST).toMatch(/\*\*The spec criterion\*\* that task cites/);
  });

  it('states that correctness belongs to the test suite', () => {
    expect(REQUEST).toMatch(/\*\*Correctness is not your job here\.\*\* The test suite owns that/);
  });

  it('scopes out code the diff did not touch', () => {
    expect(REQUEST).toMatch(/Code the diff did not touch is \*\*out of scope\*\*/);
    expect(REQUEST).toMatch(/turns every task into a refactor/);
  });

  it('reads the compass rules governing the touched files (Moderate tier)', () => {
    expect(REQUEST).toContain('.cortex/compass/rules/');
    expect(REQUEST).toMatch(/cites recorded conventions rather than your taste/);
  });

  it('requires a file, a line, and a fix in every finding', () => {
    expect(REQUEST).toMatch(/\*\*Where\*\* — file and line\./);
    expect(REQUEST).toMatch(/\*\*Instead\*\* — what to do about it\./);
    expect(REQUEST).toMatch(/A finding without a fix is a complaint/);
  });
});

// ---------------------------------------------------------------------------
// AC: A suspected correctness problem becomes a missing-test signal
// ---------------------------------------------------------------------------

describe('AC: a suspected correctness problem becomes a missing-test signal', () => {
  it('forbids writing a correctness verdict', () => {
    expect(REQUEST).toMatch(/Do not write a correctness verdict/);
  });

  it('routes it to specflow-bugs as a probable Type 1 or Type 7', () => {
    expect(REQUEST).toMatch(/\*\*missing-test signal\*\*/);
    expect(REQUEST).toMatch(/`specflow-bugs`/);
    expect(REQUEST).toMatch(/Type 1 — missing acceptance criterion, or Type 7/);
  });
});

// ---------------------------------------------------------------------------
// AC: Findings do not block a passing change, except on a compass-rule violation
// ---------------------------------------------------------------------------

describe('AC: findings do not block a passing change, except a compass-rule violation', () => {
  it('states that nothing blocks a change whose tests pass, with one exception', () => {
    expect(REQUEST).toMatch(/\*\*Nothing here blocks a change whose tests pass — with one exception\.\*\*/);
  });

  it('names the compass-rule violation as the load-bearing exception', () => {
    expect(REQUEST).toMatch(/\*\*violates a compass rule\*\* is load-bearing/);
  });

  it('feeds the load-bearing finding into the develop review ladder', () => {
    expect(REQUEST).toMatch(/`specflow-develop`\s+review ladder/);
  });

  it('separates load-bearing from craft findings in its output shape', () => {
    expect(REQUEST).toMatch(/\*\*Load-bearing\*\* \(compass-rule violations only\)/);
    expect(REQUEST).toMatch(/\*\*Craft findings\*\* \(non-blocking\)/);
  });
});

// ---------------------------------------------------------------------------
// AC: A questionable suggestion is verified before it is applied
// ---------------------------------------------------------------------------

describe('AC: a questionable suggestion is verified before it is applied', () => {
  it('names the failure mode it exists to prevent', () => {
    expect(RECEIVE).toMatch(/## The failure this prevents/);
    expect(RECEIVE).toMatch(/A review suggestion is a \*\*claim about your code/);
  });

  it('gives a per-claim verification table naming spec, rules, and a test', () => {
    expect(RECEIVE).toMatch(/\|\s*The suggestion claims\s*\|\s*Check it against\s*\|/);
    expect(RECEIVE).toContain('.cortex/compass/rules/');
    expect(RECEIVE).toMatch(/The spec's acceptance criterion, read as written/);
  });

  it('has three outcomes: apply, reject with the reason, escalate', () => {
    expect(RECEIVE).toMatch(/\*\*Apply\*\* — the claim held/);
    expect(RECEIVE).toMatch(/\*\*Reject\*\* — the claim did not hold\. Say what you checked/);
    expect(RECEIVE).toMatch(/\*\*Escalate\*\* — you cannot tell/);
  });

  it('forbids guessing or silently dropping an undecidable finding', () => {
    expect(RECEIVE).toMatch(/Do not guess and do not silently drop it/);
  });

  it('declares that it does not accept by default', () => {
    expect(RECEIVE).toMatch(/\*\*Does not accept by default\.\*\* Every suggestion is checked\./);
  });
});

// ---------------------------------------------------------------------------
// AC: Disagreement is settled by evidence
// ---------------------------------------------------------------------------

describe('AC: disagreement is settled by evidence', () => {
  it('names the spec, the compass rule, or a runnable command as the tiebreaker', () => {
    expect(RECEIVE).toMatch(/the tiebreaker is \*\*the spec, the compass rule, or a\s+command either of you can run\*\*/);
  });

  it('rejects seniority and confidence as tiebreakers', () => {
    expect(RECEIVE).toMatch(/Not seniority\./);
    expect(RECEIVE).toMatch(/confidence is\s+uncorrelated with correctness/);
  });

  it('escalates a compass-rule violation to the develop review ladder', () => {
    expect(RECEIVE).toMatch(/\*\*compass-rule violation\*\* — that is\s+gated project law/);
  });
});

// ---------------------------------------------------------------------------
// AC: Neither carries an insight instruction
// ---------------------------------------------------------------------------

describe('AC: neither carries an insight instruction', () => {
  for (const [label, text] of [['request-review', REQUEST], ['receive-review', RECEIVE]] as const) {
    it(`${label} contains no cortex insight instruction`, () => {
      expect(text).not.toContain('cortex insight');
    });
  }
});
