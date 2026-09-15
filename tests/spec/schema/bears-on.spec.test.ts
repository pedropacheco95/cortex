/**
 * Spec tests — schema.bears-on as a whole, through `validate()` over a copy of
 * the valid fixture: the check is wired into the run, the clause index is built
 * once for the run and shared, ungated carriers are left alone, and no stored
 * inverse is recognised by any check. Every project is a tmp copy.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { validate } from '../../../src/schema/validate.js';
import { serialiseThread } from '../../../src/pulse/threads.js';
import { makeThread } from '../../fixtures/threads.js';

// `import * as fs` yields a sealed namespace under ESM, so the read counter is a
// partial module mock: the real readFileSync, wrapped so calls can be counted.
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});
const readFileSpy = fs.readFileSync as unknown as ReturnType<typeof vi.fn>;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VALID_FIXTURE = path.resolve(HERE, '../../fixtures/valid');

const dirs: string[] = [];
afterEach(() => {
  readFileSpy.mockClear();
  while (dirs.length > 0) fs.rmSync(dirs.pop() as string, { recursive: true, force: true });
});

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

/** A tmp copy of the valid fixture with a numbered schema document at its root. */
function project(label: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cortex-bears-on-${label}-`));
  dirs.push(root);
  copyDir(VALID_FIXTURE, root);
  fs.writeFileSync(
    path.join(root, 'cortex-schema.md'),
    '## 5. Hooks\n\n## 6. Cross-reference conventions\n\n### 6.2 Addressable schema clauses\n',
    'utf-8',
  );
  return root;
}

function write(root: string, rel: string, body: string): string {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, 'utf-8');
  return abs;
}

function decision(root: string, stem: string, extraYaml: string): string {
  return write(
    root,
    `.cortex/atlas/decisions/${stem}.md`,
    `---\nid: decision.${stem}\ntitle: ${stem}\ndate: 2026-09-15T00:00:00Z\n${extraYaml}\n---\n\n# ${stem}\n`,
  );
}

/** The one dev-spec id the valid fixture carries — stands in for the AC's `pulse.usage`. */
const FIXTURE_SPEC_ID = 'schema.validator';

describe('AC: check.bears-on errors on a dangling gated ref and warns on the rest', () => {
  it('the report carries one error (R-999, rule), three warnings, nothing for the resolving spec id; conformant is false', async () => {
    const root = project('mixed');
    const file = decision(root, '2026-09-15-x', `bears_on: [R-999, "concept:nope", "schema:§99", src/gone.ts, ${FIXTURE_SPEC_ID}]`);

    const report = await validate(root);
    const mine = report.violations.filter((v) => v.check === 'check.bears-on');

    expect(mine.every((v) => v.location.path === file)).toBe(true);
    const errors = mine.filter((v) => v.severity === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('"R-999" (rule)');
    const warnings = mine.filter((v) => v.severity === 'warning').map((v) => v.message);
    expect(warnings).toHaveLength(3);
    expect(warnings.join('\n')).toContain('"concept:nope" (concept)');
    expect(warnings.join('\n')).toContain('"schema:§99" (clause)');
    expect(warnings.join('\n')).toContain('"src/gone.ts" (path)');
    expect(mine.some((v) => v.message.includes(FIXTURE_SPEC_ID))).toBe(false);
    expect(report.conformant).toBe(false);
  });

  it('the untouched valid fixture (no bears_on anywhere) stays conformant — the check is present-tolerant', async () => {
    const root = project('baseline');
    const report = await validate(root);
    expect(report.violations.filter((v) => v.check === 'check.bears-on')).toEqual([]);
    expect(report.conformant).toBe(true);
  });

  it('a decision whose refs all resolve — a rule, a clause, a concept from the fixture insight, a spec id — keeps the tree conformant', async () => {
    const root = project('clean');
    decision(root, '2026-09-15-ok', `bears_on: [R-001, "schema:§6.2", "concept:authentication", ${FIXTURE_SPEC_ID}, .cortex/compass/]`);
    const report = await validate(root);
    expect(report.violations.filter((v) => v.check === 'check.bears-on')).toEqual([]);
    expect(report.conformant).toBe(true);
  });
});

describe('AC: a malformed entry is an error on a gated carrier', () => {
  it('each of the two files carries a check.bears-on error at key bears_on', async () => {
    const root = project('malformed');
    const a = decision(root, '2026-09-15-a', 'bears_on: ["", "schema:§ 5"]');
    const b = decision(root, '2026-09-15-b', 'bears_on: R-001');

    const report = await validate(root);
    const mine = report.violations.filter((v) => v.check === 'check.bears-on' && v.severity === 'error');
    expect(mine.filter((v) => v.location.path === a && v.location.key === 'bears_on').length).toBeGreaterThan(0);
    expect(mine.filter((v) => v.location.path === b && v.location.key === 'bears_on').length).toBeGreaterThan(0);
    expect(report.conformant).toBe(false);
  });
});

describe('AC: threads and observations are not resolved by the validator', () => {
  it('no check.bears-on violation for either file; their own checks accept the well-shaped lists', async () => {
    const root = project('ungated');
    const thread = write(
      root,
      '.cortex/pulse/threads/T-001-x.md',
      serialiseThread(makeThread({ id: 'T-001', bears_on: ['src/gone.ts', 'R-999'] })),
    );
    const obsPath = path.join(root, '.cortex', 'insight', 'observations', 'scale.md');
    const obs = fs.readFileSync(obsPath, 'utf-8').replace('salient: false\n', 'salient: false\nbears_on:\n  - src/gone.ts\n  - R-999\n');
    fs.writeFileSync(obsPath, obs, 'utf-8');

    const report = await validate(root);
    expect(report.violations.filter((v) => v.check === 'check.bears-on')).toEqual([]);
    expect(report.violations.filter((v) => v.location.path === thread && v.location.key === 'bears_on')).toEqual([]);
    expect(report.violations.filter((v) => v.location.path === obsPath && v.location.key === 'bears_on')).toEqual([]);
  });
});

describe('AC: the clause index is loaded once for the whole run', () => {
  it('four decisions carrying eight schema: refs between them → cortex-schema.md read once', async () => {
    const root = project('once');
    const refs = ['"schema:§5"', '"schema:§6"', '"schema:§6.2"', '"schema:§99"'];
    for (let i = 0; i < 4; i++) {
      decision(root, `2026-09-15-d${i}`, `bears_on: [${refs[i]}, ${refs[(i + 1) % 4]}]`);
    }
    const docPath = path.join(root, 'cortex-schema.md');
    readFileSpy.mockClear();

    const report = await validate(root);

    const opens = readFileSpy.mock.calls.filter((c) => String(c[0]) === docPath).length;
    expect(opens).toBe(1);
    // Every §99 ref still resolved (against the cached index) to a warning.
    const stale = report.violations.filter((v) => v.check === 'check.bears-on' && v.message.includes('schema:§99'));
    expect(stale).toHaveLength(2);
    expect(stale.every((v) => v.severity === 'warning' && v.clause === '§6.2')).toBe(true);
  });
});

describe('AC: no artefact may carry a stored inverse', () => {
  it('decided_by is not recognised by any check — no violation, no resolution', async () => {
    const root = project('inverse');
    const file = decision(root, '2026-09-15-inv', 'decided_by: [R-001, R-999]\nbears_on: [R-001]');
    const report = await validate(root);
    expect(report.violations.filter((v) => v.location.path === file)).toEqual([]);
    expect(report.violations.some((v) => /decided_by/.test(v.message) || v.location.key === 'decided_by')).toBe(false);
    expect(report.conformant).toBe(true);
  });
});
