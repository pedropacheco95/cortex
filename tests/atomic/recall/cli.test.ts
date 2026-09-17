/**
 * Atomic tests — recall.why, the pull side of recall: `cortex why <ref>` and
 * `cortex recall <word…>` over a hand-built `.cortex/recall-index.json` in a
 * temp root. One `describe` per acceptance criterion (plus the Rule 2 "no
 * index" / "malformed" split). Everything the verbs print is captured through
 * the `stdout`/`stderr` sinks; nothing reaches the real console.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { recallCli } from '../../../src/recall/cli.js';
import { clearRecallIndexCache } from '../../../src/recall/query.js';
import {
  recallEntry,
  recallIndexFixture,
  recallSubject,
  sampleRecallIndex,
  writeRecallIndexFixture,
} from '../../fixtures/recall-query.js';
import type { RecallIndex } from '../../../src/recall/index.js';

const dirs: string[] = [];

function tmp(label: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cortex-recall-cli-${label}-`));
  dirs.push(dir);
  return dir;
}

function write(root: string, rel: string, body: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, 'utf-8');
}

interface Ran {
  code: number;
  out: string;
  err: string;
}

async function cortex(root: string, argv: string[]): Promise<Ran> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await recallCli(argv, root, {
    stdout: (line: string) => out.push(line),
    stderr: (line: string) => err.push(line),
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

/** The first AC's R-001: one of everything, plus an evidence file carrying three findings. */
function whyIndex(): RecallIndex {
  const base = sampleRecallIndex();
  return recallIndexFixture(
    {
      ...base.subjects,
      'R-001': recallSubject({
        decided: ['decision.2026-07-07-five-module-architecture'],
        evidence: ['evidence.2026-09-15-usage'],
        threads: ['T-004'],
        observations: ['working-style'],
      }),
    },
    base.entries,
  );
}

const USAGE_EVIDENCE = [
  '---',
  'id: evidence.2026-09-15-usage',
  'title: "Cortex usage over 41 sessions"',
  'date: 2026-09-15T15:58:00.000Z',
  'kind: measurement',
  'instrument: pulse.usage',
  'window:',
  '  from: 2026-08-01',
  '  to: 2026-09-15',
  '  sessions: 41',
  'findings:',
  '  - metric: searches.knowledge',
  '    value: 54',
  '  - metric: searches.machinery',
  '    value: 48',
  '  - metric: searches.document',
  '    value: 135',
  '  - metric: insight.file',
  '    value: 6',
  '    unit: invocations',
  'bears_on:',
  '  - R-001',
  '---',
  '',
  '# usage',
  '',
].join('\n');

function whyProject(label: string): string {
  const root = tmp(label);
  writeRecallIndexFixture(root, whyIndex());
  write(root, '.cortex/atlas/evidence/2026-09-15-usage.md', USAGE_EVIDENCE);
  return root;
}

beforeEach(() => clearRecallIndexCache());
afterEach(() => {
  clearRecallIndexCache();
  while (dirs.length > 0) fs.rmSync(dirs.pop() as string, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// AC: why lists all four sections in order
// ---------------------------------------------------------------------------
describe('recall.why — why lists all four sections in order', () => {
  it('prints the counts line, then Decided / Evidence / Open / Observations, exit 0', async () => {
    const root = whyProject('sections');
    const { code, out, err } = await cortex(root, ['why', 'R-001']);
    expect(code).toBe(0);
    expect(err).toBe('');
    const lines = out.split('\n');
    expect(lines[0]).toBe('R-001 (rule) — 1 decided · 1 evidence · 1 open · 1 observation themes · 0 bugs · 0 rules');
    const order = ['Decided:', 'Evidence:', 'Open:', 'Observations: working-style'].map((h) => lines.indexOf(h));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(lines).toContain(
      '  2026-07-07  decision.2026-07-07-five-module-architecture — Five-module architecture  (.cortex/atlas/decisions/2026-07-07-five-module-architecture.md)',
    );
    expect(lines).toContain(
      '  2026-09-15  evidence.2026-09-15-usage — Cortex usage over 41 sessions  (.cortex/atlas/evidence/2026-09-15-usage.md)',
    );
    expect(lines).toContain('    searches.knowledge=54  searches.machinery=48  searches.document=135');
    expect(lines).toContain(
      '  T-004  thread — Do you want the counter in state/ or at the pulse root?  (.cortex/pulse/threads/T-004-do-you-want-the-counter-in-state-or-at-the-pulse-root.md)',
    );
  });

  it('is byte-identical across two runs (Rule 7)', async () => {
    const root = whyProject('deterministic');
    const first = await cortex(root, ['why', 'R-001']);
    clearRecallIndexCache();
    const second = await cortex(root, ['why', 'R-001']);
    expect(second.out).toBe(first.out);
  });

  it('renders a unit after the value and (findings unreadable) for an absent file', async () => {
    const root = tmp('unit');
    const base = sampleRecallIndex();
    writeRecallIndexFixture(
      root,
      recallIndexFixture(
        { 'R-001': recallSubject({ evidence: ['evidence.2026-09-15-usage', 'evidence.2026-09-01-gone'] }) },
        {
          ...base.entries,
          'evidence.2026-09-01-gone': recallEntry('evidence', 'Gone', '.cortex/atlas/evidence/2026-09-01-gone.md', '2026-09-01'),
        },
      ),
    );
    write(root, '.cortex/atlas/evidence/2026-09-15-usage.md', USAGE_EVIDENCE.replace(/findings:[\s\S]*?bears_on/, 'findings:\n  - metric: insight.file\n    value: 6\n    unit: invocations\nbears_on'));
    const { out } = await cortex(root, ['why', 'R-001']);
    const lines = out.split('\n');
    expect(lines).toContain('    insight.file=6 invocations');
    expect(lines).toContain('    (findings unreadable)');
    // Newest first: the usage file (09-15) precedes the gone file (09-01).
    expect(lines.findIndex((l) => l.includes('evidence.2026-09-15-usage'))).toBeLessThan(
      lines.findIndex((l) => l.includes('evidence.2026-09-01-gone')),
    );
  });

  it('omits empty sections and counts only what it lists', async () => {
    const root = tmp('sparse');
    writeRecallIndexFixture(root, sampleRecallIndex());
    const { out } = await cortex(root, ['why', 'pulse.usage']);
    const lines = out.split('\n');
    expect(lines[0]).toBe('pulse.usage (id) — 0 decided · 1 evidence · 0 open · 0 observation themes · 0 bugs · 0 rules');
    expect(lines).not.toContain('Decided:');
    expect(lines).not.toContain('Open:');
    expect(lines.some((l) => l.startsWith('Observations:'))).toBe(false);
    expect(lines).toContain('Evidence:');
  });
});

// ---------------------------------------------------------------------------
// AC: A path ref resolves through its spec id
// ---------------------------------------------------------------------------
describe('recall.why — a path ref resolves through its spec id', () => {
  it('names pulse.usage as the matched key on the first line and lists that subject', async () => {
    const root = tmp('spec-path');
    writeRecallIndexFixture(root, sampleRecallIndex());
    const { code, out } = await cortex(root, ['why', '.specflow/specs/pulse/usage.spec.md']);
    expect(code).toBe(0);
    const lines = out.split('\n');
    expect(lines[0]).toMatch(/^pulse\.usage \(id, for \.specflow\/specs\/pulse\/usage\.spec\.md\) — /);
    expect(lines).toContain('Evidence:');
    expect(lines.some((l) => l.includes('evidence.2026-09-15-usage'))).toBe(true);
  });

  it('a path subject present in the index matches as itself with no rename', async () => {
    const root = tmp('path-self');
    writeRecallIndexFixture(root, sampleRecallIndex());
    const { out } = await cortex(root, ['why', './src/pulse/']);
    expect(out.split('\n')[0]).toMatch(/^src\/pulse \(path, for \.\/src\/pulse\/\) — 1 decided/);
  });
});

// ---------------------------------------------------------------------------
// AC: The schema document aggregates its clauses
// ---------------------------------------------------------------------------
describe('recall.why — the schema document aggregates its clauses', () => {
  it('heads the listing `cortex-schema.md (all clauses)` and lists each entry once', async () => {
    const root = tmp('schema');
    const base = sampleRecallIndex();
    writeRecallIndexFixture(
      root,
      recallIndexFixture(
        {
          ...base.subjects,
          'schema:§4.11': recallSubject({ decided: ['decision.2026-07-10-x', 'decision.2026-08-05-insight-pull-only-stance-reversed'] }),
        },
        base.entries,
      ),
    );
    write(root, 'cortex-schema.md', '## 4. Files\n\n### 4.11 recall-index.json\n\n## 5. Hook payload contracts\n');
    const { code, out } = await cortex(root, ['why', 'cortex-schema.md']);
    expect(code).toBe(0);
    const lines = out.split('\n');
    expect(lines[0]).toBe('cortex-schema.md (all clauses) — 2 decided · 1 evidence · 0 open · 0 observation themes · 0 bugs · 0 rules');
    expect(lines.filter((l) => l.includes('evidence.2026-09-15-usage')).length).toBe(1);
    expect(lines.filter((l) => l.includes('decision.2026-08-05-insight-pull-only-stance-reversed')).length).toBe(1);
    expect(lines.filter((l) => l.includes('decision.2026-07-10-x')).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// AC: Nothing bears on an unknown subject
// ---------------------------------------------------------------------------
describe('recall.why — nothing bears on an unknown subject', () => {
  it('prints `Nothing bears on R-999.` and exits 0', async () => {
    const root = tmp('nothing');
    writeRecallIndexFixture(root, sampleRecallIndex());
    const { code, out, err } = await cortex(root, ['why', 'R-999']);
    expect(code).toBe(0);
    expect(out).toBe('Nothing bears on R-999.');
    expect(err).toBe('');
  });

  it('a path with no candidate in the index is also nothing', async () => {
    const root = tmp('nothing-path');
    writeRecallIndexFixture(root, sampleRecallIndex());
    const { code, out } = await cortex(root, ['why', 'src/hooks/pre-read.ts']);
    expect(code).toBe(0);
    expect(out).toBe('Nothing bears on src/hooks/pre-read.ts.');
  });
});

// ---------------------------------------------------------------------------
// AC: --json is the subject block plus its entries
// ---------------------------------------------------------------------------
describe('recall.why — --json is the subject block plus its entries', () => {
  it('emits key, subject, the four entries and three findings, sorted keys, trailing newline', async () => {
    const root = whyProject('json');
    const { code, out } = await cortex(root, ['why', 'R-001', '--json']);
    expect(code).toBe(0);
    // The sink receives the document without its terminator; the default sink
    // (console.log) supplies Rule 5's trailing newline — asserted in the spec test.
    expect(out.endsWith('\n')).toBe(false);
    const parsed = JSON.parse(out) as {
      ref: string;
      key: string | null;
      subject: { decided: string[]; evidence: string[]; threads: string[]; observations: string[] };
      entries: Record<string, unknown>;
      findings: Record<string, unknown[]>;
    };
    expect(parsed.ref).toBe('R-001');
    expect(parsed.key).toBe('R-001');
    expect(parsed.subject.decided).toEqual(['decision.2026-07-07-five-module-architecture']);
    expect(Object.keys(parsed.entries).sort()).toEqual([
      'T-004',
      'decision.2026-07-07-five-module-architecture',
      'evidence.2026-09-15-usage',
      'observation.working-style',
    ]);
    expect(parsed.findings['evidence.2026-09-15-usage']).toHaveLength(3);
    expect(Object.keys(parsed)).toEqual(['bugs', 'entries', 'findings', 'key', 'ref', 'subject']);
    expect(out).toBe(JSON.stringify(parsed, null, 2));
  });

  it('flags may precede the operand', async () => {
    const root = whyProject('json-first');
    const { code, out } = await cortex(root, ['why', '--json', 'R-001']);
    expect(code).toBe(0);
    expect((JSON.parse(out) as { key: string }).key).toBe('R-001');
  });

  it('Nothing bears on in JSON is key null with empty lists, exit 0', async () => {
    const root = tmp('json-nothing');
    writeRecallIndexFixture(root, sampleRecallIndex());
    const { code, out } = await cortex(root, ['why', 'R-999', '--json']);
    expect(code).toBe(0);
    expect(JSON.parse(out)).toEqual({
      entries: {},
      findings: {},
      key: null,
      ref: 'R-999',
      bugs: {},
      subject: { bugs: [], decided: [], evidence: [], observations: [], rules: [], threads: [] },
    });
  });
});

// ---------------------------------------------------------------------------
// AC: recall ranks by hits then date and caps at five
// ---------------------------------------------------------------------------
describe('recall.why — recall ranks by hits then date and caps at five', () => {
  it('prints exactly five lines newest first and omits the single-hit entry', async () => {
    const root = tmp('rank');
    const entries: Record<string, ReturnType<typeof recallEntry>> = {};
    const dates = ['2026-09-01', '2026-09-03', '2026-09-02', '2026-09-07', '2026-09-05', '2026-09-06', '2026-09-04'];
    dates.forEach((date, i) => {
      entries[`decision.${date}-d${i}`] = recallEntry('decision', `Decision ${i}`, `.cortex/atlas/decisions/${date}-d${i}.md`, date, ['usage', 'sessions']);
    });
    entries['evidence.2026-09-15-single'] = recallEntry('evidence', 'Single hit', '.cortex/atlas/evidence/2026-09-15-single.md', '2026-09-15', ['usage']);
    writeRecallIndexFixture(root, recallIndexFixture({}, entries));
    const { code, out } = await cortex(root, ['recall', 'usage', 'sessions']);
    expect(code).toBe(0);
    const lines = out.split('\n');
    expect(lines).toHaveLength(5);
    expect(lines.map((l) => l.split(' ')[1])).toEqual(['2026-09-07', '2026-09-06', '2026-09-05', '2026-09-04', '2026-09-03']);
    expect(out).not.toContain('single');
    expect(lines[0]).toBe('decision 2026-09-07 decision.2026-09-07-d3 — Decision 3 (.cortex/atlas/decisions/2026-09-07-d3.md)');
  });
});

// ---------------------------------------------------------------------------
// AC: recall filters by kind and honours a ref-shaped token
// ---------------------------------------------------------------------------
describe('recall.why — recall filters by kind and honours a ref-shaped token', () => {
  it('`recall schema:§5 --kind evidence` prints the one evidence line', async () => {
    const root = tmp('kind');
    writeRecallIndexFixture(root, sampleRecallIndex());
    const { code, out } = await cortex(root, ['recall', 'schema:§5', '--kind', 'evidence']);
    expect(code).toBe(0);
    expect(out).toBe('evidence 2026-09-15 evidence.2026-09-15-usage — Cortex usage over 41 sessions (.cortex/atlas/evidence/2026-09-15-usage.md)');
  });

  it('without --kind both carriers of schema:§5 print, and the flag may come first', async () => {
    const root = tmp('kind-both');
    writeRecallIndexFixture(root, sampleRecallIndex());
    const both = await cortex(root, ['recall', 'schema:§5']);
    expect(both.out.split('\n')).toHaveLength(2);
    const first = await cortex(root, ['recall', '--kind', 'decision', 'schema:§5']);
    expect(first.out).toMatch(/^decision 2026-08-05 decision\.2026-08-05-insight-pull-only-stance-reversed — /);
  });
});

// ---------------------------------------------------------------------------
// AC: No matches is exit 0
// ---------------------------------------------------------------------------
describe('recall.why — no matches is exit 0', () => {
  it('prints `No matches.`', async () => {
    const root = tmp('none');
    writeRecallIndexFixture(root, sampleRecallIndex());
    const { code, out, err } = await cortex(root, ['recall', 'zxqv', 'plork']);
    expect(code).toBe(0);
    expect(out).toBe('No matches.');
    expect(err).toBe('');
  });
});

// ---------------------------------------------------------------------------
// AC: A missing index is exit 1 with the scan hint (Rule 2, both halves)
// ---------------------------------------------------------------------------
describe('recall.why — a missing index is exit 1 with the scan hint', () => {
  it('no .cortex/ at all: both verbs exit 1 naming the file and cortex scan', async () => {
    const root = tmp('no-cortex');
    for (const argv of [['why', 'R-001'], ['recall', 'usage']]) {
      const { code, out, err } = await cortex(root, argv);
      expect(code).toBe(1);
      expect(out).toBe('');
      expect(err).toBe(`cortex ${argv[0]}: no recall index at .cortex/recall-index.json — run \`cortex scan\`.`);
    }
  });

  it('a malformed index says malformed, exit 1', async () => {
    const root = tmp('malformed');
    writeRecallIndexFixture(root, '{not json');
    const { code, err } = await cortex(root, ['why', 'R-001']);
    expect(code).toBe(1);
    expect(err).toBe('cortex why: malformed recall index at .cortex/recall-index.json — run `cortex scan`.');
  });
});

// ---------------------------------------------------------------------------
// AC: Bad grammar is exit 2
// ---------------------------------------------------------------------------
describe('recall.why — bad grammar is exit 2', () => {
  const cases: string[][] = [['why'], ['recall'], ['recall', 'x', '--kind', 'rumour'], ['why', 'R-001', '--verbose']];
  for (const argv of cases) {
    it(`cortex ${argv.join(' ')} → 2, usage on stderr, nothing on stdout`, async () => {
      const root = tmp('grammar');
      writeRecallIndexFixture(root, sampleRecallIndex());
      const { code, out, err } = await cortex(root, argv);
      expect(code).toBe(2);
      expect(out).toBe('');
      expect(err.split('\n')).toHaveLength(1);
      expect(err).toMatch(/usage: cortex (why|recall)/);
    });
  }

  it('grammar is checked before the index — no index still exits 2', async () => {
    const root = tmp('grammar-no-index');
    const { code } = await cortex(root, ['why']);
    expect(code).toBe(2);
  });

  it('two operands to why is a grammar error', async () => {
    const root = tmp('grammar-two');
    writeRecallIndexFixture(root, sampleRecallIndex());
    const { code, err } = await cortex(root, ['why', 'R-001', 'R-002']);
    expect(code).toBe(2);
    expect(err).toMatch(/usage: cortex why/);
  });
});

// ---------------------------------------------------------------------------
// 3.4 fifth revision — Bugs: and Rules: sections, the bug sub-line, --json
// bugs, and the three compass kinds in --kind (recall.why Rules 1, 4, 5)
// ---------------------------------------------------------------------------
const XREF = 'src/schema/checks/xref.ts';
const B019_ENTRY = recallEntry('bug', 'Duplicate ids pass validate', '.cortex/compass/bugs/B-019-x.md', '2026-09-15');
const B020_ENTRY = recallEntry('bug', 'Promotion refused', '.cortex/compass/bugs/B-020-x.md', '2026-09-16');
const R001_ENTRY = recallEntry('rule', 'Core makes no LLM calls', '.cortex/compass/rules/R-001-core.md', '');
const R002_ENTRY = recallEntry('rule', 'Bugs seven-type taxonomy', '.cortex/compass/rules/R-002-bugs.md', '');

function bugFile(fields: string[]): string {
  return ['---', 'id: B-019', 'title: Duplicate ids pass validate', 'type: incomplete-rule', 'severity: high', ...fields, 'affects: [src/schema/checks/xref.ts]', 'opened: 2026-09-15T17:00:00Z', '---', '', '# B-019', ''].join('\n');
}

function bugProject(label: string, fields: string[] | null = ['status: triaged', 'owner: pedro', 'fix_in_flight: fix/xref-unique']): string {
  const root = tmp(label);
  writeRecallIndexFixture(root, recallIndexFixture(
    { [XREF]: recallSubject({ rules: ['R-001'], bugs: ['B-019'] }) },
    { 'B-019': B019_ENTRY, 'R-001': R001_ENTRY },
  ));
  if (fields !== null) write(root, '.cortex/compass/bugs/B-019-x.md', bugFile(fields));
  return root;
}

describe('recall.why — why lists the rule and the open bug on a source file, with the bug\'s currency fields', () => {
  it('AC: the heading gains · 1 bugs · 1 rules; Bugs: then its sub-line; Rules: with R-001; --json bugs.found_at_commit is null', async () => {
    const root = bugProject('bugs-ac');
    const { code, out } = await cortex(root, ['why', XREF]);
    expect(code).toBe(0);
    expect(out.split('\n')).toEqual([
      `${XREF} (path) — 0 decided · 0 evidence · 0 open · 0 observation themes · 1 bugs · 1 rules`,
      'Bugs:',
      '  B-019  triaged — Duplicate ids pass validate  (.cortex/compass/bugs/B-019-x.md)',
      '    owner=pedro  fix=fix/xref-unique  found_at=-',
      'Rules:',
      '  R-001  Core makes no LLM calls  (.cortex/compass/rules/R-001-core.md)',
    ]);
    const json = await cortex(root, ['why', XREF, '--json']);
    const parsed = JSON.parse(json.out) as { subject: Record<string, string[]>; bugs: Record<string, Record<string, string | null>>; entries: Record<string, unknown> };
    expect(parsed.bugs['B-019']).toEqual({ status: 'triaged', owner: 'pedro', fix_in_flight: 'fix/xref-unique', found_at_commit: null });
    expect(parsed.subject).toEqual({ decided: [], evidence: [], threads: [], observations: [], rules: ['R-001'], bugs: ['B-019'] });
    expect(Object.keys(parsed.entries).sort()).toEqual(['B-019', 'R-001']);
    expect(Object.keys(parsed)).toEqual(['bugs', 'entries', 'findings', 'key', 'ref', 'subject']);
  });

  it('the sub-line is omitted when all three fields are absent; found_at renders when present; an unreadable file renders (fields unreadable)', async () => {
    const bare = bugProject('bugs-bare', ['status: open']);
    const bareOut = (await cortex(bare, ['why', XREF])).out.split('\n');
    expect(bareOut[2]).toBe('  B-019  open — Duplicate ids pass validate  (.cortex/compass/bugs/B-019-x.md)');
    expect(bareOut[3]).toBe('Rules:');

    const stamped = bugProject('bugs-stamped', ['status: open', 'found_at_commit: 1a0174c']);
    expect((await cortex(stamped, ['why', XREF])).out.split('\n')[3]).toBe('    owner=-  fix=-  found_at=1a0174c');
    const parsed = JSON.parse((await cortex(stamped, ['why', XREF, '--json'])).out) as { bugs: Record<string, Record<string, string | null>> };
    expect(parsed.bugs['B-019']).toEqual({ status: 'open', owner: null, fix_in_flight: null, found_at_commit: '1a0174c' });

    const missing = bugProject('bugs-missing', null);
    const missingOut = (await cortex(missing, ['why', XREF])).out.split('\n');
    expect(missingOut[2]).toBe('  B-019  - — Duplicate ids pass validate  (.cortex/compass/bugs/B-019-x.md)');
    expect(missingOut[3]).toBe('    (fields unreadable)');
    const missingJson = JSON.parse((await cortex(missing, ['why', XREF, '--json'])).out) as { bugs: Record<string, Record<string, string | null>> };
    expect(missingJson.bugs['B-019']).toEqual({ status: null, owner: null, fix_in_flight: null, found_at_commit: null });
  });

  it('bugs list newest opened first; rules in id order with no file read; the sections sit after Open: and before Observations:', async () => {
    const root = tmp('bugs-order');
    const base = sampleRecallIndex();
    writeRecallIndexFixture(root, recallIndexFixture(
      { 'R-001': recallSubject({ threads: ['T-004'], observations: ['working-style'], rules: ['R-002', 'R-001'], bugs: ['B-019', 'B-020'] }) },
      { ...base.entries, 'B-019': B019_ENTRY, 'B-020': B020_ENTRY, 'R-001': R001_ENTRY, 'R-002': R002_ENTRY },
    ));
    write(root, '.cortex/compass/bugs/B-019-x.md', bugFile(['status: open']));
    write(root, '.cortex/compass/bugs/B-020-x.md', bugFile(['status: triaged']).replace('B-019', 'B-020'));
    const { out } = await cortex(root, ['why', 'R-001']);
    const lines = out.split('\n');
    expect(lines[0]).toBe('R-001 (rule) — 0 decided · 0 evidence · 1 open · 1 observation themes · 2 bugs · 2 rules');
    const order = ['Open:', 'Bugs:', 'Rules:', 'Observations: working-style'].map((h) => lines.indexOf(h));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(lines.indexOf('  B-020  triaged — Promotion refused  (.cortex/compass/bugs/B-020-x.md)')).toBeLessThan(lines.indexOf('  B-019  open — Duplicate ids pass validate  (.cortex/compass/bugs/B-019-x.md)'));
    expect(lines.slice(lines.indexOf('Rules:') + 1, lines.indexOf('Rules:') + 3)).toEqual([
      '  R-001  Core makes no LLM calls  (.cortex/compass/rules/R-001-core.md)',
      '  R-002  Bugs seven-type taxonomy  (.cortex/compass/rules/R-002-bugs.md)',
    ]);
  });
});

describe('recall.why — recall filters by a compass kind', () => {
  it('AC: `recall scheduled tasks --kind compass-doc` prints the one compass-doc line with no date', async () => {
    const root = tmp('kind-compass');
    writeRecallIndexFixture(root, recallIndexFixture(
      {},
      {
        'compass.environment': recallEntry('compass-doc', 'Environment', '.cortex/compass/environment.md', '', ['scheduled', 'tasks', 'environment']),
        'R-001': recallEntry('rule', 'Scheduled tasks are macOS only', '.cortex/compass/rules/R-001-x.md', '', ['scheduled', 'tasks', 'macos', 'only']),
      },
    ));
    const { code, out } = await cortex(root, ['recall', 'scheduled', 'tasks', '--kind', 'compass-doc']);
    expect(code).toBe(0);
    expect(out).toBe('compass-doc  compass.environment — Environment (.cortex/compass/environment.md)');
    const rule = await cortex(root, ['recall', 'scheduled', 'tasks', '--kind', 'rule']);
    expect(rule.out).toBe('rule  R-001 — Scheduled tasks are macOS only (.cortex/compass/rules/R-001-x.md)');
    const both = await cortex(root, ['recall', 'scheduled', 'tasks']);
    expect(both.out.split('\n')).toHaveLength(2);
    const bug = await cortex(root, ['recall', 'scheduled', 'tasks', '--kind', 'bug']);
    expect(bug.out).toBe('No matches.');
  });

  it('the --kind enum is the seven kinds; the usage line names them', async () => {
    const root = tmp('kind-enum');
    writeRecallIndexFixture(root, sampleRecallIndex());
    const { code, err } = await cortex(root, ['recall', 'x', '--kind', 'rumour']);
    expect(code).toBe(2);
    expect(err).toContain('decision|evidence|thread|observation|rule|compass-doc|bug');
  });
});
