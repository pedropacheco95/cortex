/**
 * Atomic tests — check.bears-on (schema §6, Appendix A; spec `schema.bears-on`
 * Rules 4–6). The check is called directly with a hand-built ProjectIndex and
 * clause index; every decision/evidence fixture is written into a tmp root.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { checkBearsOn } from '../../../src/schema/checks/bears-on.js';
import { buildIndex } from '../../../src/schema/index-build.js';
import { loadClauseIndex } from '../../../src/schema/clauses.js';
import type { Violation } from '../../../src/schema/types.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/hooks-harness.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`bears-on-check-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function write(root: string, rel: string, body: string): string {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, 'utf-8');
  return abs;
}

/** A decision file; `bearsOn` is spliced in verbatim as YAML. */
function decision(root: string, stem: string, bearsOnYaml?: string): string {
  const fm = [`id: decision.${stem}`, `title: ${stem}`, 'date: 2026-09-15T00:00:00Z'];
  if (bearsOnYaml !== undefined) fm.push(bearsOnYaml);
  return write(root, `.cortex/atlas/decisions/${stem}.md`, `---\n${fm.join('\n')}\n---\n\n# ${stem}\n`);
}

function evidence(root: string, stem: string, bearsOnYaml: string): string {
  const fm = [`id: evidence.${stem}`, `title: ${stem}`, 'date: 2026-09-15T00:00:00Z', 'kind: measurement', bearsOnYaml];
  return write(root, `.cortex/atlas/evidence/${stem}.md`, `---\n${fm.join('\n')}\n---\n\n# ${stem}\n`);
}

async function seed(root: string): Promise<{ index: Awaited<ReturnType<typeof buildIndex>>; clauses: ReturnType<typeof loadClauseIndex> }> {
  write(root, '.cortex/cortex.config.json', JSON.stringify({ schemaVersion: '3.4' }));
  write(root, '.cortex/compass/rules/R-001-x.md', '---\nid: R-001\ntitle: x\n---\n');
  write(root, '.specflow/specs/pulse/usage.spec.md', '---\nid: pulse.usage\n---\n');
  write(root, 'cortex-schema.md', '## 5. Hooks\n\n## 6. Cross-reference\n');
  write(root, 'src/pulse/usage.ts', 'export {};\n');
  const index = await buildIndex(root);
  return { index, clauses: loadClauseIndex(root) };
}

function ofCheck(violations: Violation[]): Violation[] {
  return violations.filter((v) => v.check === 'check.bears-on');
}

describe('AC: check.bears-on errors on a dangling gated ref and warns on the rest', () => {
  it('one error naming R-999 (rule), three warnings naming the concept, clause and path; nothing for pulse.usage', async () => {
    const root = tmp('mixed');
    const file = decision(root, '2026-09-15-x', 'bears_on: [R-999, "concept:nope", "schema:§99", src/gone.ts, pulse.usage]');
    const { index, clauses } = await seed(root);

    const violations = ofCheck(await checkBearsOn(root, index, clauses));
    expect(violations).toHaveLength(4);
    for (const v of violations) {
      expect(v.location.path).toBe(file);
      expect(v.location.key).toBe('bears_on');
    }

    const errors = violations.filter((v) => v.severity === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('"R-999"');
    expect(errors[0]!.message).toContain('(rule)');
    expect(errors[0]!.clause).toBe('§6');

    const warnings = violations.filter((v) => v.severity === 'warning');
    expect(warnings.map((v) => v.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('"concept:nope" (concept)'),
        expect.stringContaining('"schema:§99" (clause)'),
        expect.stringContaining('"src/gone.ts" (path)'),
      ]),
    );
    expect(warnings.find((v) => v.message.includes('schema:§99'))!.clause).toBe('§6.2');
    expect(violations.some((v) => v.message.includes('pulse.usage'))).toBe(false);
  });

  it('a decision whose every ref resolves yields nothing', async () => {
    const root = tmp('clean');
    decision(root, '2026-09-15-ok', 'bears_on: [R-001, "schema:§5", src/pulse/usage.ts, pulse.usage]');
    const { index, clauses } = await seed(root);
    expect(ofCheck(await checkBearsOn(root, index, clauses))).toEqual([]);
  });

  it('evidence files are the second gated carrier — the same severities apply', async () => {
    const root = tmp('evidence');
    const file = evidence(root, '2026-09-15-usage', 'bears_on: [B-999, "concept:nope"]');
    const { index, clauses } = await seed(root);
    const violations = ofCheck(await checkBearsOn(root, index, clauses));
    expect(violations.map((v) => [v.severity, v.location.path])).toEqual([
      ['error', file],
      ['warning', file],
    ]);
    expect(violations[0]!.message).toContain('"B-999" (bug)');
  });
});

describe('AC: a malformed entry is an error on a gated carrier (Rule 5)', () => {
  it('an empty string and a schema:-prefixed string that fails the grammar are each an error at key bears_on', async () => {
    const root = tmp('malformed-entries');
    const file = decision(root, '2026-09-15-a', 'bears_on: ["", "schema:§ 5"]');
    const { index, clauses } = await seed(root);
    const violations = ofCheck(await checkBearsOn(root, index, clauses));
    expect(violations).toHaveLength(2);
    for (const v of violations) {
      expect(v.severity).toBe('error');
      expect(v.location).toEqual({ path: file, key: 'bears_on' });
      expect(v.message).toMatch(/malformed bears_on entry/);
    }
    expect(violations.some((v) => v.message.includes('"schema:§ 5"'))).toBe(true);
  });

  it('a scalar bears_on (not a list) is one error at key bears_on', async () => {
    const root = tmp('malformed-scalar');
    const file = decision(root, '2026-09-15-b', 'bears_on: R-001');
    const { index, clauses } = await seed(root);
    const violations = ofCheck(await checkBearsOn(root, index, clauses));
    expect(violations).toHaveLength(1);
    expect(violations[0]!.severity).toBe('error');
    expect(violations[0]!.location).toEqual({ path: file, key: 'bears_on' });
    expect(violations[0]!.message).toMatch(/malformed bears_on/);
  });

  it('a non-string list member is malformed, and the well-formed members around it are still resolved', async () => {
    const root = tmp('malformed-member');
    decision(root, '2026-09-15-c', 'bears_on: [R-001, 42, R-999]');
    const { index, clauses } = await seed(root);
    const violations = ofCheck(await checkBearsOn(root, index, clauses));
    expect(violations.map((v) => v.severity)).toEqual(['error', 'error']);
    expect(violations.some((v) => /malformed bears_on entry/.test(v.message))).toBe(true);
    expect(violations.some((v) => v.message.includes('"R-999" (rule)'))).toBe(true);
  });
});

describe('Rule 4: only the two gated carriers, only when bears_on is present', () => {
  it('a decision with no bears_on key is not this check\'s business', async () => {
    const root = tmp('no-key');
    decision(root, '2026-09-15-none');
    const { index, clauses } = await seed(root);
    expect(ofCheck(await checkBearsOn(root, index, clauses))).toEqual([]);
  });

  it('an empty list is well-formed and yields nothing', async () => {
    const root = tmp('empty-list');
    decision(root, '2026-09-15-empty', 'bears_on: []');
    const { index, clauses } = await seed(root);
    expect(ofCheck(await checkBearsOn(root, index, clauses))).toEqual([]);
  });

  it('_index.md files under either directory are skipped', async () => {
    const root = tmp('index-skip');
    write(root, '.cortex/atlas/decisions/_index.md', '---\nbears_on: [R-999]\n---\n# Index\n');
    write(root, '.cortex/atlas/evidence/_index.md', '---\nbears_on: [R-999]\n---\n# Index\n');
    const { index, clauses } = await seed(root);
    expect(ofCheck(await checkBearsOn(root, index, clauses))).toEqual([]);
  });

  it('threads and observations carrying dangling refs produce nothing here', async () => {
    const root = tmp('ungated');
    write(root, '.cortex/pulse/threads/T-001-x.md', '---\nid: T-001\nbears_on: [src/gone.ts, R-999]\n---\n');
    write(root, '.cortex/insight/observations/scale.md', '---\nkind: insight-observation\nbears_on: [src/gone.ts, R-999]\n---\n');
    const { index, clauses } = await seed(root);
    expect(ofCheck(await checkBearsOn(root, index, clauses))).toEqual([]);
  });

  it('an absent atlas/ is tolerated', async () => {
    const root = tmp('absent');
    write(root, '.cortex/cortex.config.json', '{}');
    const index = await buildIndex(root);
    expect(await checkBearsOn(root, index, loadClauseIndex(root))).toEqual([]);
  });
});
