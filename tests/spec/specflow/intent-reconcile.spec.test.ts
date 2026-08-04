/**
 * Spec test for specflow.intent-reconcile AC "Both branches are exercised by
 * fixtures" (plan §3 item 4.2: "a fixture pair (anchor subsumed / anchor not
 * subsumed) exercising both branches").
 *
 * One register, two entries — the subsumed branch retired into `reconciled`
 * with its covering spec test, and the generalised-away branch `flagged` with
 * the missing-criterion bug it filed. Both must validate clean, and each must
 * still be rejected when its own branch-specific evidence is removed: the pair
 * is only meaningful if the two branches are actually distinguishable.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { validate } from '../../../src/schema/validate.js';
import { makeTmpDir, cleanTmp, makeCortexProject } from '../../fixtures/hooks-harness.js';

const CHECK = 'check.archive-intent-register';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`intent-pair-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

/**
 * A project holding everything both branches cite: the spec the asks landed
 * in (with one real acceptance-criterion heading), the covering spec test on
 * disk, and the bug the flagged branch filed.
 */
function makePairProject(root: string): void {
  makeCortexProject(root, {
    config: { schemaVersion: '3.0' },
    modules: ['anatomy', 'compass', 'atlas', 'pulse', 'archive'],
  });

  const archive = path.join(root, '.cortex', 'archive');
  fs.mkdirSync(path.join(archive, 'types'), { recursive: true });
  fs.mkdirSync(path.join(archive, 'documents'), { recursive: true });
  fs.writeFileSync(
    path.join(archive, '_index.md'),
    "# Archive — index\n\n**Read this when:** you need an ingested document.\n\n**What's here:**\n- register.md\n\n**How to navigate:** start at register.md.\n",
  );
  fs.writeFileSync(path.join(archive, 'register.md'), '# Archive register\n\n(none)\n');

  const spec = path.join(root, '.specflow', 'specs', 'auth', 'password-policy.spec.md');
  fs.mkdirSync(path.dirname(spec), { recursive: true });
  fs.writeFileSync(
    spec,
    `---
id: auth.password-policy
status: implemented
implements: ../../specs-business/auth/accounts-stay-secure.business.md
---

# Password policy

## Acceptance Criteria

### Password complexity is enforced

- **Given** a password without an uppercase letter
`,
  );

  const coveringTest = path.join(root, 'tests', 'spec', 'auth', 'password-policy.test.ts');
  fs.mkdirSync(path.dirname(coveringTest), { recursive: true });
  fs.writeFileSync(coveringTest, '// the spec-derived test that subsumes IR-001\n');

  const bug = path.join(root, '.cortex', 'compass', 'bugs', 'B-021-export-leaks-deleted-rows.md');
  fs.mkdirSync(path.dirname(bug), { recursive: true });
  fs.writeFileSync(bug, '---\nid: B-021\n---\n\n# Export leaks soft-deleted rows\n');
}

function writeRegister(root: string, yaml: string): void {
  fs.writeFileSync(path.join(root, '.cortex', 'archive', 'intent-register.yaml'), yaml, 'utf-8');
}

async function checkViolations(root: string): Promise<string[]> {
  const report = await validate(root, { root });
  return report.violations.filter((v) => v.check === CHECK).map((v) => v.message);
}

/** IR-001: the ask the spec test genuinely requires — anchor retired. */
const SUBSUMED = `  - id: IR-001
    stated_intent: "the password needs one uppercase"
    date: 2026-08-04
    stakeholder: pedro
    anchor_test: tests/atomic/auth/anchor.test.ts::"the password needs one uppercase"
    status: reconciled
    landing: auth.password-policy#Password complexity is enforced
    covering_spec_test: tests/spec/auth/password-policy.test.ts
`;

/** IR-007: the ask the spec generalised away — bug filed, entry flagged. */
const NOT_SUBSUMED = `  - id: IR-007
    stated_intent: "the export must never include soft-deleted rows"
    date: 2026-08-04
    stakeholder: pedro
    anchor_test: tests/atomic/export/anchor.test.ts::"the export must never include soft-deleted rows"
    status: flagged
    landing: auth.password-policy
    flagged_bug: B-021
`;

describe('AC: both branches are exercised by fixtures', () => {
  it('a register carrying one reconciled and one flagged entry validates clean', async () => {
    const root = tmp('both');
    makePairProject(root);
    writeRegister(root, `entries:\n${SUBSUMED}${NOT_SUBSUMED}`);
    expect(await checkViolations(root)).toEqual([]);
  });

  it('the subsumed branch is rejected without its covering spec test', async () => {
    const root = tmp('subsumed-stripped');
    makePairProject(root);
    writeRegister(
      root,
      `entries:\n${SUBSUMED.split('\n').filter((l) => !l.includes('covering_spec_test')).join('\n')}`,
    );
    const messages = await checkViolations(root);
    expect(messages.some((m) => m.includes('IR-001') && m.includes('requires "covering_spec_test"'))).toBe(true);
  });

  it('the flagged branch is rejected without its filed bug', async () => {
    const root = tmp('flagged-stripped');
    makePairProject(root);
    writeRegister(
      root,
      `entries:\n${NOT_SUBSUMED.split('\n').filter((l) => !l.includes('flagged_bug')).join('\n')}`,
    );
    const messages = await checkViolations(root);
    expect(messages.some((m) => m.includes('IR-007') && m.includes('requires "flagged_bug"'))).toBe(true);
  });

  it('the two branches require different evidence — neither satisfies the other', async () => {
    const root = tmp('crossed');
    makePairProject(root);
    // A reconciled entry offering only a flagged entry's evidence, and vice versa.
    writeRegister(
      root,
      `entries:
  - id: IR-001
    stated_intent: "the password needs one uppercase"
    date: 2026-08-04
    anchor_test: tests/atomic/auth/anchor.test.ts::"one uppercase"
    status: reconciled
    landing: auth.password-policy
    flagged_bug: B-021
  - id: IR-007
    stated_intent: "the export must never include soft-deleted rows"
    date: 2026-08-04
    anchor_test: tests/atomic/export/anchor.test.ts::"no deleted rows"
    status: flagged
    landing: auth.password-policy
    covering_spec_test: tests/spec/auth/password-policy.test.ts
`,
    );
    const messages = await checkViolations(root);
    expect(messages.some((m) => m.includes('IR-001') && m.includes('requires "covering_spec_test"'))).toBe(true);
    expect(messages.some((m) => m.includes('IR-007') && m.includes('requires "flagged_bug"'))).toBe(true);
  });
});
