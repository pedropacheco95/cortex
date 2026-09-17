/**
 * Spec tests — recall.recall-index as a whole: the emitted file passes its own
 * check through `validate()`, the compile is byte-stable modulo `generated`,
 * `cortex scan` builds the file (with its summary counts), `cortex validate`
 * never writes it, and a malformed file is one error while an absent one is
 * nothing. Every project is a tmp copy of the valid fixture; the real repo is
 * never touched. (`cortex init` and the post-commit tier are covered in the
 * init and refresh-fast test files respectively.)
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { validate } from '../../../src/schema/validate.js';
import { compileRecallIndex, writeRecallIndex, type RecallIndex } from '../../../src/recall/index.js';
import { run } from '../../../src/cli/cli.js';
import { serialiseThread } from '../../../src/pulse/threads.js';
import { makeThread } from '../../fixtures/threads.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VALID_FIXTURE = path.resolve(HERE, '../../fixtures/valid');

const dirs: string[] = [];
const originalCwd = process.cwd();
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.chdir(originalCwd);
  vi.restoreAllMocks();
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

function write(root: string, rel: string, body: string): string {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, 'utf-8');
  return abs;
}

/** A tmp copy of the valid fixture (R-001, schema.validator, a concept, an observation) plus a numbered schema document. */
function project(label: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cortex-recall-spec-${label}-`));
  dirs.push(root);
  copyDir(VALID_FIXTURE, root);
  write(root, 'cortex-schema.md', '## 5. Hook payload contracts\n\n## 6. Cross-reference conventions\n');
  return root;
}

const INDEX_REL = path.join('.cortex', 'recall-index.json');

/** The AC's "two decisions, one evidence file, three threads and one observation, each with resolving bears_on". */
function seedCarriers(root: string): void {
  write(root, '.cortex/atlas/evidence/2026-09-15-usage.md', [
    '---',
    'id: evidence.2026-09-15-usage',
    'title: Cortex usage over 41 sessions',
    'date: 2026-09-15T15:58:00Z',
    'kind: measurement',
    'instrument: pulse.usage',
    'bears_on: [schema.validator, "schema:§5"]',
    '---',
    '',
    '# usage',
    '',
  ].join('\n'));
  write(root, '.cortex/atlas/decisions/2026-09-01-a.md', '---\nid: decision.2026-09-01-a\ntitle: a\ndate: 2026-09-01T00:00:00Z\nbears_on: [R-001]\n---\n\n# a\n');
  write(root, '.cortex/atlas/decisions/2026-09-15-b.md', [
    '---',
    'id: decision.2026-09-15-b',
    'title: b',
    'date: 2026-09-15T00:00:00Z',
    'sources: [../evidence/2026-09-15-usage.md]',
    'bears_on: [R-001, schema.validator]',
    'supersedes: [2026-09-01-a.md]',
    '---',
    '',
    '# b',
    '',
  ].join('\n'));
  for (const [id, status] of [['T-001', 'open'], ['T-002', 'answered'], ['T-003', 'dropped']] as const) {
    const t = makeThread({ id, status, bears_on: ['R-001', '.cortex/compass/rules/R-001-sample-rule.md'] });
    if (status === 'answered') {
      t.answered = '2026-09-16T10:00:00.000Z';
      t.resolved_by = 'claude-sessions/fixture-user/s2';
    }
    write(root, `.cortex/pulse/threads/${id}-fixture.md`, serialiseThread(t));
  }
  write(root, '.cortex/insight/observations/working-style.md', [
    '---',
    'kind: insight-observation',
    "updated: '2026-09-10T09:00:00Z'",
    'salient: false',
    'sessions:',
    '  - claude-sessions/pedro/s1',
    'bears_on: [R-001, "concept:authentication"]',
    '---',
    '',
    'The working-style body.',
    '',
  ].join('\n'));
}

function stripGenerated(raw: string): string {
  return raw.replace(/^\s*"generated": "[^"]*",?\n/m, '');
}

describe('AC: the emitted file passes its own check', () => {
  it('writeRecallIndex over the AC project, then validate → the file exists and carries zero check.recall-index errors', async () => {
    const root = project('self-check');
    seedCarriers(root);
    const index = await writeRecallIndex(root);
    expect(fs.existsSync(path.join(root, INDEX_REL))).toBe(true);
    expect(index.counters.entries).toBe(10); // the AC seven plus the fixture's sample decision, scale observation and R-001 rule (fifth revision)
    expect(index.subjects['R-001']).toEqual({
      decided: ['decision.2026-09-15-b'],
      evidence: ['evidence.2026-09-15-usage'],
      threads: ['T-001'],
      observations: ['working-style'],
      rules: [],
      bugs: [],
    });
    // The fixture rule governs `.specflow/specs/**/*.spec.md`: its directory prefix is a derived subject (Rule 15a).
    expect(index.subjects['.specflow/specs']?.rules).toEqual(['R-001']);
    expect(index.subjects['schema.validator']?.evidence).toEqual(['evidence.2026-09-15-usage']);
    expect(index.subjects['concept:authentication']?.observations).toEqual(['working-style']);

    const report = await validate(root);
    expect(report.violations.filter((v) => v.check === 'check.recall-index')).toEqual([]);
  });
});

describe('AC: deterministic modulo timestamp, and empty inputs compile', () => {
  it('two writes of one project are byte-identical after removing the generated line', async () => {
    const root = project('determinism');
    seedCarriers(root);
    await writeRecallIndex(root);
    const first = fs.readFileSync(path.join(root, INDEX_REL), 'utf-8');
    await new Promise((resolve) => setTimeout(resolve, 5));
    await writeRecallIndex(root);
    const second = fs.readFileSync(path.join(root, INDEX_REL), 'utf-8');
    expect(stripGenerated(first)).toBe(stripGenerated(second));
    expect(first.endsWith('\n')).toBe(true);
  });

  it('a project with none of the four input directories yields empty subjects and entries with zero counters', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-recall-spec-empty-'));
    dirs.push(root);
    const index: RecallIndex = await compileRecallIndex(root);
    expect(index.subjects).toEqual({});
    expect(index.entries).toEqual({});
    expect(index.counters).toEqual({ subjects: 0, entries: 0, droppedRefs: 0 });
  });
});

describe('AC: scan, init and the post-commit tier all build it; validate does not (the scan and validate thirds)', () => {
  it('cortex scan writes both compiled files and reports the subject and entry counts; a second scan refreshes generated', async () => {
    const root = project('scan');
    seedCarriers(root);
    process.chdir(root);
    expect(await run(['scan'])).toBe(0);
    expect(fs.existsSync(path.join(root, '.cortex', 'constellation.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, INDEX_REL))).toBe(true);
    const first = JSON.parse(fs.readFileSync(path.join(root, INDEX_REL), 'utf-8')) as RecallIndex;
    expect(first.counters.entries).toBe(10);

    const logged = vi.mocked(console.log).mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toMatch(/recall index: \d+ subject\(s\), \d+ entr(y|ies)/);

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await run(['scan'])).toBe(0);
    const second = JSON.parse(fs.readFileSync(path.join(root, INDEX_REL), 'utf-8')) as RecallIndex;
    expect(second.generated).not.toBe(first.generated);
  });

  it('cortex validate never writes the file', async () => {
    const root = project('validate-readonly');
    seedCarriers(root);
    await writeRecallIndex(root);
    fs.rmSync(path.join(root, INDEX_REL));
    await validate(root);
    expect(fs.existsSync(path.join(root, INDEX_REL))).toBe(false);
  });
});

describe('AC: a malformed index is an error, an absent one is nothing', () => {
  it('a decided id absent from entries is one check.recall-index error naming it; after deletion, no check.recall-index violation', async () => {
    const root = project('malformed');
    seedCarriers(root);
    const index = await writeRecallIndex(root);
    index.subjects['R-001']!.decided.push('decision.gone');
    fs.writeFileSync(path.join(root, INDEX_REL), JSON.stringify(index, null, 2) + '\n', 'utf-8');

    const first = await validate(root);
    const mine = first.violations.filter((v) => v.check === 'check.recall-index');
    expect(mine).toHaveLength(1);
    expect(mine[0]?.severity).toBe('error');
    expect(mine[0]?.message).toContain('decision.gone');
    expect(first.conformant).toBe(false);

    fs.rmSync(path.join(root, INDEX_REL));
    const second = await validate(root);
    expect(second.violations.filter((v) => v.check === 'check.recall-index')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3.4 fifth revision — the compass carriers end to end (Rules 15–17): a rule
// governing src/db, an open bug affecting src/db/schema.ts, environment.md.
// ---------------------------------------------------------------------------
describe('AC: the compass carriers land in the written index and it still passes its own check (fifth revision)', () => {
  it('R-001 governs src/db/**/*.ts, B-019 affects src/db/schema.ts, environment.md has a heading → the six lists and the compass-doc entry, zero check.recall-index errors', async () => {
    const root = project('compass-carriers');
    write(root, 'src/db/schema.ts', 'export {};\n');
    write(root, 'src/db/migrate.ts', 'export {};\n');
    // The fixture rule R-001 governs the spec tree; re-point it at src/db for the criterion.
    write(root, '.cortex/compass/rules/R-001-sample-rule.md', fs.readFileSync(path.join(root, '.cortex/compass/rules/R-001-sample-rule.md'), 'utf-8').replace('".specflow/specs/**/*.spec.md"', '"src/db/**/*.ts"'));
    write(root, '.cortex/compass/bugs/B-019-schema-drift.md', [
      '---',
      'id: B-019',
      'title: Schema drift between migrate and schema',
      'type: incomplete-rule',
      'severity: high',
      'status: open',
      'affects: [src/db/schema.ts]',
      'opened: 2026-09-15T17:00:00Z',
      '---',
      '',
      '# B-019',
      '',
    ].join('\n'));
    write(root, '.cortex/compass/environment.md', '# Environment\n\n## Scheduled QA jobs\n\nthe nightly job runs against staging\n');
    const index = await writeRecallIndex(root);
    expect(index.subjects['src/db']?.rules).toEqual(['R-001']);
    expect(index.subjects['src/db/schema.ts']?.rules).toEqual(['R-001']);
    expect(index.subjects['src/db/schema.ts']?.bugs).toEqual(['B-019']);
    expect(index.entries['compass.environment']?.kind).toBe('compass-doc');
    expect(index.entries['compass.environment']?.keywords).toContain('scheduled');
    expect(index.entries['compass.environment']?.keywords).not.toContain('nightly');
    expect(index.entries['B-019']?.kind).toBe('bug');
    expect(index.entries['R-001']?.kind).toBe('rule');
    const written = JSON.parse(fs.readFileSync(path.join(root, INDEX_REL), 'utf-8')) as RecallIndex;
    expect(Object.keys(written.subjects['src/db/schema.ts'] ?? {})).toEqual(['decided', 'evidence', 'threads', 'observations', 'rules', 'bugs']);
    const report = await validate(root);
    expect(report.violations.filter((v) => v.check === 'check.recall-index')).toEqual([]);
  });
});
