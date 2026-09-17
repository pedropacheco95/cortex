/**
 * Atomic tests — the compass carriers of the recall index (`recall.recall-index`
 * Rules 15–17, 3.4 fifth revision; schema §4.11 entailment 4). Rules derive
 * their subjects from `governs` and `related_specs`, bugs from `affects`
 * (open and triaged only), and the four compass documents are keyword-only
 * entries built from headings and bold spans. Every carrier is written by
 * hand into a tmp root; the compiler is called directly.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  compileRecallIndex,
  scanCarriers,
  RECALL_ENTRY_KINDS,
  RULE_GOVERNS_SUBJECT_CAP,
  COMPASS_DOC_FILES,
  COMPASS_DOC_KEYWORD_CAP,
  docKeywords,
} from '../../../src/recall/index.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/hooks-harness.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`recall-compass-${label}`);
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

function rule(root: string, id: string, slug: string, yaml: string[]): void {
  write(root, `.cortex/compass/rules/${id}-${slug}.md`, `---\nid: ${id}\ntitle: ${slug.replace(/-/g, ' ')}\n${yaml.join('\n')}\n---\n\n# ${id}\n\nBody prose that must never become a keyword.\n`);
}

function bug(root: string, id: string, status: string, affects: string[], extra: string[] = []): void {
  const yaml = [`id: ${id}`, `title: Bug ${id}`, 'type: incomplete-rule', 'severity: high', `status: ${status}`, `affects: [${affects.map((a) => JSON.stringify(a)).join(', ')}]`, ...extra];
  write(root, `.cortex/compass/bugs/${id}-x.md`, `---\n${yaml.join('\n')}\n---\n\n# ${id}\n`);
}

function seed(root: string): void {
  write(root, '.cortex/cortex.config.json', JSON.stringify({ schemaVersion: '3.4' }));
  write(root, '.specflow/specs/core-cli/scan.spec.md', '---\nid: core-cli.scan\n---\n');
  write(root, '.specflow/specs/schema/validator.spec.md', '---\nid: schema.validator\n---\n');
  write(root, 'src/db/schema.ts', 'export {};\n');
  write(root, 'src/db/migrate.ts', 'export {};\n');
  write(root, 'src/schema/checks/xref.ts', 'export {};\n');
}

describe('Rule 1: the seven entry kinds and the six subject lists', () => {
  it('RECALL_ENTRY_KINDS is the §4.11 enum in order', () => {
    expect([...RECALL_ENTRY_KINDS]).toEqual(['decision', 'evidence', 'thread', 'observation', 'rule', 'compass-doc', 'bug']);
  });

  it('every subject carries rules and bugs, empty when nothing contributes', async () => {
    const root = tmp('six-lists');
    seed(root);
    write(root, '.cortex/atlas/decisions/2026-09-01-a.md', '---\nid: decision.2026-09-01-a\ntitle: a\ndate: 2026-09-01T00:00:00Z\nbears_on: [core-cli.scan]\n---\n');
    const index = await compileRecallIndex(root);
    expect(index.subjects['core-cli.scan']).toEqual({ decided: ['decision.2026-09-01-a'], evidence: [], threads: [], observations: [], rules: [], bugs: [] });
  });
});

// ---------------------------------------------------------------------------
// Rule 15 — rules are carriers with derived subjects
// ---------------------------------------------------------------------------
describe('AC: a rule bears on its governs prefixes, its matched files and its related specs', () => {
  it('R-014 governing src/db/**/*.ts with related_specs [core-cli.scan] reaches src/db, both files and the spec', async () => {
    const root = tmp('rule-derived');
    seed(root);
    rule(root, 'R-014', 'x', ['governs:', '  - "src/db/**/*.ts"', 'related_specs: [core-cli.scan]']);
    const index = await compileRecallIndex(root);
    for (const key of ['src/db', 'src/db/schema.ts', 'src/db/migrate.ts', 'core-cli.scan']) {
      expect(index.subjects[key]?.rules, key).toEqual(['R-014']);
    }
    const entry = index.entries['R-014'];
    expect(entry?.kind).toBe('rule');
    expect(entry?.date).toBe('');
    expect(entry?.title).toBe('x');
    expect(entry?.path).toBe('.cortex/compass/rules/R-014-x.md');
    expect(entry?.keywords).toEqual(expect.arrayContaining(['src/db', 'src/db/schema.ts', 'src/db/migrate.ts', 'core-cli.scan']));
    expect(entry?.keywords).not.toContain('prose');
    expect(index.counters.droppedRefs).toBe(0);
  });

  it('a first-segment prefix (src/**) is a directory subject even though it has no slash; a bare **/*.ts yields no prefix', async () => {
    const root = tmp('rule-prefix');
    seed(root);
    rule(root, 'R-001', 'core', ['governs:', '  - "src/**"', '  - "**/*.md"']);
    const index = await compileRecallIndex(root);
    expect(index.subjects['src']?.rules).toEqual(['R-001']);
    expect(index.subjects['src/db/schema.ts']?.rules).toEqual(['R-001']);
    expect(Object.keys(index.subjects)).not.toContain('');
    expect(Object.keys(index.subjects)).not.toContain('**');
  });

  it('a prefix that is not an existing directory, and a related spec absent from the index, contribute nothing and count as dropped', async () => {
    const root = tmp('rule-missing');
    seed(root);
    rule(root, 'R-002', 'gone', ['governs:', '  - "src/gone/**/*.ts"', 'related_specs: [nowhere.spec]']);
    const index = await compileRecallIndex(root);
    expect(index.subjects['src/gone']).toBeUndefined();
    expect(index.subjects['nowhere.spec']).toBeUndefined();
    expect(index.entries['R-002']?.kind).toBe('rule');
    expect(index.counters.droppedRefs).toBe(1);
  });

  it('governs as a bare string and a trailing-slash prefix are tolerated', async () => {
    const root = tmp('rule-shapes');
    seed(root);
    rule(root, 'R-003', 'str', ['governs: "src/db/*"']);
    const index = await compileRecallIndex(root);
    expect(index.subjects['src/db']?.rules).toEqual(['R-003']);
    expect(index.subjects['src/db/schema.ts']?.rules).toEqual(['R-003']);
  });
});

describe('AC: a governs glob matching 30 files caps at 20 subjects, and a retired rule contributes nothing', () => {
  it('exactly the first 20 sorted files carry the rule, plus the directory prefix; the retired rule has neither entry nor subject', async () => {
    const root = tmp('rule-cap');
    seed(root);
    for (let i = 1; i <= 30; i++) write(root, `src/many/f${String(i).padStart(2, '0')}.ts`, 'export {};\n');
    rule(root, 'R-020', 'many', ['governs:', '  - "src/many/**/*.ts"']);
    rule(root, 'R-021', 'retired', ['status: retired', 'governs:', '  - "src/many/**/*.ts"']);
    expect(RULE_GOVERNS_SUBJECT_CAP).toBe(20);
    const index = await compileRecallIndex(root);
    const fileSubjects = Object.keys(index.subjects).filter((k) => k.startsWith('src/many/') && index.subjects[k]?.rules.includes('R-020'));
    expect(fileSubjects).toHaveLength(20);
    expect(fileSubjects.sort()).toEqual(Array.from({ length: 20 }, (_, i) => `src/many/f${String(i + 1).padStart(2, '0')}.ts`));
    expect(index.subjects['src/many']?.rules).toEqual(['R-020']);
    expect(index.entries['R-021']).toBeUndefined();
    expect(Object.values(index.subjects).some((s) => s.rules.includes('R-021'))).toBe(false);
    expect(scanCarriers(root).map((c) => c.id)).not.toContain('R-021');
  });
});

// ---------------------------------------------------------------------------
// Rule 16 — compass documents are keyword-only carriers
// ---------------------------------------------------------------------------
describe('AC: a compass document is a keyword-only entry built from headings and bold spans', () => {
  const ENVIRONMENT = [
    '# Environment',
    '',
    'Operational pointers only. The **registry path** lives here.',
    '',
    '## Scheduled QA jobs',
    '',
    'the nightly job runs against staging',
    '',
    '```',
    '# not a heading: fenced',
    '```',
    '',
  ].join('\n');

  it('entries["compass.environment"] carries the heading and bold tokens and never a body token; no subject names it', async () => {
    const root = tmp('doc-env');
    seed(root);
    write(root, '.cortex/compass/environment.md', ENVIRONMENT);
    const index = await compileRecallIndex(root);
    const entry = index.entries['compass.environment'];
    expect(entry).toMatchObject({ kind: 'compass-doc', title: 'Environment', date: '', path: '.cortex/compass/environment.md' });
    expect(entry?.keywords).toEqual(expect.arrayContaining(['scheduled', 'jobs', 'registry', 'path', 'environment']));
    for (const body of ['nightly', 'staging', 'operational', 'pointers', 'fenced', 'heading']) expect(entry?.keywords).not.toContain(body);
    expect(Object.values(index.subjects).every((s) => !s.rules.includes('compass.environment') && !s.bugs.includes('compass.environment'))).toBe(true);
    expect(index.counters.droppedRefs).toBe(0);
  });

  it('only the four fixed documents qualify; _index.md and any other compass file never do; a stem is the title when there is no H1', async () => {
    const root = tmp('doc-four');
    seed(root);
    expect([...COMPASS_DOC_FILES]).toEqual(['environment.md', 'preferences.md', 'do-not-repeat.md', 'standing-authorities.md']);
    write(root, '.cortex/compass/_index.md', '# Compass index\n\n## Read this\n');
    write(root, '.cortex/compass/notes.md', '# Notes\n');
    write(root, '.cortex/compass/preferences.md', '---\nkind: preferences\n---\n\nNo heading, only __bold pair__ here.\n');
    write(root, '.cortex/compass/do-not-repeat.md', '# Do not repeat\n\n## Never\n');
    const index = await compileRecallIndex(root);
    expect(Object.keys(index.entries).filter((k) => k.startsWith('compass.')).sort()).toEqual(['compass.do-not-repeat', 'compass.preferences']);
    expect(index.entries['compass.preferences']?.title).toBe('preferences');
    expect(index.entries['compass.preferences']?.keywords).toEqual(['bold', 'pair']);
    expect(index.entries['compass.do-not-repeat']?.title).toBe('Do not repeat');
  });

  it('docKeywords keeps the first 40 distinct tokens in document order, ≥3 chars, stop-list removed, then sorts', () => {
    expect(COMPASS_DOC_KEYWORD_CAP).toBe(40);
    const headings = Array.from({ length: 50 }, (_, i) => `## Token${String(i).padStart(2, '0')} and the`).join('\n');
    const keywords = docKeywords(headings + '\n\nprose **Zed** prose\n');
    expect(keywords).toHaveLength(40);
    expect(keywords).toEqual([...keywords].sort());
    expect(keywords).toContain('token00');
    expect(keywords).toContain('token39');
    expect(keywords).not.toContain('token40');
    expect(keywords).not.toContain('zed');
    expect(keywords).not.toContain('and');
    expect(keywords).not.toContain('the');
    expect(docKeywords('# A **on**\n')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rule 17 — entailment 4: open and triaged bugs only
// ---------------------------------------------------------------------------
describe('AC: only open and triaged bugs reach a subject', () => {
  it('B-019 (open) and B-020 (triaged) contribute; B-003 (resolved) keeps its entry only', async () => {
    const root = tmp('bugs-currency');
    seed(root);
    rule(root, 'R-001', 'core', ['governs:', '  - "src/schema/**/*.ts"']);
    bug(root, 'B-019', 'open', ['schema.validator', 'src/schema/checks/xref.ts'], ['opened: 2026-09-15T17:00:00Z']);
    bug(root, 'B-020', 'triaged', ['R-001'], ['opened: 2026-09-16T09:00:00Z']);
    bug(root, 'B-003', 'resolved', ['R-001']);
    const index = await compileRecallIndex(root);
    expect(index.subjects['schema.validator']?.bugs).toEqual(['B-019']);
    expect(index.subjects['src/schema/checks/xref.ts']?.bugs).toEqual(['B-019']);
    expect(index.subjects['src/schema/checks/xref.ts']?.rules).toEqual(['R-001']);
    expect(index.subjects['R-001']?.bugs).toEqual(['B-020']);
    for (const id of ['B-019', 'B-020', 'B-003']) expect(index.entries[id]?.kind, id).toBe('bug');
    expect(index.entries['B-019']?.date).toBe('2026-09-15T17:00:00.000Z');
    expect(index.entries['B-003']?.date).toBe('');
    expect(index.entries['B-019']?.title).toBe('Bug B-019');
    expect(index.entries['B-019']?.keywords).toEqual(expect.arrayContaining(['bug', '019', 'schema.validator', 'src/schema/checks/xref.ts']));
  });

  it('an unresolved affects entry is dropped and counted; non-string entries are ignored; a bug without affects is entry-only', async () => {
    const root = tmp('bugs-dropped');
    seed(root);
    bug(root, 'B-001', 'open', ['src/gone.ts', 'R-999']);
    write(root, '.cortex/compass/bugs/B-002-y.md', '---\nid: B-002\ntitle: y\nstatus: open\naffects: [3, "schema.validator"]\n---\n');
    write(root, '.cortex/compass/bugs/B-004-z.md', '---\nid: B-004\ntitle: z\nstatus: open\n---\n');
    const index = await compileRecallIndex(root);
    expect(index.counters.droppedRefs).toBe(2);
    expect(index.subjects['schema.validator']?.bugs).toEqual(['B-002']);
    expect(index.entries['B-004']?.kind).toBe('bug');
    expect(Object.values(index.subjects).some((s) => s.bugs.includes('B-001') || s.bugs.includes('B-004'))).toBe(false);
  });

  it('unparseable frontmatter skips the file for rules and bugs alike (Rule 10)', async () => {
    const root = tmp('bugs-broken');
    seed(root);
    write(root, '.cortex/compass/bugs/B-005-broken.md', '---\nid: B-005\ntitle: "unclosed\n---\n');
    write(root, '.cortex/compass/rules/R-005-broken.md', '---\nid: R-005\ntitle: "unclosed\n---\n');
    const index = await compileRecallIndex(root);
    expect(index.entries['B-005']).toBeUndefined();
    expect(index.entries['R-005']).toBeUndefined();
  });

  it('Rule 9: lists stay sorted and deduplicated across the two new carriers', async () => {
    const root = tmp('bugs-sorted');
    seed(root);
    rule(root, 'R-002', 'b', ['governs:', '  - "src/db/**/*.ts"']);
    rule(root, 'R-001', 'a', ['governs:', '  - "src/db/**/*.ts"', '  - "src/db/*.ts"']);
    bug(root, 'B-002', 'open', ['src/db/schema.ts', 'src/db/schema.ts']);
    bug(root, 'B-001', 'triaged', ['./src/db/schema.ts']);
    const index = await compileRecallIndex(root);
    expect(index.subjects['src/db/schema.ts']).toEqual({ decided: [], evidence: [], threads: [], observations: [], rules: ['R-001', 'R-002'], bugs: ['B-001', 'B-002'] });
  });
});
