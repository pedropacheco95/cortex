/**
 * Atomic tests for specflow.entry-gate — phrase-presence over the PACKAGE
 * bundle, in two halves:
 *   - the grafted gate content (Iron Law, priority rule, rationalization
 *     table) is present;
 *   - the classification machinery SURVIVED the rename — this was a `git mv`
 *     plus an additive graft, and the nine categories are the thing a rename
 *     could silently lose.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// tests/atomic/specflow/ → package root is three levels up.
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BUNDLE = path.join(PKG_ROOT, 'skills', 'specflow-entry');
const SKILL = fs.readFileSync(path.join(BUNDLE, 'SKILL.md'), 'utf-8');

describe('AC: the gate runs first, and says so', () => {
  it('is named specflow-entry in its own frontmatter', () => {
    expect(SKILL).toMatch(/^name: specflow-entry$/m);
  });

  it('carries the Iron Law verbatim with its letter-and-spirit clause', () => {
    expect(SKILL).toContain('FIND AND RUN THE RIGHT SKILL BEFORE DOING THE WORK YOURSELF');
    const after = SKILL.slice(SKILL.indexOf('FIND AND RUN THE RIGHT SKILL BEFORE DOING THE WORK YOURSELF'));
    expect(after).toMatch(/Violating the letter of this law is violating the spirit/);
  });

  it('states up front that it is the entry gate', () => {
    expect(SKILL).toMatch(/\*\*This is the entry gate\.\*\*/);
    expect(SKILL).toMatch(/Nothing else starts until\s+this has/);
  });

  it('references the shared hardening convention', () => {
    expect(SKILL).toContain('skills/_conventions/hardening.md');
  });
});

describe('AC: process skills outrank implementation skills', () => {
  it('states the priority rule as its own section', () => {
    expect(SKILL).toMatch(/## Priority: process skills before implementation skills/);
  });

  it('says why the order matters', () => {
    expect(SKILL).toMatch(/the implementation has already chosen the answer the process skill existed to determine/);
  });

  const ROUTED = ['specflow-brainstorm', 'specflow-plan', 'specflow-bugs', 'verification-before-completion', 'specflow-intent-reconcile', 'specflow-tests'];
  for (const skill of ROUTED) {
    it(`the priority table routes to ${skill}`, () => {
      expect(SKILL).toContain(skill);
    });
  }
});

describe('AC: "no skill applies" is stated, not assumed', () => {
  it('requires saying so explicitly as a routing decision', () => {
    expect(SKILL).toMatch(/When the right\s+answer is "no skill applies", say so explicitly/);
  });

  it('restates that the gate routes rather than doing the downstream work', () => {
    expect(SKILL).toMatch(/This gate does \*\*not\*\* do the downstream work itself/);
  });
});

describe('AC: the rationalization table answers the gate excuses', () => {
  it('uses the pinned two-column header form', () => {
    expect(SKILL).toMatch(/\|\s*Thought\/Excuse\s*\|\s*Reality\s*\|/);
  });

  const EXCUSES = [
    /too small to classify/,
    /already know which skill/,
    /just do it, not to route/,
    /classify after I look at the code/,
    /No skill fits this perfectly/,
    /a question, not a change/,
  ];
  for (const excuse of EXCUSES) {
    it(`answers the excuse ${excuse}`, () => {
      expect(SKILL).toMatch(excuse);
    });
  }

  it('has at least six rationalization rows', () => {
    const section = SKILL.slice(SKILL.indexOf('## Rationalization table'));
    const rows = section.split('\n').filter((l) => /^\|\s*"/.test(l));
    expect(rows.length).toBeGreaterThanOrEqual(6);
  });
});

describe('AC: the classification machinery survived the rename', () => {
  const PRESERVED = [
    ['two-layer spec model', '## The two-layer spec model (read this first)'],
    ['classification dimensions', '## Classification dimensions'],
    ['axis 1 — category', '### Axis 1 — Category'],
    ['axis 2 — layer', '### Axis 2 — Layer'],
    ['axis 3 — overview impact', '### Axis 3 — Overview impact'],
    ['enforced rules', '## Rules This Skill Enforces'],
    ['post-change test trigger', '## Post-Change Test Trigger'],
    ['output template', '## Output template for your classification'],
    ['Cortex awareness block', '## Cortex Awareness'],
    ['spec-tree reading guidance', '## Reading the Spec Tree Efficiently'],
  ] as const;

  for (const [label, phrase] of PRESERVED) {
    it(`still carries the ${label}`, () => {
      expect(SKILL).toContain(phrase);
    });
  }

  it('still carries all nine classification categories', () => {
    for (let i = 1; i <= 9; i++) {
      expect(SKILL, `Category ${i} lost in the rename`).toMatch(new RegExp(`### Category ${i}:`));
    }
  });

  it('still ships references/impact-analysis.md and its evals', () => {
    expect(fs.existsSync(path.join(BUNDLE, 'references', 'impact-analysis.md'))).toBe(true);
    expect(fs.existsSync(path.join(BUNDLE, 'evals', 'evals.json'))).toBe(true);
  });

  it('no longer calls itself the change router anywhere in the body', () => {
    expect(SKILL).not.toContain('specflow-change-router');
    expect(SKILL).not.toContain('Specflow: Change Router');
  });
});

describe('AC: no tracked file still points at the old name', () => {
  /**
   * Frozen design records and archives keep the old name by design. Beyond
   * those, a mention is allowed only when the line ANNOTATES the name as
   * historical — renamed, retired, or no-longer-shipped. Those are records and
   * retirement machinery; a BARE mention is a live pointer routing a reader to
   * a skill that no longer exists, and fails.
   */
  const HISTORICAL_FILES = [
    'cortex-v3-design.md',
    'build-order-v3.md',
    path.join('.cortex', 'atlas', 'sources', 'cortex-v3-reframe.md'),
    // This test file states the old name in its own assertions.
    path.join('tests', 'atomic', 'specflow', 'entry-gate.test.ts'),
    // The retirement machinery (B-015) must NAME the retired bundle in order
    // to delete it. Naming a skill so sync removes it is the opposite of
    // routing a reader to it.
    path.join('src', 'cli', 'scaffold.ts'),
    path.join('tests', 'atomic', 'core-cli', 'retired-bundles.test.ts'),
    path.join('tests', 'spec', 'core-cli', 'sync-retirement.spec.test.ts'),
    // The rename's own spec — it necessarily names what was renamed, including
    // in the AC that pins this very check.
    path.join('.specflow', 'specs', 'specflow', 'entry-gate.spec.md'),
  ];

  function livePointerLines(content: string): string[] {
    return content
      .split('\n')
      .filter((l) => l.includes('specflow-change-router') && !/renamed|retired|no longer ships/i.test(l));
  }

  it('the live surfaces — skills, specs, tests, indexes — name specflow-entry', () => {
    const roots = ['skills', '.claude/skills', '.specflow', 'tests', 'src', 'CLAUDE.md', 'onboarding.md'];
    const offenders: string[] = [];

    const scan = (target: string): void => {
      const abs = path.join(PKG_ROOT, target);
      if (!fs.existsSync(abs)) return;
      const stat = fs.statSync(abs);
      if (stat.isDirectory()) {
        for (const entry of fs.readdirSync(abs)) scan(path.join(target, entry));
        return;
      }
      if (!/\.(md|ts|json)$/.test(target)) return;
      if (HISTORICAL_FILES.includes(target)) return;
      if (livePointerLines(fs.readFileSync(abs, 'utf-8')).length > 0) offenders.push(target);
    };

    for (const r of roots) scan(r);
    expect(offenders, `still routing to the old name: ${offenders.join(', ')}`).toEqual([]);
  });
});
