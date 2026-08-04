/**
 * Atomic tests for the spec-first spine — specflow.brainstorm-skill,
 * specflow.plan-skill, and specflow.develop-split. Phrase-presence assertions
 * over the PACKAGE bundles (skills/specflow-*, the source of truth).
 *
 * The develop block has two halves, because develop-split is a *move*: the
 * planning half must be GONE from develop and PRESENT in plan, while the
 * execution half and the whole Cortex-awareness block survived untouched.
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
function bundleFiles(name: string): string[] {
  const dir = path.join(PKG_ROOT, 'skills', name);
  const out: string[] = [];
  const walk = (d: string, prefix = ''): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(d, e.name), path.join(prefix, e.name));
      else out.push(path.join(prefix, e.name));
    }
  };
  walk(dir);
  return out.sort();
}

const BRAINSTORM = body('specflow-brainstorm');
const PLAN = body('specflow-plan');
const DEVELOP = body('specflow-develop');

// ===========================================================================
// specflow.brainstorm-skill
// ===========================================================================

describe('AC: no code before an agreed design and a spec', () => {
  it('carries the Iron Law verbatim with its letter-and-spirit clause', () => {
    expect(BRAINSTORM).toContain('NO IMPLEMENTATION BEFORE AN AGREED DESIGN AND A SPEC');
    const after = BRAINSTORM.slice(BRAINSTORM.indexOf('NO IMPLEMENTATION BEFORE AN AGREED DESIGN AND A SPEC'));
    expect(after).toMatch(/Violating the letter of this law is violating the spirit/);
  });

  it('states the gate as an explicit HARD GATE', () => {
    expect(BRAINSTORM).toMatch(/## HARD GATE/);
    expect(BRAINSTORM).toMatch(/Do NOT write implementation code until the developer has agreed a design and the spec exists\./);
  });

  it('carries the too-simple anti-pattern paragraph', () => {
    expect(BRAINSTORM).toMatch(/too simple to need a spec/i);
  });

  it('references the shared hardening convention', () => {
    expect(BRAINSTORM).toContain('skills/_conventions/hardening.md');
  });
});

describe('AC: questions arrive one at a time', () => {
  it('requires one question per message, preferring multiple choice', () => {
    expect(BRAINSTORM).toMatch(/\*\*One question per message\.\*\*/);
    expect(BRAINSTORM).toMatch(/Prefer multiple choice/);
  });

  it('says why a batch of questions fails', () => {
    expect(BRAINSTORM).toMatch(/A batch of five questions is not efficiency/);
  });
});

describe('AC: an over-large ask is decomposed before exploration', () => {
  it('runs a scope check before exploring', () => {
    expect(BRAINSTORM).toMatch(/## Step 1: Scope check/);
    expect(BRAINSTORM.indexOf('## Step 1: Scope check')).toBeLessThan(
      BRAINSTORM.indexOf('## Step 2: Ground in what is already agreed'),
    );
  });

  it('decomposes and names the pieces, one leaf spec per behaviour', () => {
    expect(BRAINSTORM).toMatch(/\*\*decomposed and named\*\*/);
    expect(BRAINSTORM).toMatch(/one leaf spec per behaviour \(RULES 13\)/);
  });
});

describe('AC: approaches come with a recommendation', () => {
  it('requires two or three real approaches, not strawmen', () => {
    expect(BRAINSTORM).toMatch(/\*\*two or three real approaches\*\*/);
    expect(BRAINSTORM).toMatch(/not one plan flanked by strawmen/);
  });

  it('requires a stated recommendation while the developer chooses', () => {
    expect(BRAINSTORM).toMatch(/\*\*state which you would choose and why\*\*/);
    expect(BRAINSTORM).toMatch(/A recommendation is not a decision; the\s+developer chooses/);
  });
});

describe('AC: the terminal state is a spec, not a design doc', () => {
  it('hands off to specflow-spec-editor for the dev spec and its business spec', () => {
    expect(BRAINSTORM).toMatch(/hand it to \*\*`specflow-spec-editor`\*\*/);
    expect(BRAINSTORM).toMatch(/the business spec it `implements:`/);
  });

  it('explicitly refuses to write a dated design document', () => {
    expect(BRAINSTORM).toMatch(/Does not write a dated design document/);
  });

  it('names the next stages of the spine', () => {
    expect(BRAINSTORM).toContain('specflow-plan');
    expect(BRAINSTORM).toContain('specflow-develop');
  });
});

describe('AC: existing agreements are surfaced first', () => {
  it('requires surfacing a conflict before proposing approaches', () => {
    expect(BRAINSTORM).toMatch(/\*\*Surface conflicts before proposing\.\*\*/);
    expect(BRAINSTORM).toMatch(/re-decides it on their behalf/);
  });

  it('reads atlas decisions and compass rules for the area', () => {
    expect(BRAINSTORM).toContain('.cortex/atlas/decisions/');
    expect(BRAINSTORM).toContain('.cortex/compass/rules/');
  });

  it('is index-first and carries the insight trust caveat (Moderate tier)', () => {
    expect(BRAINSTORM).toContain('.cortex/_index.md');
    expect(BRAINSTORM).toContain('cortex insight');
    expect(BRAINSTORM).toMatch(/inferred context, not authority/);
    expect(BRAINSTORM).toMatch(/gated layers/);
  });
});

describe('AC: the rationalization table answers the gate excuses (brainstorm)', () => {
  it('uses the pinned two-column header form', () => {
    expect(BRAINSTORM).toMatch(/\|\s*Thought\/Excuse\s*\|\s*Reality\s*\|/);
  });

  const EXCUSES = [
    /user already knows what they want/,
    /one-line change, a spec is overkill/,
    /one at a time is slow/,
    /just do it/,
    /design is obvious from the request/,
  ];
  for (const excuse of EXCUSES) {
    it(`answers the excuse ${excuse}`, () => {
      expect(BRAINSTORM).toMatch(excuse);
    });
  }

  it('carries a worked example', () => {
    expect(BRAINSTORM).toMatch(/## Worked example/);
  });
});

// ===========================================================================
// specflow.plan-skill
// ===========================================================================

describe('AC: an approved spec produces a durable task list', () => {
  it('carries the Iron Law verbatim with its letter-and-spirit clause', () => {
    expect(PLAN).toContain('NO PLAN THAT A FRESH AGENT COULD NOT EXECUTE BLIND');
    const after = PLAN.slice(PLAN.indexOf('NO PLAN THAT A FRESH AGENT COULD NOT EXECUTE BLIND'));
    expect(after).toMatch(/Violating the letter of this law is violating the spirit/);
  });

  it('requires every task to cite its criterion and its verification command', () => {
    expect(PLAN).toMatch(/\*\*Every task cites its criterion\.\*\*/);
    expect(PLAN).toMatch(/\*\*Every task names its verification command\.\*\*/);
  });

  it('gives the task template with criterion, files, change, and verify', () => {
    expect(PLAN).toMatch(/\*\*Criterion:\*\*/);
    expect(PLAN).toMatch(/\*\*Files:\*\*/);
    expect(PLAN).toMatch(/\*\*Verify:\*\*/);
  });

  it('names a durable plan-artefact location that is not pulse or the spec tree', () => {
    expect(PLAN).toMatch(/plans\/<YYYY-MM-DD>-<slug>\.md/);
    expect(PLAN).not.toContain('.cortex/pulse/plans');
    expect(PLAN).not.toContain('.specflow/plans');
  });
});

describe('AC: the plan is executable blind', () => {
  it('states the fresh-agent test explicitly', () => {
    expect(PLAN).toMatch(/The test is literal: an agent with no memory of the conversation/);
  });

  it('rejects vague tasks by example', () => {
    expect(PLAN).toMatch(/"Update the validator" is not a task/);
  });
});

describe('AC: tasks are bite-sized and individually verifiable', () => {
  it('requires ~2-5 minute tasks that leave the project working', () => {
    expect(PLAN).toMatch(/2–5 minutes each, and each leaves the project in a working state/);
  });

  it('states that an unverifiable task is two tasks', () => {
    expect(PLAN).toMatch(/A task that cannot be verified on its own is two tasks/);
  });
});

describe('AC: a task without a criterion is a signal, not a task', () => {
  it('routes an uncovered task to specflow-bugs as a possible Type 1', () => {
    expect(PLAN).toMatch(/route it to `specflow-bugs` as a possible Type 1/);
    expect(PLAN).toMatch(/Do not plan it silently/);
  });
});

describe('AC: the migrated planning content is present', () => {
  const MIGRATED = [
    ['Explore step', '## Step 2: Explore'],
    ['exploration summary', '### Exploration Summary'],
    ['exploration agents', 'spawn exploration agents in parallel'],
    ['component diagram', 'ASCII component diagram'],
    ['gap analysis', '## Step 3: Gap analysis'],
    ['research', '## Step 4: Research'],
    ['size check', '## Step 5: Size check'],
    ['size heuristic', '≤ 3 specs and ≤ 2,000 lines'],
    ['scope levels', '**At slice scope:**'],
  ] as const;

  for (const [label, phrase] of MIGRATED) {
    it(`carries the migrated ${label}`, () => {
      expect(PLAN).toContain(phrase);
    });
  }

  it('ships references/planning-protocol.md in this bundle', () => {
    expect(bundleFiles('specflow-plan')).toContain('references/planning-protocol.md');
  });

  it('keeps the orchestration-depth cap', () => {
    expect(PLAN).toMatch(/sub-agents cannot spawn sub-agents/);
    expect(PLAN).toMatch(/\*\*split into batches\*\*/);
  });
});

describe('AC: the plan writes nothing but the plan', () => {
  it('declares that it does not write code and hands off to develop', () => {
    expect(PLAN).toMatch(/\*\*Does not write code\.\*\* It hands the plan to `specflow-develop`/);
  });
});

describe('AC: Cortex awareness at Deep tier (plan)', () => {
  it('is index-first', () => {
    expect(PLAN).toContain('.cortex/_index.md');
  });

  it('names all three v3 insight verbs with the trust caveat', () => {
    expect(PLAN).toContain('cortex insight file');
    expect(PLAN).toContain('cortex insight concept');
    expect(PLAN).toContain('cortex insight element');
    expect(PLAN).toMatch(/inferred context, not\s+authority/);
    expect(PLAN).toMatch(/gated layers/);
  });

  it('collects compass rules including check: predicates, and atlas decisions', () => {
    expect(PLAN).toMatch(/`check:` predicate/);
    expect(PLAN).toContain('.cortex/atlas/decisions/');
  });

  it('carries a rationalization table', () => {
    expect(PLAN).toMatch(/\|\s*Thought\/Excuse\s*\|\s*Reality\s*\|/);
  });
});

// ===========================================================================
// specflow.develop-split — the planning half is gone
// ===========================================================================

describe('AC: the planning half is gone from develop', () => {
  const REMOVED = [
    ['Explore step heading', '### Step 1: Explore'],
    ['Plan step heading', '### Step 2: Plan'],
    ['gap-analysis sub-step', '#### 2a. Gap analysis'],
    ['research sub-step', '#### 2b. Research'],
    ['implementation-plan sub-step', '#### 2c. Implementation plan'],
    ['size-check heading', '### Step 3: Size Check'],
    ['exploration summary', '### Exploration Summary'],
  ] as const;

  for (const [label, phrase] of REMOVED) {
    it(`no longer carries the ${label}`, () => {
      expect(DEVELOP).not.toContain(phrase);
    });
  }

  it('no longer ships references/planning-protocol.md', () => {
    expect(bundleFiles('specflow-develop')).not.toContain('references/planning-protocol.md');
  });

  it('declares that it does not plan', () => {
    expect(DEVELOP).toMatch(/\*\*Does not plan\.\*\*/);
  });
});

describe('AC: the execution half of develop is intact', () => {
  const KEPT = [
    ['principle: passing test means correct', '**A test that passes means the code is correct.**'],
    ['principle: minimum code', '**Write the minimum code that passes the tests.**'],
    ['principle: code all gaps', '**Code ALL gaps, then document them.**'],
    ['principle: self-similar', '**The skill is self-similar.**'],
    ['Cortex awareness block', '## Cortex Awareness'],
    ['index-first', '.cortex/_index.md'],
    ['cortex validate before finishing', '**Validate before finishing.**'],
    ['gap report home', '.cortex/pulse/gaps.md'],
    ['depth calibration', '## Depth Calibration'],
    ['execute step', '### Step 4: Execute (leaf agents only)'],
    ['verification cascade', '## The Verification Cascade'],
    ['gap documentation reference', 'references/gap-documentation.md'],
  ] as const;

  for (const [label, phrase] of KEPT) {
    it(`still carries the ${label}`, () => {
      expect(DEVELOP).toContain(phrase);
    });
  }

  it('still names all three v3 insight verbs with the trust caveat', () => {
    expect(DEVELOP).toContain('cortex insight file');
    expect(DEVELOP).toContain('cortex insight concept');
    expect(DEVELOP).toContain('cortex insight element');
    expect(DEVELOP).toMatch(/inferred context, not authority/);
  });
});

describe('AC: Minimal depth still runs without a plan artefact', () => {
  it('permits running from the spec and test at Minimal depth', () => {
    expect(DEVELOP).toMatch(/you may run from the spec and its test\s+with no plan artefact/);
  });

  it('requires a plan artefact above Minimal', () => {
    expect(DEVELOP).toMatch(/Above Minimal, a plan artefact is required/);
  });
});

// ===========================================================================
// specflow.develop-split — the review ladder
// ===========================================================================

describe('AC: review is two-stage, compliance before quality', () => {
  it('has the ladder as a numbered step', () => {
    expect(DEVELOP).toMatch(/### Step 6: The review ladder/);
  });

  it('requires spec compliance then quality', () => {
    expect(DEVELOP).toMatch(/\*\*Stage 1 — spec compliance\.\*\*/);
    expect(DEVELOP).toMatch(/\*\*Stage 2 — quality\.\*\*/);
  });

  it('states that stage 1 gates stage 2', () => {
    expect(DEVELOP).toMatch(/\*\*Stage 1 gates stage 2\.\*\*/);
  });
});

describe('AC: load-bearing is defined', () => {
  it('defines it as failing a criterion, breaking behaviour, or violating a rule', () => {
    const section = DEVELOP.slice(DEVELOP.indexOf('#### What is load-bearing'));
    expect(section).toMatch(/fail a spec acceptance criterion/);
    expect(section).toMatch(/break an existing behaviour/);
    expect(section).toMatch(/violate a compass rule/);
  });

  it('states that craft feedback never gates correctness', () => {
    expect(DEVELOP).toMatch(/Craft feedback never gates correctness; tests do that/);
  });
});

describe('AC: the ladder escalates at round four', () => {
  it('resumes the implementer for rounds 1-3 and starts a fresh stronger one at 4', () => {
    expect(DEVELOP).toMatch(/\| 1–3 \| The implementer that wrote the code, resumed with the finding \|/);
    expect(DEVELOP).toMatch(/\| 4–5 \| A \*\*fresh\*\* implementer on a stronger model/);
  });

  it('says why continuing in the same context fails', () => {
    expect(DEVELOP).toMatch(/that context\s+has a wrong assumption in it/);
  });
});

describe('AC: a load-bearing finding surviving five rounds halts the work', () => {
  it('stops with BLOCKED and reports the rounds attempted', () => {
    expect(DEVELOP).toMatch(/\*\*STOP\. Report BLOCKED\.\*\*/);
    expect(DEVELOP).toMatch(/what each\s+round attempted, why each attempt failed/);
  });

  it('states that BLOCKED is a successful outcome', () => {
    expect(DEVELOP).toMatch(/\*\*BLOCKED is a successful outcome\.\*\*/);
  });

  it('lets non-load-bearing findings through as gaps', () => {
    expect(DEVELOP).toMatch(/Non-load-bearing findings that survive five rounds are recorded as gaps/);
  });

  it('surfaces BLOCKED in what the human receives', () => {
    expect(DEVELOP).toMatch(/or a \*\*BLOCKED\*\* report when/);
  });
});

describe('AC: an untested gap does not halt the work (Fork 1 coexistence)', () => {
  it('states both stop-rules together and why they do not conflict', () => {
    expect(DEVELOP).toMatch(/## Two stop-rules, and why both hold/);
    expect(DEVELOP).toMatch(/\*\*\(a\) Code all gaps, never block\.\*\* Fires \*while implementing\*/);
    expect(DEVELOP).toMatch(/\*\*\(b\) Stop after 5 rounds\.\*\* Fires \*after\* implementing/);
  });

  it('names the discriminator in one line', () => {
    expect(DEVELOP).toMatch(/Undiscovered-and-untested → implement and record\. Known-and-resisting-fix → stop and report\./);
  });
});

describe('AC: watch it fail correctly, and delete premature code (develop)', () => {
  it('requires observing the right failure before implementing', () => {
    expect(DEVELOP).toMatch(/### Step 3: Watch the test fail first/);
    expect(DEVELOP).toMatch(/\*\*broken, not red\*\*/);
  });

  it('requires deleting premature code rather than adapting it', () => {
    expect(DEVELOP).toMatch(/\*\*Delete premature code\.\*\*/);
    expect(DEVELOP).toMatch(/Do not adapt it/);
  });
});

describe('AC: the ladder carries its rationalization table', () => {
  it('uses the pinned two-column header form', () => {
    const section = DEVELOP.slice(DEVELOP.indexOf('### Step 6: The review ladder'));
    expect(section).toMatch(/\|\s*Thought\/Excuse\s*\|\s*Reality\s*\|/);
  });

  const EXCUSES = [
    /One more round will do it/,
    /not \*really\* load-bearing/,
    /reviewer is being pedantic/,
    /Reporting BLOCKED looks like I failed/,
    /fresh agent at round 4 wastes/,
  ];
  for (const excuse of EXCUSES) {
    it(`answers the excuse ${excuse}`, () => {
      expect(DEVELOP).toMatch(excuse);
    });
  }
});
