/**
 * Atomic tests for specflow.bugs-root-cause-gate and specflow.tests-red-green —
 * phrase-presence assertions over the PACKAGE bundles (skills/specflow-*, the
 * source of truth; byte-identity with .claude/skills/ is the spec tier's job).
 *
 * Both specs are "prepend a gate, change nothing else" grafts, so each block
 * has two halves: the grafted mechanism is present, AND the pre-existing
 * contract (seven types, tree, templates, ledger path, check: predicates,
 * five phases, report path) survived the graft intact.
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

const BUGS = body('specflow-bugs');
const TESTS = body('specflow-tests');

// ===========================================================================
// specflow.bugs-root-cause-gate
// ===========================================================================

describe('AC: the Iron Law and its clause are present (specflow-bugs)', () => {
  it('carries the Iron Law verbatim on one line', () => {
    expect(BUGS).toContain('NO CLASSIFICATION WITHOUT ROOT CAUSE FIRST');
  });

  it('follows it with the letter-and-spirit clause', () => {
    const after = BUGS.slice(BUGS.indexOf('NO CLASSIFICATION WITHOUT ROOT CAUSE FIRST'));
    expect(after).toMatch(/Violating the letter of this law is violating the spirit/);
  });

  it('states the law before the diagnostic machinery', () => {
    expect(BUGS.indexOf('NO CLASSIFICATION WITHOUT ROOT CAUSE FIRST')).toBeLessThan(
      BUGS.indexOf('## Phase 2: The Seven Bug Types'),
    );
  });

  it('references the shared hardening convention', () => {
    expect(BUGS).toContain('skills/_conventions/hardening.md');
  });
});

describe('AC: the four Phase-1 steps are each named', () => {
  it('has a Phase 1 section that precedes the seven-type tree', () => {
    const phase1 = BUGS.indexOf('## Phase 1: Root-Cause Investigation');
    expect(phase1).toBeGreaterThan(-1);
    expect(phase1).toBeLessThan(BUGS.indexOf('## Phase 2: The Seven Bug Types'));
  });

  it('step 1 — read the actual error, not a paraphrase', () => {
    expect(BUGS).toMatch(/\*\*1\. Read the actual error\.\*\*/);
    expect(BUGS).toMatch(/Not the user's paraphrase/);
  });

  it('step 2 — reproduce it', () => {
    expect(BUGS).toMatch(/\*\*2\. Reproduce it\.\*\*/);
  });

  it('step 3 — check what changed recently', () => {
    expect(BUGS).toMatch(/\*\*3\. Check what changed recently\.\*\*/);
  });

  it('step 4 — instrument the component boundaries', () => {
    expect(BUGS).toMatch(/\*\*4\. Instrument the component boundaries\.\*\*/);
  });

  it('distinguishes observing the faulty component from reasoning about it', () => {
    expect(BUGS).toMatch(/observing which\s+component \*is\* at fault|is not step 4/);
  });
});

describe('AC: root-cause evidence precedes the type', () => {
  it('states the gate as an explicit stop before naming a type or writing the ledger', () => {
    expect(BUGS).toMatch(/### HARD GATE/);
    expect(BUGS).toMatch(/Do NOT name a bug type, and do NOT write a ledger file, until Phase 1 has produced evidence\./);
  });

  it('carries the too-simple anti-pattern paragraph', () => {
    expect(BUGS).toMatch(/too simple to need investigation/i);
  });

  it('requires the evidence to travel into the ledger entry with the classification', () => {
    expect(BUGS).toMatch(/\*\*The evidence travels with the classification\.\*\*/);
    expect(BUGS).toMatch(/tell your\s+diagnosis from a guess|diagnosis from a guess/);
  });

  it('runs Phase 1 on the test-failure-triage entry point too', () => {
    expect(BUGS).toMatch(/\*\*Run Phase 1 on the failure, then classify\.\*\*/);
  });
});

describe('AC: symptoms with no reproduction are not classified', () => {
  it('directs data-gathering rather than classification when it cannot reproduce', () => {
    expect(BUGS).toMatch(/\*\*If you could not reproduce it:\*\*/);
    expect(BUGS).toMatch(/Do \*\*not\*\* assign a confident type on the strength of\s+the report alone/);
  });

  it('names an unreproduced report a data-gathering task, not a diagnosis', () => {
    expect(BUGS).toMatch(/data-gathering task, not a diagnosis/);
  });
});

describe('AC: the rationalization table answers the gate excuses (specflow-bugs)', () => {
  it('uses the pinned two-column header form', () => {
    const section = BUGS.slice(BUGS.indexOf('### Rationalization table'));
    expect(section).toMatch(/\|\s*Thought\/Excuse\s*\|\s*Reality\s*\|/);
  });

  const EXCUSES = [
    /The fix is obvious/,
    /stack trace is just noise/,
    /same as the bug we fixed last week/,
    /Reproducing it is slow/,
    /user already told me what's wrong/,
  ];

  for (const excuse of EXCUSES) {
    it(`answers the excuse ${excuse}`, () => {
      expect(BUGS).toMatch(excuse);
    });
  }

  it('has at least five rationalization rows', () => {
    const section = BUGS.slice(BUGS.indexOf('### Rationalization table'));
    const rows = section.split('\n').filter((l) => /^\|\s*"/.test(l));
    expect(rows.length).toBeGreaterThanOrEqual(5);
  });
});

describe('AC: the existing diagnostic machinery is preserved (specflow-bugs)', () => {
  const PRESERVED = [
    ['seven-type table', 'Every bug in a Specflow project traces to exactly one of these root causes'],
    ['diagnostic tree', '## The Diagnostic Tree'],
    ['change-plan templates', '## Change Plan Templates'],
    ['test-failure triage', '## Test Failure Triage'],
    ['ledger path', '.cortex/compass/bugs/B-NNN-<slug>.md'],
    ['never-fix boundary', '**This skill diagnoses. It does not fix.**'],
  ] as const;

  for (const [label, phrase] of PRESERVED) {
    it(`still carries the ${label}`, () => {
      expect(BUGS).toContain(phrase);
    });
  }

  it('still lists all seven bug types', () => {
    for (const t of [
      'Missing acceptance criterion',
      'Incomplete rule',
      'Wrong rule',
      'Missing dev spec',
      'Missing business spec',
      'Layer drift',
      'Correct spec, wrong/missing test',
    ]) {
      expect(BUGS).toContain(t);
    }
  });

  it('notes "escalate on the way out" as deferred, not built here', () => {
    expect(BUGS).toMatch(/escalate on the way out/i);
    expect(BUGS).toMatch(/do not build it inside this skill/i);
  });
});

// ===========================================================================
// specflow.tests-red-green
// ===========================================================================

describe('AC: the Iron Law and its clause are present (specflow-tests)', () => {
  it('carries the Iron Law verbatim on one line', () => {
    expect(TESTS).toContain(
      'NO TEST ENTERS THE SUITE UNTIL IT HAS BEEN WATCHED FAILING FOR THE RIGHT REASON',
    );
  });

  it('follows it with the letter-and-spirit clause', () => {
    const after = TESTS.slice(
      TESTS.indexOf('NO TEST ENTERS THE SUITE UNTIL IT HAS BEEN WATCHED FAILING FOR THE RIGHT REASON'),
    );
    expect(after).toMatch(/Violating the letter of this law is violating the spirit/);
  });

  it('references the shared hardening convention', () => {
    expect(TESTS).toContain('skills/_conventions/hardening.md');
  });
});

describe('AC: a new test is observed failing before code exists', () => {
  it('has the watch-it-fail-correctly mechanism as a four-step procedure', () => {
    expect(TESTS).toMatch(/#### Watch it fail correctly/);
    expect(TESTS).toMatch(/Every new test is run \*\*before\*\* its implementation exists/);
    expect(TESTS).toMatch(/Only then write the implementation\./);
  });

  it('names reading the failure message as the step that gets skipped', () => {
    expect(TESTS).toMatch(/\*\*Read the failure message\.\*\*/);
    expect(TESTS).toMatch(/"It failed" is not the\s+observation/);
  });

  it('states that a green-only test is not yet evidence', () => {
    expect(TESTS).toMatch(/only ever been seen passing is not yet evidence/);
  });

  it('wires the mechanism into the generation-agent rules', () => {
    expect(TESTS).toMatch(/Watch every new test fail for the right reason before implementing/);
  });
});

describe('AC: the failure must be the right failure', () => {
  it('classifies wrong-reason failures as broken, not red', () => {
    expect(TESTS).toMatch(/\*\*broken, not red\*\*/);
  });

  const WRONG_REASONS = [/Cannot find module/, /misspelled symbol/, /fixture or factory that does not exist/, /crash in `beforeEach`/];

  for (const reason of WRONG_REASONS) {
    it(`enumerates the wrong-reason failure ${reason}`, () => {
      expect(TESTS).toMatch(reason);
    });
  }

  it('requires fixing and re-observing the right failure', () => {
    expect(TESTS).toMatch(/re-run it, and observe the \*right\* failure/);
  });
});

describe('AC: premature code is deleted, not adapted', () => {
  it('requires deletion and rewrite after the test is red', () => {
    expect(TESTS).toMatch(/\*\*Delete premature code\.\*\*/);
    expect(TESTS).toMatch(/delete it and\s+rewrite it after the test is red/);
  });

  it('forbids adapting or reusing it as a starting point', () => {
    expect(TESTS).toMatch(/do not "use it as a starting\s+point"/);
  });

  it('states why adapting is worse — the code shapes the test', () => {
    expect(TESTS).toMatch(/pulls the test toward describing what the code does/);
  });
});

describe('AC: the observation is recorded', () => {
  it('adds a red-first section to the verification report template', () => {
    expect(TESTS).toMatch(/## Red-first observation/);
  });

  it('reports a never-seen-failing test as unverified rather than counting it', () => {
    expect(TESTS).toMatch(/never silently counted as covered/);
    expect(TESTS).toMatch(/reported as \*\*unverified\*\*/);
  });
});

describe('AC: the rationalization table answers the mechanism excuses (specflow-tests)', () => {
  it('uses the pinned two-column header form', () => {
    const section = TESTS.slice(TESTS.indexOf('#### Watch it fail correctly'));
    expect(section).toMatch(/\|\s*Thought\/Excuse\s*\|\s*Reality\s*\|/);
  });

  const EXCUSES = [
    /code already exists, so writing the test first is pointless/,
    /that's good enough — I don't need to read why/,
    /Running it twice is slow/,
    /assertion is obviously correct/,
    /Deleting working code to rewrite it is wasteful/,
  ];

  for (const excuse of EXCUSES) {
    it(`answers the excuse ${excuse}`, () => {
      expect(TESTS).toMatch(excuse);
    });
  }
});

describe('AC: the existing contract is preserved (specflow-tests)', () => {
  const PRESERVED = [
    ['a test that does not execute principle', '**A test that does not execute is not a test.**'],
    ['fake test scan', '#### 3b. Fake test scan'],
    ['adversarial quality check', '#### 3d. Adversarial quality check'],
    ['verification report path', '.cortex/pulse/reports/verification.md'],
    ['writer/verifier split', '**Hand off to a separate verification agent.**'],
  ] as const;

  for (const [label, phrase] of PRESERVED) {
    it(`still carries the ${label}`, () => {
      expect(TESTS).toContain(phrase);
    });
  }

  it('still names all four test layers', () => {
    for (const layer of ['**Atomic**', '**Spec**', '**Journey**', '**Scenario**']) {
      expect(TESTS).toContain(layer);
    }
  });

  it('still instructs incorporating compass check: predicates (cortex-awareness bridge 1)', () => {
    expect(TESTS).toMatch(/check:/);
  });

  it('still has all five phases', () => {
    for (const phase of ['Phase 0:', 'Phase 1:', 'Phase 2:', 'Phase 3:', 'Phase 4:']) {
      expect(TESTS).toContain(phase);
    }
  });
});
