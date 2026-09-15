/**
 * Atomic tests — the shared recall query module (`hooks.search-annotate`
 * Rules 4–10 and 12; schema §4.11 "Consumers", §5 pointer-line grammar).
 * Every index is a hand-built literal written to a tmp `.cortex/recall-index.json`;
 * nothing here runs the compiler or opens frontmatter.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  STOP_TOKENS,
  loadRecallIndex,
  clearRecallIndexCache,
  tokenise,
  candidateKeys,
  keywordMatches,
  cutTitle,
  recallLine,
  decidedLine,
  markerLine,
  selectPointers,
} from '../../../src/recall/query.js';
import type { RecallEntry, RecallSubject } from '../../../src/recall/index.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/hooks-harness.js';
import {
  recallEntry,
  recallSubject,
  recallIndexFixture,
  sampleRecallIndex,
  writeRecallIndexFixture,
} from '../../fixtures/recall-query.js';

// The ESM `fs` namespace is sealed, so the read counter is a partial module
// mock: the real readFileSync, wrapped so calls can be counted.
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});
const readFileSpy = fs.readFileSync as unknown as ReturnType<typeof vi.fn>;

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`recall-query-${label}`);
  dirs.push(d);
  return d;
}
beforeEach(() => clearRecallIndexCache());
afterEach(() => {
  readFileSpy.mockClear();
  clearRecallIndexCache();
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

const IMPERATIVES = /\b(read|consult|check|should|you)\b/i;

// ---------------------------------------------------------------------------
// Task 0.2 — loader, tokeniser, candidate keys, matcher
// ---------------------------------------------------------------------------

describe('loadRecallIndex — one read per process per root, never a throw (Rule 10, Rule 12)', () => {
  it('loads a well-formed index and returns its subjects and entries', () => {
    const root = tmp('load');
    writeRecallIndexFixture(root, sampleRecallIndex());
    const index = loadRecallIndex(root);
    expect(index).not.toBeNull();
    expect(Object.keys(index?.subjects ?? {})).toContain('R-001');
    expect(index?.entries['T-004']?.kind).toBe('thread');
  });

  it('returns null when .cortex/recall-index.json is absent', () => {
    const root = tmp('absent');
    fs.mkdirSync(path.join(root, '.cortex'), { recursive: true });
    expect(loadRecallIndex(root)).toBeNull();
  });

  it('returns null without throwing on `{not json`', () => {
    const root = tmp('malformed');
    writeRecallIndexFixture(root, '{not json');
    let index: unknown = 'unset';
    expect(() => {
      index = loadRecallIndex(root);
    }).not.toThrow();
    expect(index).toBeNull();
  });

  it('returns null when the parsed value fails the §4.11 shape probe', () => {
    const subjectsIsString = tmp('shape-string');
    writeRecallIndexFixture(subjectsIsString, JSON.stringify({ subjects: 'nope', entries: {} }));
    expect(loadRecallIndex(subjectsIsString)).toBeNull();

    const listMissing = tmp('shape-list');
    writeRecallIndexFixture(
      listMissing,
      JSON.stringify({ schemaVersion: '3.4', generated: 'x', subjects: { 'R-001': { decided: ['a'] } }, entries: {} }),
    );
    expect(loadRecallIndex(listMissing)).toBeNull();

    const listNotStrings = tmp('shape-strings');
    writeRecallIndexFixture(
      listNotStrings,
      JSON.stringify({
        schemaVersion: '3.4',
        generated: 'x',
        subjects: { 'R-001': { decided: [1], evidence: [], threads: [], observations: [] } },
        entries: {},
      }),
    );
    expect(loadRecallIndex(listNotStrings)).toBeNull();

    const entriesArray = tmp('shape-entries');
    writeRecallIndexFixture(entriesArray, JSON.stringify({ schemaVersion: '3.4', generated: 'x', subjects: {}, entries: [] }));
    expect(loadRecallIndex(entriesArray)).toBeNull();
  });

  it('a second call for the same root does not re-read the file', () => {
    const root = tmp('cache');
    const target = writeRecallIndexFixture(root, sampleRecallIndex());
    readFileSpy.mockClear();
    const first = loadRecallIndex(root);
    const second = loadRecallIndex(root);
    const reads = readFileSpy.mock.calls.filter((c) => String(c[0]) === target).length;
    expect(reads).toBe(1);
    expect(second).toBe(first);
  });

  it('the cache is keyed by the resolved root — a relative and an absolute spelling share one read', () => {
    const root = tmp('cache-key');
    const target = writeRecallIndexFixture(root, sampleRecallIndex());
    readFileSpy.mockClear();
    loadRecallIndex(root);
    loadRecallIndex(path.join(root, 'src', '..'));
    expect(readFileSpy.mock.calls.filter((c) => String(c[0]) === target).length).toBe(1);
  });

  it('a null result is cached too, and clearRecallIndexCache forces a re-read', () => {
    const root = tmp('cache-null');
    fs.mkdirSync(path.join(root, '.cortex'), { recursive: true });
    expect(loadRecallIndex(root)).toBeNull();
    writeRecallIndexFixture(root, sampleRecallIndex());
    expect(loadRecallIndex(root)).toBeNull();
    clearRecallIndexCache();
    expect(loadRecallIndex(root)).not.toBeNull();
  });
});

describe('tokenise — Rule 4', () => {
  it('STOP_TOKENS is exactly the spec-quoted list', () => {
    expect([...STOP_TOKENS].sort()).toEqual(['and', 'are', 'but', 'for', 'from', 'into', 'not', 'that', 'the', 'this', 'was', 'with']);
  });

  it('lowercases, splits on non-alphanumerics, keeps ≥3 chars, drops the stop-list, dedupes in first-seen order', () => {
    const { tokens } = tokenise('The Insight.*Stance for THIS hook: insight, of a 2-hit rule');
    expect(tokens).toEqual(['insight', 'stance', 'hook', 'hit', 'rule']);
  });

  it('regex metacharacters vanish in the split and an empty pattern yields no tokens', () => {
    expect(tokenise('insight.*stance').tokens).toEqual(['insight', 'stance']);
    expect(tokenise('[a-z]+\\d{3}').tokens).toEqual([]);
    expect(tokenise('').tokens).toEqual([]);
    expect(tokenise('').refs).toEqual([]);
  });

  it('collects ref-shaped spans verbatim and case-sensitively, with surrounding quotes and brackets stripped', () => {
    const { refs } = tokenise('"R-001" (B-018) T-004 `schema:§4.11` concept:hook-safety domain.pulse r-001 schema:§ t-004');
    expect(refs).toEqual(['R-001', 'B-018', 'T-004', 'schema:§4.11', 'concept:hook-safety', 'domain.pulse']);
  });

  it('a dotted id is a ref only when the index knows it as a subject or a keyword', () => {
    const index = sampleRecallIndex();
    expect(tokenise('pulse.usage and hooks.nothing', index).refs).toEqual(['pulse.usage']);
    expect(tokenise('pulse.usage', null).refs).toEqual([]);
  });

  it('a ref-shaped span still contributes its plain tokens', () => {
    const { tokens, refs } = tokenise('R-001 R-001');
    expect(refs).toEqual(['R-001']);
    expect(tokens).toEqual(['001']);
  });
});

describe('candidateKeys — Rule 5 (a)–(e), filtered to the subjects present', () => {
  const root = '/proj';

  it('a compass rule path yields the path, then R-NNN, then the parents up to .cortex/<module>', () => {
    const index = recallIndexFixture(
      {
        '.cortex/compass/rules/R-001-core-no-llm-calls.md': recallSubject(),
        'R-001': recallSubject(),
        '.cortex/compass/rules': recallSubject(),
        '.cortex/compass': recallSubject(),
        '.cortex': recallSubject(),
      },
      {},
    );
    expect(candidateKeys(root, '.cortex/compass/rules/R-001-core-no-llm-calls.md', index)).toEqual([
      '.cortex/compass/rules/R-001-core-no-llm-calls.md',
      'R-001',
      '.cortex/compass/rules',
      '.cortex/compass',
    ]);
  });

  it('a spec path yields its id (tree root and suffix stripped, / → .) and stops at .specflow/<tree>', () => {
    const index = recallIndexFixture(
      {
        'pulse.usage': recallSubject(),
        '.specflow/specs': recallSubject(),
        '.specflow': recallSubject(),
        'scaffolding.assistant-reaches-for-cortex-instead-of-guessing': recallSubject(),
      },
      {},
    );
    expect(candidateKeys(root, '.specflow/specs/pulse/usage.spec.md', index)).toEqual(['pulse.usage', '.specflow/specs']);
    expect(candidateKeys(root, './.specflow/specs-business/scaffolding/assistant-reaches-for-cortex-instead-of-guessing.business.md', index)).toEqual([
      'scaffolding.assistant-reaches-for-cortex-instead-of-guessing',
    ]);
  });

  it('a source path walks up to its first segment; a bare directory with a trailing slash is itself', () => {
    const index = recallIndexFixture({ 'src/pulse/usage.ts': recallSubject(), 'src/pulse': recallSubject(), src: recallSubject() }, {});
    expect(candidateKeys(root, 'src/pulse/usage.ts', index)).toEqual(['src/pulse/usage.ts', 'src/pulse', 'src']);
    expect(candidateKeys(root, 'src/', index)).toEqual(['src']);
  });

  it('compass bugs, domain terms and concepts (flat and scoped) map to their ids', () => {
    const index = recallIndexFixture(
      { 'B-018': recallSubject(), 'domain.pulse': recallSubject(), 'concept:hook-safety': recallSubject() },
      {},
    );
    expect(candidateKeys(root, '.cortex/compass/bugs/B-018-unmatched-verb.md', index)).toEqual(['B-018']);
    expect(candidateKeys(root, '.cortex/atlas/domain/pulse.md', index)).toEqual(['domain.pulse']);
    expect(candidateKeys(root, '.cortex/insight/concepts/hook-safety.md', index)).toEqual(['concept:hook-safety']);
    expect(candidateKeys(root, '.cortex/insight/scopes/core/concepts/hook-safety.md', index)).toEqual(['concept:hook-safety']);
  });

  it('an absolute path inside the project is made relative; one outside yields nothing; the root yields nothing', () => {
    const index = recallIndexFixture({ 'src/pulse': recallSubject(), src: recallSubject() }, {});
    expect(candidateKeys(root, '/proj/src/pulse/', index)).toEqual(['src/pulse', 'src']);
    expect(candidateKeys(root, '/elsewhere/src/pulse', index)).toEqual([]);
    expect(candidateKeys(root, '../src', index)).toEqual([]);
    expect(candidateKeys(root, '', index)).toEqual([]);
    expect(candidateKeys(root, '.', index)).toEqual([]);
    expect(candidateKeys(root, '/proj', index)).toEqual([]);
  });

  it('only keys present in subjects survive, deduplicated', () => {
    const index = recallIndexFixture({ src: recallSubject() }, {});
    expect(candidateKeys(root, 'src/pulse/usage.ts', index)).toEqual(['src']);
  });

  describe('(e) the schema document matches clause subjects by number or heading text', () => {
    const clauseIndex = () =>
      recallIndexFixture(
        {
          'schema:§5': recallSubject(),
          'schema:§4.11': recallSubject(),
          'schema:§6.2': recallSubject(),
          'schema:§9': recallSubject(),
          'cortex-schema.md': recallSubject(),
        },
        {},
      );

    function schemaRoot(): string {
      const r = tmp('schema');
      fs.writeFileSync(
        path.join(r, 'cortex-schema.md'),
        [
          '## 5. Hook payload contracts',
          '',
          '### 4.11 `recall-index.json` — the compiled recall index',
          '',
          '```',
          '## 9. fake frontmatter',
          '```',
          '',
          '### 6.2 Addressable schema clauses',
          '',
        ].join('\n'),
        'utf-8',
      );
      return r;
    }

    it('a heading-text token selects the clause; a number token selects by number; a fenced heading and a miss select nothing', () => {
      const r = schemaRoot();
      expect(candidateKeys(r, 'cortex-schema.md', clauseIndex(), ['payload'])).toEqual(['cortex-schema.md', 'schema:§5']);
      expect(candidateKeys(r, 'cortex-schema.md', clauseIndex(), ['4.11'])).toEqual(['cortex-schema.md', 'schema:§4.11']);
      expect(candidateKeys(r, 'cortex-schema.md', clauseIndex(), ['frontmatter'])).toEqual(['cortex-schema.md']);
    });

    it('with no pattern tokens (the PreRead / why callers) every clause subject is a candidate, sorted', () => {
      const r = schemaRoot();
      expect(candidateKeys(r, 'cortex-schema.md', clauseIndex())).toEqual(['cortex-schema.md', 'schema:§4.11', 'schema:§5', 'schema:§6.2', 'schema:§9']);
    });

    it('a non-schema target never expands clause subjects', () => {
      const r = schemaRoot();
      expect(candidateKeys(r, 'RULES.md', clauseIndex(), ['payload'])).toEqual([]);
    });
  });
});

describe('keywordMatches — Rule 6', () => {
  it('two distinct token hits qualify an entry; one plain hit does not', () => {
    const index = sampleRecallIndex();
    const two = keywordMatches(index, tokenise('insight.*stance').tokens, []);
    expect(two.map((m) => m.id)).toEqual(['decision.2026-08-05-insight-pull-only-stance-reversed']);
    expect(two[0]?.hits).toBe(2);
    expect(keywordMatches(index, tokenise('insight').tokens, [])).toEqual([]);
  });

  it('a ref-shaped span qualifies on one hit, and only entries carrying it verbatim', () => {
    const index = sampleRecallIndex();
    const { tokens, refs } = tokenise('schema:§5', index);
    const ids = keywordMatches(index, tokens, refs).map((m) => m.id);
    expect(ids).toContain('evidence.2026-09-15-usage');
    expect(ids).toContain('decision.2026-08-05-insight-pull-only-stance-reversed');
    expect(ids).not.toContain('T-004');
  });

  it('ranks by distinct hits descending, then date descending, then id ascending', () => {
    const index = recallIndexFixture(
      {},
      {
        'decision.2026-01-01-a': recallEntry('decision', 'a', 'p/a.md', '2026-01-01', ['alpha', 'beta', 'gamma']),
        'decision.2026-02-01-b': recallEntry('decision', 'b', 'p/b.md', '2026-02-01', ['alpha', 'beta']),
        'decision.2026-02-01-c': recallEntry('decision', 'c', 'p/c.md', '2026-02-01', ['alpha', 'beta']),
        'decision.2026-03-01-d': recallEntry('decision', 'd', 'p/d.md', '2026-03-01', ['alpha']),
      },
    );
    expect(keywordMatches(index, ['alpha', 'beta', 'gamma'], [])).toEqual([
      { id: 'decision.2026-01-01-a', hits: 3 },
      { id: 'decision.2026-02-01-b', hits: 2 },
      { id: 'decision.2026-02-01-c', hits: 2 },
    ]);
  });

  it('a kind filter narrows the population', () => {
    const index = sampleRecallIndex();
    const { tokens, refs } = tokenise('schema:§5', index);
    expect(keywordMatches(index, tokens, refs, 'evidence').map((m) => m.id)).toEqual(['evidence.2026-09-15-usage']);
  });

  it('a repeated token counts once', () => {
    const index = sampleRecallIndex();
    expect(keywordMatches(index, ['insight', 'insight'], [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Task 0.3 — the pointer-line formatter and selection (Rules 7–10)
// ---------------------------------------------------------------------------

describe('cutTitle and the two line shapes — Rule 7', () => {
  it('cutTitle leaves a short title alone and cuts a long one on a word boundary with a trailing …', () => {
    expect(cutTitle('Five-module architecture', 60)).toBe('Five-module architecture');
    const cut = cutTitle('Do you want the counter in state/ or at the pulse root?', 40);
    expect(cut).toBe('Do you want the counter in state/ or at…');
    expect(cut.length).toBeLessThanOrEqual(40);
    expect(cutTitle('abcdefghijklmnopqrstuvwxyz', 10)).toBe('abcdefghi…');
  });

  it('recallLine is `Recall: <kind> <YYYY-MM-DD> <title cut to 60> (<path>)`', () => {
    const index = sampleRecallIndex();
    expect(recallLine(index.entries['decision.2026-07-07-five-module-architecture'] as RecallEntry)).toBe(
      'Recall: decision 2026-07-07 Five-module architecture (.cortex/atlas/decisions/2026-07-07-five-module-architecture.md)',
    );
    const long = recallEntry('evidence', 'x '.repeat(100).trim(), 'p/e.md', '2026-09-15T15:58:00.000Z');
    const line = recallLine(long);
    expect(line.startsWith('Recall: evidence 2026-09-15 ')).toBe(true);
    expect(line.endsWith('… (p/e.md)')).toBe(true);
  });

  it('decidedLine is `Decided: <id> · Open: <T-id> <thread key text cut to 40>`', () => {
    expect(decidedLine('decision.2026-07-10-x', 'T-004', 'Do you want the counter in state/ or at the pulse root?')).toBe(
      'Decided: decision.2026-07-10-x · Open: T-004 Do you want the counter in state/ or at…',
    );
  });
});

describe('markerLine — the PreRead form (schema §5 row (c))', () => {
  it('lists Decided (max 3), Evidence (max 2), Open (max 2), newest first, empty parts omitted', () => {
    const entries = {
      'decision.2026-01-01-a': recallEntry('decision', 'a', 'p/a.md', '2026-01-01'),
      'decision.2026-03-01-c': recallEntry('decision', 'c', 'p/c.md', '2026-03-01'),
      'decision.2026-02-01-b': recallEntry('decision', 'b', 'p/b.md', '2026-02-01'),
      'evidence.2026-09-15-usage': recallEntry('evidence', 'u', 'p/u.md', '2026-09-15'),
      'T-004': recallEntry('thread', 't', 'p/t.md', '2026-09-15'),
    };
    const subject = recallSubject({
      decided: ['decision.2026-01-01-a', 'decision.2026-02-01-b', 'decision.2026-03-01-c'],
      evidence: ['evidence.2026-09-15-usage'],
      threads: ['T-004'],
    });
    const index = recallIndexFixture({ 'R-003': subject }, entries);
    expect(markerLine(subject, 'R-003', index)).toBe(
      'Decided: decision.2026-03-01-c, decision.2026-02-01-b, decision.2026-01-01-a · Evidence: evidence.2026-09-15-usage · Open: T-004',
    );
    expect(markerLine(recallSubject({ evidence: ['evidence.2026-09-15-usage'] }), 'pulse.usage', index)).toBe('Evidence: evidence.2026-09-15-usage');
  });

  it('appends ` · more: cortex why <key>` when any part was cut, and returns null for an empty subject', () => {
    const entries: Record<string, ReturnType<typeof recallEntry>> = {};
    const decided: string[] = [];
    for (let i = 1; i <= 4; i++) {
      const id = `decision.2026-0${i}-01-d${i}`;
      entries[id] = recallEntry('decision', `d${i}`, `p/d${i}.md`, `2026-0${i}-01`);
      decided.push(id);
    }
    const subject = recallSubject({ decided });
    const index = recallIndexFixture({ 'R-003': subject }, entries);
    expect(markerLine(subject, 'R-003', index)).toBe(
      'Decided: decision.2026-04-01-d4, decision.2026-03-01-d3, decision.2026-02-01-d2 · more: cortex why R-003',
    );
    expect(markerLine(recallSubject(), 'R-009', index)).toBeNull();
    expect(markerLine(recallSubject({ observations: ['working-style'] }), 'R-009', index)).toBeNull();
  });
});

describe('selectPointers — Rules 8–10', () => {
  const none = () => new Set<string>();

  it('AC: a grep into a subject directory points at the newest current decision', () => {
    const index = sampleRecallIndex();
    const { lines, fired } = selectPointers(index, ['R-001'], [], none());
    expect(lines).toEqual([
      'Recall: decision 2026-07-07 Five-module architecture (.cortex/atlas/decisions/2026-07-07-five-module-architecture.md)',
      'Recall: observation 2026-09-01 working-style (.cortex/insight/observations/working-style.md)',
    ]);
    expect(fired).toEqual(['R-001', 'decision.2026-07-07-five-module-architecture', 'observation.working-style']);
    expect(lines.join('\n').length).toBeLessThanOrEqual(240);
  });

  it('AC: a subject with a decision and an open thread gets the Decided line', () => {
    const index = sampleRecallIndex();
    const { lines } = selectPointers(index, ['.specflow/specs/pulse/hygiene.spec.md'], [], none());
    expect(lines[0]).toBe('Decided: decision.2026-07-10-x · Open: T-004 Do you want the counter in state/ or at…');
    expect(lines.length).toBe(1);
  });

  it('AC: a spec path matches by its id — the evidence entry is named via a Recall: evidence line', () => {
    const index = sampleRecallIndex();
    const { lines } = selectPointers(index, ['pulse.usage'], [], none());
    expect(lines).toEqual(['Recall: evidence 2026-09-15 Cortex usage over 41 sessions (.cortex/atlas/evidence/2026-09-15-usage.md)']);
  });

  it('AC: subject beats keyword, open thread beats older decision', () => {
    const index = recallIndexFixture(
      { 'src/pulse/usage.ts': recallSubject({ decided: ['decision.2026-07-01-a'], threads: ['T-009'] }) },
      {
        'decision.2026-07-01-a': recallEntry('decision', 'A', '.cortex/atlas/decisions/2026-07-01-a.md', '2026-07-01'),
        'T-009': recallEntry('thread', 'Where does the usage window live?', '.cortex/pulse/threads/T-009-x.md', '2026-09-01'),
        'decision.2026-09-01-b': recallEntry('decision', 'B', '.cortex/atlas/decisions/2026-09-01-b.md', '2026-09-01', ['usage', 'window']),
      },
    );
    const { lines } = selectPointers(index, ['src/pulse/usage.ts'], [{ id: 'decision.2026-09-01-b', hits: 2 }], none());
    expect(lines[0]).toBe('Decided: decision.2026-07-01-a · Open: T-009 Where does the usage window live?');
    expect(lines[1]).toBe('Recall: decision 2026-09-01 B (.cortex/atlas/decisions/2026-09-01-b.md)');
  });

  it('Rule 8 strength order: open thread > current decision > evidence > observation, newest first within a kind', () => {
    const entries = {
      'T-010': recallEntry('thread', 'Older thread', '.cortex/pulse/threads/T-010-older.md', '2026-08-01'),
      'T-011': recallEntry('thread', 'Newer thread', '.cortex/pulse/threads/T-011-newer.md', '2026-09-01'),
      'evidence.2026-09-15-e': recallEntry('evidence', 'Newest of all', '.cortex/atlas/evidence/2026-09-15-e.md', '2026-09-15'),
      'observation.style': recallEntry('observation', 'style', '.cortex/insight/observations/style.md', '2026-09-20'),
    };
    const index = recallIndexFixture(
      { 'R-005': recallSubject({ threads: ['T-010', 'T-011'], evidence: ['evidence.2026-09-15-e'], observations: ['style'] }) },
      entries,
    );
    const { lines } = selectPointers(index, ['R-005'], [], none());
    expect(lines).toEqual([
      'Recall: thread 2026-09-01 Newer thread (.cortex/pulse/threads/T-011-newer.md)',
      'Recall: thread 2026-08-01 Older thread (.cortex/pulse/threads/T-010-older.md) · more: cortex why R-005',
    ]);

    const sample = sampleRecallIndex();
    expect(selectPointers(sample, ['schema:§5'], [], none()).lines.map((l) => l.split(' ')[1])).toEqual(['decision', 'evidence']);
    const evidenceOnly = selectPointers(sample, ['schema:§5'], [], new Set(['decision.2026-08-05-insight-pull-only-stance-reversed']));
    expect(evidenceOnly.lines.map((l) => l.split(' ')[1])).toEqual(['evidence']);
  });

  it('without a subject match, up to two Recall: lines come from the top keyword entries', () => {
    const index = sampleRecallIndex();
    const hits = keywordMatches(index, tokenise('schema:§5', index).tokens, ['schema:§5']);
    const { lines, fired } = selectPointers(index, [], hits, none());
    expect(lines).toEqual([
      'Recall: evidence 2026-09-15 Cortex usage over 41 sessions (.cortex/atlas/evidence/2026-09-15-usage.md)',
      'Recall: decision 2026-08-05 Insight pull-only stance reversed (.cortex/atlas/decisions/2026-08-05-insight-pull-only-stance-reversed.md)',
    ]);
    expect(fired).toEqual(['evidence.2026-09-15-usage', 'decision.2026-08-05-insight-pull-only-stance-reversed']);
  });

  it('AC: the more tail names the subject', () => {
    const entries = {
      'decision.2026-01-01-a': recallEntry('decision', 'A', 'p/a.md', '2026-01-01'),
      'decision.2026-02-01-b': recallEntry('decision', 'B', 'p/b.md', '2026-02-01'),
      'decision.2026-03-01-c': recallEntry('decision', 'C', 'p/c.md', '2026-03-01'),
      'evidence.2026-04-01-e': recallEntry('evidence', 'E', 'p/e.md', '2026-04-01'),
    };
    const index = recallIndexFixture(
      { 'R-003': recallSubject({ decided: Object.keys(entries).slice(0, 3), evidence: ['evidence.2026-04-01-e'] }) },
      entries,
    );
    const { lines } = selectPointers(index, ['R-003'], [], none());
    expect(lines).toEqual(['Recall: decision 2026-03-01 C (p/c.md)', 'Recall: decision 2026-02-01 B (p/b.md) · more: cortex why R-003']);
  });

  it('AC: budget trims the title to 20, then drops the second line, then the tail', () => {
    const title = 'word '.repeat(40).trim();
    const entries = {
      'decision.2026-01-01-a': recallEntry('decision', title, '.cortex/atlas/decisions/2026-01-01-a.md', '2026-01-01'),
      'decision.2026-02-01-b': recallEntry('decision', title, '.cortex/atlas/decisions/2026-02-01-b.md', '2026-02-01'),
    };
    const index = recallIndexFixture({ 'R-003': recallSubject({ decided: Object.keys(entries) }) }, entries);
    const { lines } = selectPointers(index, ['R-003'], [], none());
    const payload = lines.join('\n');
    expect(lines.length).toBeLessThanOrEqual(2);
    expect(payload.length).toBeLessThanOrEqual(240);
    expect(lines[0]).toMatch(/^Recall: decision 2026-02-01 (word ){3}word…/);
    expect(lines[0]).toContain('(.cortex/atlas/decisions/2026-02-01-b.md)');
    expect(lines[1]).toContain('(.cortex/atlas/decisions/2026-01-01-a.md)');

    const longPath = `.cortex/atlas/decisions/${'p'.repeat(150)}.md`;
    const wide = recallIndexFixture(
      {
        'R-004': recallSubject({
          decided: ['decision.2026-01-01-w', 'decision.2026-02-01-v', 'decision.2026-03-01-u'],
        }),
      },
      {
        'decision.2026-01-01-w': recallEntry('decision', title, longPath, '2026-01-01'),
        'decision.2026-02-01-v': recallEntry('decision', title, longPath, '2026-02-01'),
        'decision.2026-03-01-u': recallEntry('decision', title, longPath, '2026-03-01'),
      },
    );
    const single = selectPointers(wide, ['R-004'], [], none());
    expect(single.lines.length).toBe(1);
    expect(single.lines[0]).not.toContain('more:');
    expect(single.lines.join('\n').length).toBeLessThanOrEqual(240);
    expect(single.fired).toEqual(['R-004', 'decision.2026-03-01-u']);
  });

  it('Rule 9: a fired subject falls through to the next candidate, a fired entry is skipped within a subject', () => {
    const index = sampleRecallIndex();
    const subjectFired = selectPointers(index, ['R-001', 'pulse.usage'], [], new Set(['R-001']));
    expect(subjectFired.lines[0]).toMatch(/^Recall: evidence 2026-09-15 /);
    expect(subjectFired.fired).toEqual(['pulse.usage', 'evidence.2026-09-15-usage']);

    const entryFired = selectPointers(index, ['.specflow/specs/pulse/hygiene.spec.md'], [], new Set(['T-004']));
    expect(entryFired.lines).toEqual(['Recall: decision 2026-07-10 Retention counter lives under state (.cortex/atlas/decisions/2026-07-10-x.md)']);

    const everythingFired = selectPointers(index, ['pulse.usage'], [{ id: 'evidence.2026-09-15-usage', hits: 2 }], new Set(['evidence.2026-09-15-usage']));
    expect(everythingFired.lines).toEqual([]);
    expect(everythingFired.fired).toEqual([]);
  });

  it('an entry named on line one is never repeated on line two', () => {
    const index = sampleRecallIndex();
    const { lines } = selectPointers(index, ['pulse.usage'], [{ id: 'evidence.2026-09-15-usage', hits: 2 }], none());
    expect(lines.length).toBe(1);
  });

  it('a subject whose member ids are absent from entries is skipped rather than rendered blank', () => {
    const index = recallIndexFixture({ 'R-008': recallSubject({ decided: ['decision.missing'] }) }, {});
    expect(selectPointers(index, ['R-008'], [], none())).toEqual({ lines: [], fired: [] });
  });

  it('AC: the imperative-free grammar — every line starts Recall: or Decided:, no instruction words', () => {
    const index = sampleRecallIndex();
    const payloads = [
      selectPointers(index, ['R-001'], [], none()).lines,
      selectPointers(index, ['pulse.usage'], [], none()).lines,
      selectPointers(index, ['schema:§5'], [], none()).lines,
      selectPointers(index, [], keywordMatches(index, ['insight', 'stance'], []), none()).lines,
    ].flat();
    expect(payloads.length).toBeGreaterThan(0);
    for (const line of payloads) {
      expect(line).toMatch(/^(Recall|Decided): /);
      expect(line).not.toMatch(IMPERATIVES);
    }
    expect(markerLine(index.subjects['schema:§5'] as RecallSubject, 'schema:§5', index)).not.toMatch(IMPERATIVES);
  });

  it('Rule 13: two calls with identical inputs return identical lines', () => {
    const index = sampleRecallIndex();
    const a = selectPointers(index, ['schema:§5', 'R-001'], [], none());
    const b = selectPointers(index, ['schema:§5', 'R-001'], [], none());
    expect(a).toEqual(b);
  });
});
