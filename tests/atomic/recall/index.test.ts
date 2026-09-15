/**
 * Atomic tests — the recall index compiler (`recall.recall-index`, schema
 * §4.11). Every carrier is written by hand into a tmp root; the compiler is
 * called directly. One `it` per Given/When/Then, plus the numbered rules the
 * ACs do not reach on their own (Rules 1, 8, 9, 10).
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  compileRecallIndex,
  writeRecallIndex,
  scanCarriers,
  keywordsOf,
  RECALL_INDEX_FILE,
  type RecallIndex,
} from '../../../src/recall/index.js';
import { SUPPORTED_VERSION } from '../../../src/schema/version.js';
import { serialiseThread } from '../../../src/pulse/threads.js';
import { makeThread } from '../../fixtures/threads.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/hooks-harness.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`recall-index-${label}`);
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

/** The resolvable subjects every AC below refers to: rules, specs, a clause, a file, a concept. */
function seed(root: string, config: Record<string, unknown> | null = { schemaVersion: '3.4' }): void {
  if (config !== null) write(root, '.cortex/cortex.config.json', JSON.stringify(config));
  write(root, '.cortex/compass/rules/R-001-core-no-llm-calls.md', '---\nid: R-001\ntitle: Core makes no LLM calls\n---\n');
  write(root, '.cortex/compass/rules/R-003-x.md', '---\nid: R-003\ntitle: x\n---\n');
  write(root, '.specflow/specs/pulse/usage.spec.md', '---\nid: pulse.usage\n---\n');
  write(root, '.specflow/specs/pulse/hygiene.spec.md', '---\nid: pulse.hygiene\n---\n');
  write(root, '.specflow/specs/pulse/threads.spec.md', '---\nid: pulse.threads\ndepends_on:\n  - pulse.hygiene\n---\n');
  write(root, 'cortex-schema.md', '## 5. Hook payload contracts\n\n## 6. Cross-reference conventions\n');
  write(root, 'src/pulse/usage.ts', 'export {};\n');
  write(root, '.cortex/insight/concepts/hook-safety.md', '---\nkind: insight-concept\n---\n');
}

function decision(root: string, stem: string, extraYaml: string[] = [], opts: { body?: string; title?: string } = {}): string {
  const fm = [`id: decision.${stem}`, `title: ${JSON.stringify(opts.title ?? stem)}`, 'date: 2026-09-15T00:00:00Z', ...extraYaml];
  return write(root, `.cortex/atlas/decisions/${stem}.md`, `---\n${fm.join('\n')}\n---\n\n${opts.body ?? `# ${stem}\n`}`);
}

function evidence(root: string, stem: string, extraYaml: string[] = []): string {
  const fm = [
    `id: evidence.${stem}`,
    `title: Cortex usage over 41 sessions`,
    'date: 2026-09-15T15:58:00Z',
    'kind: measurement',
    'instrument: pulse.usage',
    ...extraYaml,
  ];
  return write(root, `.cortex/atlas/evidence/${stem}.md`, `---\n${fm.join('\n')}\n---\n\n# ${stem}\n`);
}

function thread(root: string, id: string, status: 'open' | 'answered' | 'dropped' | 'expired', bearsOn: string[], body?: string): string {
  const t = makeThread({ id, status, bears_on: bearsOn, ...(body !== undefined ? { body } : {}) });
  if (status === 'answered') {
    t.answered = '2026-09-16T10:00:00.000Z';
    t.resolved_by = 'claude-sessions/fixture-user/s2';
  }
  return write(root, `.cortex/pulse/threads/${id}-fixture.md`, serialiseThread(t));
}

function observation(root: string, theme: string, bearsOnYaml?: string): string {
  const fm = ['kind: insight-observation', "updated: '2026-09-10T09:00:00Z'", 'salient: false', 'sessions:', '  - claude-sessions/pedro/s1'];
  if (bearsOnYaml !== undefined) fm.push(bearsOnYaml);
  return write(root, `.cortex/insight/observations/${theme}.md`, `---\n${fm.join('\n')}\n---\n\nThe ${theme} body.\n`);
}

function stripGenerated(index: RecallIndex): string {
  return JSON.stringify({ ...index, generated: '' }, null, 2);
}

// ---------------------------------------------------------------------------
// Rule 10 / AC: empty inputs compile
// ---------------------------------------------------------------------------
describe('AC: empty inputs compile (Rule 10)', () => {
  it('a project with none of the four directories scans no carriers and compiles to an empty index, never an error', async () => {
    const root = tmp('empty');
    expect(scanCarriers(root)).toEqual([]);
    const index = await compileRecallIndex(root);
    expect(index.subjects).toEqual({});
    expect(index.entries).toEqual({});
    expect(index.counters).toEqual({ subjects: 0, entries: 0, droppedRefs: 0 });
    expect(typeof index.generated).toBe('string');
  });

  // The project index parses the same broken file first; gray-matter's
  // pre-parse cache would hand the compiler empty data unless it bypasses it.
  it('an unparseable frontmatter and a non-list bears_on are skipped without an entries row', async () => {
    const root = tmp('tolerance');
    seed(root);
    write(root, '.cortex/atlas/decisions/2026-09-01-broken.md', '---\nid: decision.2026-09-01-broken\ntitle: "unclosed\n---\n');
    decision(root, '2026-09-02-scalar', ['bears_on: R-001']);
    decision(root, '2026-09-03-good', ['bears_on: [R-001]']);
    const index = await compileRecallIndex(root);
    expect(Object.keys(index.entries)).toEqual(['decision.2026-09-03-good']);
    expect(index.subjects['R-001']?.decided).toEqual(['decision.2026-09-03-good']);
  });
});

// ---------------------------------------------------------------------------
// Rule 1: schemaVersion
// ---------------------------------------------------------------------------
describe('Rule 1: schemaVersion is the config\'s, falling back to the package\'s', () => {
  it('reads cortex.config.json', async () => {
    const root = tmp('version-config');
    seed(root, { schemaVersion: '3.3' });
    expect((await compileRecallIndex(root)).schemaVersion).toBe('3.3');
  });

  it('falls back to SUPPORTED_VERSION when the config is absent', async () => {
    const root = tmp('version-fallback');
    seed(root, null);
    expect((await compileRecallIndex(root)).schemaVersion).toBe(SUPPORTED_VERSION);
  });
});

// ---------------------------------------------------------------------------
// Rule 8 / AC: keywords are names, never bodies
// ---------------------------------------------------------------------------
describe('AC: keywords are names, never bodies (Rule 8)', () => {
  // Rule 8 is the contract: every lowercase token of three or more characters.
  // The AC's example list omits `only` (from `pull-only`), which Rule 8 keeps;
  // the rule wins and the discrepancy is reported as a gap.
  it('the AC title yields Rule 8\'s tokens plus the ref verbatim, sorted and deduplicated', () => {
    expect(keywordsOf("Insight's pull-only stance is widened to permit concept names at SessionStart", ['schema:§5'])).toEqual([
      'concept', 'insight', 'names', 'only', 'permit', 'pull', 'schema:§5', 'sessionstart', 'stance', 'widened',
    ]);
  });

  it('a duplicated token and an unresolving ref both appear once; refs are kept verbatim whether or not they resolve', () => {
    expect(keywordsOf('Pulse pulse PULSE', ['R-999', 'R-999', './src/x.ts'])).toEqual(['./src/x.ts', 'R-999', 'pulse']);
  });

  it('no token from a 400-word body appears in the compiled keywords', async () => {
    const root = tmp('keywords-body');
    seed(root);
    const bodyWords = Array.from({ length: 400 }, (_, i) => `bodyword${i}`);
    decision(root, '2026-08-05-insight-pull-only-stance-reversed', ['bears_on: ["schema:§5"]'], {
      title: "Insight's pull-only stance is widened to permit concept names at SessionStart",
      body: `# Heading\n\n${bodyWords.join(' ')}\n`,
    });
    const index = await compileRecallIndex(root);
    const entry = index.entries['decision.2026-08-05-insight-pull-only-stance-reversed'];
    expect(entry?.keywords).toEqual(['concept', 'insight', 'names', 'only', 'permit', 'pull', 'schema:§5', 'sessionstart', 'stance', 'widened']);
    expect(entry?.keywords.some((k) => k.startsWith('bodyword') || k === 'heading')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rule 8: entries — kind, title, path, date
// ---------------------------------------------------------------------------
describe('Rule 8: one entries row per scanned artefact', () => {
  it('decision/evidence use frontmatter title and date; a thread uses its key text cut to 80 and opened; an observation its theme and updated; paths are project-relative POSIX', async () => {
    const root = tmp('entries');
    seed(root);
    decision(root, '2026-09-01-d', ['bears_on: [R-001]']);
    evidence(root, '2026-09-15-usage', ['bears_on: [pulse.usage]']);
    const long = 'Do you want the counter in state or at the pulse root or somewhere else entirely, perhaps a third place?';
    thread(root, 'T-001', 'open', [], long);
    observation(root, 'working-style');

    const index = await compileRecallIndex(root);
    expect(index.entries['decision.2026-09-01-d']).toEqual({
      kind: 'decision',
      title: '2026-09-01-d',
      path: '.cortex/atlas/decisions/2026-09-01-d.md',
      date: '2026-09-15T00:00:00.000Z',
      keywords: ['2026', 'R-001'],
    });
    expect(index.entries['evidence.2026-09-15-usage']).toMatchObject({
      kind: 'evidence',
      title: 'Cortex usage over 41 sessions',
      path: '.cortex/atlas/evidence/2026-09-15-usage.md',
      date: '2026-09-15T15:58:00.000Z',
      keywords: ['cortex', 'over', 'pulse.usage', 'sessions', 'usage'],
    });
    const t = index.entries['T-001'];
    expect(t?.kind).toBe('thread');
    expect(t?.title).toBe(long.slice(0, 80));
    expect(t?.title).toHaveLength(80);
    expect(t?.path).toBe('.cortex/pulse/threads/T-001-fixture.md');
    expect(t?.date).toBe('2026-09-15T10:00:00.000Z');
    expect(index.entries['observation.working-style']).toEqual({
      kind: 'observation',
      title: 'working-style',
      path: '.cortex/insight/observations/working-style.md',
      date: '2026-09-10T09:00:00Z',
      keywords: ['style', 'working'],
    });
    expect(index.counters.entries).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// AC: a superseded decision keeps its entry and loses its subjects (Rule 3)
// ---------------------------------------------------------------------------
describe('AC: a superseded decision keeps its entry and loses its subjects', () => {
  it('subjects["R-001"].decided is exactly the superseder; entries holds both', async () => {
    const root = tmp('superseded-decision');
    seed(root);
    decision(root, '2026-07-01-a', ['bears_on: [R-001]']);
    decision(root, '2026-08-01-b', ['bears_on: [R-001]', 'supersedes: [2026-07-01-a.md]']);
    const index = await compileRecallIndex(root);
    expect(index.subjects['R-001']?.decided).toEqual(['decision.2026-08-01-b']);
    expect(Object.keys(index.entries).sort()).toEqual(['decision.2026-07-01-a', 'decision.2026-08-01-b']);
  });

  it('supersession is one hop: a superseded superseder still removes its own target', async () => {
    const root = tmp('one-hop');
    seed(root);
    decision(root, '2026-07-01-a', ['bears_on: [R-001]']);
    decision(root, '2026-08-01-b', ['bears_on: [R-001]', 'supersedes: [2026-07-01-a.md]']);
    decision(root, '2026-09-01-c', ['bears_on: [R-001]', 'supersedes: [2026-08-01-b.md]']);
    const index = await compileRecallIndex(root);
    expect(index.subjects['R-001']?.decided).toEqual(['decision.2026-09-01-c']);
  });
});

// ---------------------------------------------------------------------------
// AC: only open threads reach a subject (Rule 4)
// ---------------------------------------------------------------------------
describe('AC: only open threads reach a subject', () => {
  it('subjects[spec path].threads is exactly ["T-001"]; entries holds all three ids', async () => {
    const root = tmp('open-threads');
    seed(root);
    const ref = '.specflow/specs/pulse/hygiene.spec.md';
    thread(root, 'T-001', 'open', [ref]);
    thread(root, 'T-002', 'answered', [ref]);
    thread(root, 'T-003', 'expired', [ref]);
    const index = await compileRecallIndex(root);
    expect(index.subjects[ref]?.threads).toEqual(['T-001']);
    expect(Object.keys(index.entries).sort()).toEqual(['T-001', 'T-002', 'T-003']);
  });
});

// ---------------------------------------------------------------------------
// AC: evidence flows through the citing decision and directly (Rule 5)
// ---------------------------------------------------------------------------
describe('AC: evidence flows through the citing decision and directly', () => {
  it('schema:§5, R-003 (via the decision) and pulse.usage (directly) each list the evidence id', async () => {
    const root = tmp('evidence-flow');
    seed(root);
    evidence(root, '2026-09-15-usage', ['bears_on: [pulse.usage]']);
    decision(root, '2026-09-15-d', ['sources: [../evidence/2026-09-15-usage.md]', 'bears_on: ["schema:§5", R-003]']);
    const index = await compileRecallIndex(root);
    expect(index.subjects['schema:§5']?.evidence).toEqual(['evidence.2026-09-15-usage']);
    expect(index.subjects['R-003']?.evidence).toEqual(['evidence.2026-09-15-usage']);
    expect(index.subjects['pulse.usage']?.evidence).toEqual(['evidence.2026-09-15-usage']);
    expect(index.subjects['schema:§5']?.decided).toEqual(['decision.2026-09-15-d']);
  });

  it('a superseded decision still carries its cited evidence forward (Rule 5 does not require currency)', async () => {
    const root = tmp('evidence-via-superseded');
    seed(root);
    evidence(root, '2026-09-15-usage', ['bears_on: [pulse.usage]']);
    decision(root, '2026-09-01-old', ['sources: [../evidence/2026-09-15-usage.md]', 'bears_on: [R-003]']);
    decision(root, '2026-09-15-new', ['bears_on: [R-003]', 'supersedes: [2026-09-01-old.md]']);
    const index = await compileRecallIndex(root);
    expect(index.subjects['R-003']?.evidence).toEqual(['evidence.2026-09-15-usage']);
    expect(index.subjects['R-003']?.decided).toEqual(['decision.2026-09-15-new']);
  });
});

// ---------------------------------------------------------------------------
// AC: a superseded evidence file is dropped from every evidence list (Rule 5)
// ---------------------------------------------------------------------------
describe('AC: a superseded evidence file is dropped from every evidence list', () => {
  it('only the superseder remains, even where a decision cites the older one; entries keeps the older row', async () => {
    const root = tmp('superseded-evidence');
    seed(root);
    evidence(root, '2026-09-01-usage', ['bears_on: [pulse.usage]']);
    evidence(root, '2026-09-15-usage', ['bears_on: [pulse.usage]', 'supersedes: [2026-09-01-usage.md]']);
    decision(root, '2026-09-02-d', ['sources: [../evidence/2026-09-01-usage.md]', 'bears_on: [R-003]']);
    const index = await compileRecallIndex(root);
    expect(index.subjects['pulse.usage']?.evidence).toEqual(['evidence.2026-09-15-usage']);
    expect(index.subjects['R-003']?.evidence).toEqual([]);
    for (const subject of Object.values(index.subjects)) {
      expect(subject.evidence).not.toContain('evidence.2026-09-01-usage');
    }
    expect(index.entries['evidence.2026-09-01-usage']?.kind).toBe('evidence');
  });
});

// ---------------------------------------------------------------------------
// AC: an observation contributes its theme (Rule 6)
// ---------------------------------------------------------------------------
describe('AC: an observation contributes its theme', () => {
  it('R-001 and concept:hook-safety both list "working-style"; the entry kind is observation', async () => {
    const root = tmp('observation');
    seed(root);
    observation(root, 'working-style', 'bears_on: [R-001, "concept:hook-safety"]');
    const index = await compileRecallIndex(root);
    expect(index.subjects['R-001']?.observations).toEqual(['working-style']);
    expect(index.subjects['concept:hook-safety']?.observations).toEqual(['working-style']);
    expect(index.entries['observation.working-style']?.kind).toBe('observation');
  });

  it('an observation without bears_on contributes only its entries row', async () => {
    const root = tmp('observation-plain');
    seed(root);
    observation(root, 'scale');
    const index = await compileRecallIndex(root);
    expect(index.entries['observation.scale']?.title).toBe('scale');
    expect(index.subjects).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// AC: unresolved refs are dropped and counted, never fatal (Rule 2)
// ---------------------------------------------------------------------------
describe('AC: unresolved refs are dropped and counted, never fatal', () => {
  it('only the resolving path becomes a subject; droppedRefs is 2; the compile succeeds', async () => {
    const root = tmp('dropped');
    seed(root);
    thread(root, 'T-001', 'open', ['src/gone.ts', 'R-999', '.cortex/compass/rules/R-001-core-no-llm-calls.md']);
    const index = await compileRecallIndex(root);
    expect(Object.keys(index.subjects)).toEqual(['.cortex/compass/rules/R-001-core-no-llm-calls.md']);
    expect(index.subjects['.cortex/compass/rules/R-001-core-no-llm-calls.md']?.threads).toEqual(['T-001']);
    expect(index.counters.droppedRefs).toBe(2);
    expect(index.entries['T-001']?.keywords).toEqual(
      expect.arrayContaining(['src/gone.ts', 'R-999', '.cortex/compass/rules/R-001-core-no-llm-calls.md']),
    );
  });
});

// ---------------------------------------------------------------------------
// AC: path spellings collapse to one subject (Rule 2)
// ---------------------------------------------------------------------------
describe('AC: path spellings collapse to one subject', () => {
  it('./src/pulse/usage.ts and src/pulse/usage.ts are one key carrying both carriers', async () => {
    const root = tmp('path-collapse');
    seed(root);
    decision(root, '2026-09-01-d', ['bears_on: [./src/pulse/usage.ts]']);
    thread(root, 'T-001', 'open', ['src/pulse/usage.ts']);
    const index = await compileRecallIndex(root);
    expect(Object.keys(index.subjects)).toEqual(['src/pulse/usage.ts']);
    expect(index.subjects['src/pulse/usage.ts']).toEqual({
      decided: ['decision.2026-09-01-d'],
      evidence: [],
      threads: ['T-001'],
      observations: [],
    });
    expect(index.counters.subjects).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// AC: dependencies are not closed over (Rule 7)
// ---------------------------------------------------------------------------
describe('AC: dependencies are not closed over', () => {
  it('a decision bearing on pulse.hygiene leaves subjects["pulse.threads"] undefined', async () => {
    const root = tmp('no-closure');
    seed(root);
    decision(root, '2026-09-01-d', ['bears_on: [pulse.hygiene]']);
    const index = await compileRecallIndex(root);
    expect(index.subjects['pulse.hygiene']?.decided).toEqual(['decision.2026-09-01-d']);
    expect(index.subjects['pulse.threads']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// AC / Rule 9: deterministic modulo timestamp; sorted keys and lists
// ---------------------------------------------------------------------------
describe('AC: deterministic modulo timestamp (Rule 9)', () => {
  it('two compilations of one project are byte-identical after removing generated; keys and lists are sorted', async () => {
    const root = tmp('determinism');
    seed(root);
    decision(root, '2026-09-02-b', ['bears_on: ["schema:§5", R-001, pulse.usage]']);
    decision(root, '2026-09-01-a', ['bears_on: [R-001, R-003]']);
    thread(root, 'T-002', 'open', ['R-001']);
    thread(root, 'T-001', 'open', ['R-001', 'R-001']);
    observation(root, 'working-style', 'bears_on: [R-001]');
    observation(root, 'audience', 'bears_on: [R-001]');

    const first = await compileRecallIndex(root);
    const second = await compileRecallIndex(root);
    expect(stripGenerated(first)).toBe(stripGenerated(second));

    const subjectKeys = Object.keys(first.subjects);
    expect(subjectKeys).toEqual([...subjectKeys].sort());
    const entryKeys = Object.keys(first.entries);
    expect(entryKeys).toEqual([...entryKeys].sort());
    expect(first.subjects['R-001']).toEqual({
      decided: ['decision.2026-09-01-a', 'decision.2026-09-02-b'],
      evidence: [],
      threads: ['T-001', 'T-002'],
      observations: ['audience', 'working-style'],
    });
    expect(first.counters).toEqual({ subjects: 4, entries: 6, droppedRefs: 0 });
  });
});

// ---------------------------------------------------------------------------
// Rule 11: the writer
// ---------------------------------------------------------------------------
describe('Rule 11: writeRecallIndex', () => {
  it('writes .cortex/recall-index.json with two-space indentation and a trailing newline, creating .cortex/ when absent', async () => {
    const root = tmp('writer');
    seed(root, null);
    decision(root, '2026-09-01-d', ['bears_on: [R-001]']);
    const index = await writeRecallIndex(root);
    const file = path.join(root, '.cortex', RECALL_INDEX_FILE);
    expect(fs.existsSync(file)).toBe(true);
    const raw = fs.readFileSync(file, 'utf-8');
    expect(raw).toBe(JSON.stringify(index, null, 2) + '\n');
    expect(JSON.parse(raw).subjects['R-001'].decided).toEqual(['decision.2026-09-01-d']);
    expect(Object.keys(JSON.parse(raw))).toEqual(['schemaVersion', 'generated', 'subjects', 'entries', 'counters']);
  });
});
