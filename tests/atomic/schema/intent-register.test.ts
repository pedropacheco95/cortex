/**
 * Atomic tests for check.archive-intent-register (archive.intent-register;
 * cortex-schema.md §4.4.3, new at schema 3.2). Exercised through the
 * registered validator over handcrafted tmp .cortex/ trees, following the
 * same pattern as tests/atomic/schema/archive.test.ts.
 *
 * Note on what a green run here means: every negative case below feeds the
 * check a register that is wrong in one specific way and asserts the error.
 * The suite therefore fails if the check stops rejecting bad input, which is
 * the property worth pinning — not merely that a good register passes.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { validate } from '../../../src/schema/validate.js';
import { makeTmpDir, cleanTmp, makeCortexProject } from '../../fixtures/hooks-harness.js';
import type { Violation } from '../../../src/schema/types.js';

const CHECK = 'check.archive-intent-register';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`intent-register-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

/** A minimal project with an archive/ module and the landing targets an entry can cite. */
function makeProject(root: string, opts: { schemaVersion?: string } = {}): void {
  makeCortexProject(root, {
    config: { schemaVersion: opts.schemaVersion ?? '3.0' },
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
}

/** A dev spec the register's `landing` can point at, with one AC heading. */
function writeSpec(root: string): void {
  const p = path.join(root, '.specflow', 'specs', 'demo', 'thing.spec.md');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(
    p,
    `---
id: demo.thing
status: implemented
implements: ../../specs-business/demo/outcome.business.md
---

# Thing

## Acceptance Criteria

### Password requires one uppercase

- **Given** a password
`,
  );
}

function writeRule(root: string, id = 'R-001'): void {
  const p = path.join(root, '.cortex', 'compass', 'rules', `${id}-demo-rule.md`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `---\nid: ${id}\n---\n\n# Demo rule\n`);
}

function writeBug(root: string, id = 'B-001'): void {
  const p = path.join(root, '.cortex', 'compass', 'bugs', `${id}-demo-bug.md`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `---\nid: ${id}\n---\n\n# Demo bug\n`);
}

function writeCoveringTest(root: string): string {
  const rel = path.join('tests', 'atomic', 'demo', 'password.test.ts');
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, '// covering spec test\n');
  return rel;
}

function writeRegister(root: string, yaml: string): void {
  fs.writeFileSync(path.join(root, '.cortex', 'archive', 'intent-register.yaml'), yaml, 'utf-8');
}

async function violations(root: string): Promise<Violation[]> {
  const report = await validate(root, { root });
  return report.violations.filter((v) => v.check === CHECK);
}

// ---------------------------------------------------------------------------
// AC: A well-formed register validates clean
// ---------------------------------------------------------------------------

describe('AC: a well-formed register validates clean', () => {
  it('accepts a reconciled entry whose landing, criterion, and covering test all resolve', async () => {
    const root = tmp('valid');
    makeProject(root);
    writeSpec(root);
    const coveringTest = writeCoveringTest(root);
    writeRegister(
      root,
      `entries:
  - id: IR-001
    stated_intent: "the password needs one uppercase"
    date: 2026-08-04
    stakeholder: pedro
    anchor_test: tests/atomic/demo/anchor.test.ts::"one uppercase"
    status: reconciled
    landing: demo.thing#Password requires one uppercase
    covering_spec_test: ${coveringTest}
`,
    );
    expect(await violations(root)).toEqual([]);
  });

  it('accepts a flagged entry whose landing is a compass rule and whose bug resolves', async () => {
    const root = tmp('valid-flagged');
    makeProject(root);
    writeRule(root);
    writeBug(root, 'B-014');
    writeRegister(
      root,
      `entries:
  - id: IR-002
    stated_intent: "never log the raw token"
    date: 2026-08-04
    anchor_test: tests/atomic/demo/anchor.test.ts::"no raw token"
    status: flagged
    landing: R-001
    flagged_bug: B-014
`,
    );
    expect(await violations(root)).toEqual([]);
  });

  it('accepts a landing that cites a spec with no criterion fragment', async () => {
    const root = tmp('valid-no-fragment');
    makeProject(root);
    writeSpec(root);
    const coveringTest = writeCoveringTest(root);
    writeRegister(
      root,
      `entries:
  - id: IR-003
    stated_intent: "x"
    date: 2026-08-04
    anchor_test: tests/a.test.ts::"x"
    status: reconciled
    landing: demo.thing
    covering_spec_test: ${coveringTest}
`,
    );
    expect(await violations(root)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// AC: An absent register is not a violation
// ---------------------------------------------------------------------------

describe('AC: an absent register is not a violation', () => {
  it('raises nothing when intent-register.yaml does not exist', async () => {
    const root = tmp('absent');
    makeProject(root);
    expect(fs.existsSync(path.join(root, '.cortex', 'archive', 'intent-register.yaml'))).toBe(false);
    expect(await violations(root)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// AC: A pending entry needs no landing
// ---------------------------------------------------------------------------

describe('AC: a pending entry needs no landing', () => {
  it('accepts a pending entry with no landing, covering test, or bug', async () => {
    const root = tmp('pending');
    makeProject(root);
    writeRegister(
      root,
      `entries:
  - id: IR-004
    stated_intent: "the export must be idempotent"
    date: 2026-08-04
    anchor_test: tests/atomic/demo/anchor.test.ts::"idempotent export"
    status: pending
`,
    );
    expect(await violations(root)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// AC: A dangling landing is an error
// ---------------------------------------------------------------------------

describe('AC: a dangling landing is an error', () => {
  it('errors when the landing names a spec id that does not exist', async () => {
    const root = tmp('dangling-landing');
    makeProject(root);
    const coveringTest = writeCoveringTest(root);
    writeRegister(
      root,
      `entries:
  - id: IR-005
    stated_intent: "x"
    date: 2026-08-04
    anchor_test: tests/a.test.ts::"x"
    status: reconciled
    landing: demo.does-not-exist
    covering_spec_test: ${coveringTest}
`,
    );
    const v = await violations(root);
    expect(v.length).toBeGreaterThan(0);
    expect(v.some((x) => x.message.includes('IR-005') && x.message.includes('does not resolve'))).toBe(true);
    expect(v[0]?.severity).toBe('error');
    expect(v[0]?.clause).toBe('§4.4.3');
  });

  it('errors when the landing names a rule id with no file under compass/rules/', async () => {
    const root = tmp('dangling-rule');
    makeProject(root);
    writeBug(root, 'B-014');
    writeRegister(
      root,
      `entries:
  - id: IR-006
    stated_intent: "x"
    date: 2026-08-04
    anchor_test: tests/a.test.ts::"x"
    status: flagged
    landing: R-999
    flagged_bug: B-014
`,
    );
    const v = await violations(root);
    expect(v.some((x) => x.message.includes('IR-006') && x.message.includes('names no rule'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC: A landing criterion that does not exist in the spec is an error
// ---------------------------------------------------------------------------

describe('AC: a landing criterion that does not exist in the spec is an error', () => {
  it('errors when the spec resolves but has no such acceptance-criterion heading', async () => {
    const root = tmp('missing-criterion');
    makeProject(root);
    writeSpec(root);
    const coveringTest = writeCoveringTest(root);
    writeRegister(
      root,
      `entries:
  - id: IR-007
    stated_intent: "x"
    date: 2026-08-04
    anchor_test: tests/a.test.ts::"x"
    status: reconciled
    landing: demo.thing#No such criterion
    covering_spec_test: ${coveringTest}
`,
    );
    const v = await violations(root);
    expect(v.some((x) => x.message.includes('IR-007') && x.message.includes('No such criterion'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC: A reconciled entry without its covering test is an error
// ---------------------------------------------------------------------------

describe('AC: a reconciled entry without its covering test is an error', () => {
  it('errors when covering_spec_test is missing entirely', async () => {
    const root = tmp('reconciled-no-test');
    makeProject(root);
    writeSpec(root);
    writeRegister(
      root,
      `entries:
  - id: IR-008
    stated_intent: "x"
    date: 2026-08-04
    anchor_test: tests/a.test.ts::"x"
    status: reconciled
    landing: demo.thing
`,
    );
    const v = await violations(root);
    expect(v.some((x) => x.message.includes('IR-008') && x.message.includes('requires "covering_spec_test"'))).toBe(true);
  });

  it('errors when the covering_spec_test path does not exist on disk', async () => {
    const root = tmp('reconciled-bad-path');
    makeProject(root);
    writeSpec(root);
    writeRegister(
      root,
      `entries:
  - id: IR-009
    stated_intent: "x"
    date: 2026-08-04
    anchor_test: tests/a.test.ts::"x"
    status: reconciled
    landing: demo.thing
    covering_spec_test: tests/atomic/demo/nope.test.ts::"x"
`,
    );
    const v = await violations(root);
    expect(v.some((x) => x.message.includes('IR-009') && x.message.includes('does not exist'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC: A flagged entry without a resolving bug is an error
// ---------------------------------------------------------------------------

describe('AC: a flagged entry without a resolving bug is an error', () => {
  it('errors when flagged_bug is missing', async () => {
    const root = tmp('flagged-no-bug');
    makeProject(root);
    writeRule(root);
    writeRegister(
      root,
      `entries:
  - id: IR-010
    stated_intent: "x"
    date: 2026-08-04
    anchor_test: tests/a.test.ts::"x"
    status: flagged
    landing: R-001
`,
    );
    const v = await violations(root);
    expect(v.some((x) => x.message.includes('IR-010') && x.message.includes('requires "flagged_bug"'))).toBe(true);
  });

  it('errors when flagged_bug names no file under compass/bugs/', async () => {
    const root = tmp('flagged-bad-bug');
    makeProject(root);
    writeRule(root);
    writeRegister(
      root,
      `entries:
  - id: IR-011
    stated_intent: "x"
    date: 2026-08-04
    anchor_test: tests/a.test.ts::"x"
    status: flagged
    landing: R-001
    flagged_bug: B-999
`,
    );
    const v = await violations(root);
    expect(v.some((x) => x.message.includes('IR-011') && x.message.includes('names no bug'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC: Malformed entries are caught
// ---------------------------------------------------------------------------

describe('AC: malformed entries are caught', () => {
  it('errors on a duplicate IR id', async () => {
    const root = tmp('dup-id');
    makeProject(root);
    writeRegister(
      root,
      `entries:
  - id: IR-020
    stated_intent: "a"
    date: 2026-08-04
    anchor_test: tests/a.test.ts::"a"
    status: pending
  - id: IR-020
    stated_intent: "b"
    date: 2026-08-04
    anchor_test: tests/a.test.ts::"b"
    status: pending
`,
    );
    const v = await violations(root);
    expect(v.some((x) => x.message.includes('duplicate entry id "IR-020"'))).toBe(true);
  });

  it('errors on a malformed id', async () => {
    const root = tmp('bad-id');
    makeProject(root);
    writeRegister(
      root,
      `entries:
  - id: intent-1
    stated_intent: "a"
    date: 2026-08-04
    anchor_test: tests/a.test.ts::"a"
    status: pending
`,
    );
    const v = await violations(root);
    expect(v.some((x) => x.message.includes('is not of the form IR-NNN'))).toBe(true);
  });

  it('errors on a non-ISO date', async () => {
    const root = tmp('bad-date');
    makeProject(root);
    writeRegister(
      root,
      `entries:
  - id: IR-021
    stated_intent: "a"
    date: "August 2026"
    anchor_test: tests/a.test.ts::"a"
    status: pending
`,
    );
    const v = await violations(root);
    expect(v.some((x) => x.message.includes('is not an ISO calendar date'))).toBe(true);
  });

  it('errors on an unknown status', async () => {
    const root = tmp('bad-status');
    makeProject(root);
    writeRegister(
      root,
      `entries:
  - id: IR-022
    stated_intent: "a"
    date: 2026-08-04
    anchor_test: tests/a.test.ts::"a"
    status: retired
`,
    );
    const v = await violations(root);
    expect(v.some((x) => x.message.includes('not in enum'))).toBe(true);
  });

  it('errors on missing required fields', async () => {
    const root = tmp('missing-fields');
    makeProject(root);
    writeRegister(root, `entries:\n  - id: IR-023\n    status: pending\n`);
    const v = await violations(root);
    const joined = v.map((x) => x.message).join('\n');
    expect(joined).toContain('missing required field "stated_intent"');
    expect(joined).toContain('missing required field "date"');
    expect(joined).toContain('missing required field "anchor_test"');
  });

  it('errors when entries is not a list', async () => {
    const root = tmp('entries-not-list');
    makeProject(root);
    writeRegister(root, `entries: nope\n`);
    const v = await violations(root);
    expect(v.some((x) => x.message.includes('"entries" must be a list'))).toBe(true);
  });

  it('errors when entries is missing', async () => {
    const root = tmp('no-entries');
    makeProject(root);
    writeRegister(root, `something_else: 1\n`);
    const v = await violations(root);
    expect(v.some((x) => x.message.includes('missing required field "entries"'))).toBe(true);
  });

  it('still resolves links in sibling entries when one entry is malformed', async () => {
    const root = tmp('partial');
    makeProject(root);
    writeSpec(root);
    writeRegister(
      root,
      `entries:
  - id: bad-id
    stated_intent: "a"
    date: 2026-08-04
    anchor_test: tests/a.test.ts::"a"
    status: pending
  - id: IR-024
    stated_intent: "b"
    date: 2026-08-04
    anchor_test: tests/a.test.ts::"b"
    status: reconciled
    landing: demo.nonexistent
    covering_spec_test: tests/nope.test.ts
`,
    );
    const v = await violations(root);
    expect(v.some((x) => x.message.includes('is not of the form IR-NNN'))).toBe(true);
    expect(v.some((x) => x.message.includes('IR-024') && x.message.includes('does not resolve'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC: A 3.1 project still validates clean (the bump is additive)
// ---------------------------------------------------------------------------

describe('AC: the 3.2 bump is additive', () => {
  for (const version of ['3.0', '3.1']) {
    it(`a ${version} project with no register raises no intent-register violation`, async () => {
      const root = tmp(`additive-${version}`);
      makeProject(root, { schemaVersion: version });
      expect(await violations(root)).toEqual([]);
    });
  }
});
