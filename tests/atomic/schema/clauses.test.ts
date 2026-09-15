/**
 * Atomic tests — schema.schema-clauses (schema §6.2): the `schema:§N[.M[.K]]`
 * grammar and the heading-scan resolver over `cortex-schema.md`. Sandboxed
 * tmp roots only; every document is built from the ACs' headings.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  CLAUSE_REF_RE,
  clauseNumber,
  clauseResolves,
  loadClauseIndex,
} from '../../../src/schema/clauses.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/hooks-harness.js';

// `import * as fs` yields a sealed namespace under ESM, so the read counter is a
// partial module mock: the real readFileSync, wrapped so calls can be counted.
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});
const readFileSpy = fs.readFileSync as unknown as ReturnType<typeof vi.fn>;

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`clauses-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  readFileSpy.mockClear();
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function writeSchemaDoc(root: string, body: string): string {
  const p = path.join(root, 'cortex-schema.md');
  fs.writeFileSync(p, body, 'utf-8');
  return p;
}

const AC_DOC = [
  '# Cortex Schema',
  '',
  '**Schema version:** `3.4`',
  '',
  '## 6. Cross-reference conventions',
  '',
  'prose',
  '',
  '### 6.2 Addressable schema clauses',
  '',
  '#### 4.10.11 Project-context observations',
  '',
  '## Appendix A — check table',
  '',
].join('\n');

describe('AC: a present clause resolves at every depth', () => {
  it('schema:§6, schema:§6.2 and schema:§4.10.11 all resolve', () => {
    const root = tmp('present');
    writeSchemaDoc(root, AC_DOC);
    const index = loadClauseIndex(root);
    expect(clauseResolves(index, 'schema:§6')).toBe(true);
    expect(clauseResolves(index, 'schema:§6.2')).toBe(true);
    expect(clauseResolves(index, 'schema:§4.10.11')).toBe(true);
  });

  it('the index holds exactly the numbered headings found', () => {
    const root = tmp('set');
    writeSchemaDoc(root, AC_DOC);
    expect([...loadClauseIndex(root)].sort()).toEqual(['4.10.11', '6', '6.2']);
  });
});

describe('AC: an absent clause does not resolve', () => {
  it('schema:§6.9 and schema:§99 do not resolve against the same document', () => {
    const root = tmp('absent');
    writeSchemaDoc(root, AC_DOC);
    const index = loadClauseIndex(root);
    expect(clauseResolves(index, 'schema:§6.9')).toBe(false);
    expect(clauseResolves(index, 'schema:§99')).toBe(false);
  });

  it('an appendix heading carries no number and is not addressable', () => {
    const root = tmp('appendix');
    writeSchemaDoc(root, AC_DOC);
    const index = loadClauseIndex(root);
    expect([...index].some((n) => /appendix/i.test(n))).toBe(false);
  });
});

describe('AC: a retitled section still resolves', () => {
  it('### 6.2 Something else entirely still resolves schema:§6.2 — the number is the key', () => {
    const root = tmp('retitled');
    writeSchemaDoc(root, '## 6. Cross-reference conventions\n\n### 6.2 Something else entirely\n');
    expect(clauseResolves(loadClauseIndex(root), 'schema:§6.2')).toBe(true);
  });
});

describe('AC: headings inside code fences are ignored', () => {
  it('a ### 7.9 line that sits only inside a fence does not resolve', () => {
    const root = tmp('fenced');
    writeSchemaDoc(
      root,
      ['## 7. Formats', '', '```markdown', '### 7.9 Not a real section', '```', '', '### 7.1 Real', ''].join('\n'),
    );
    const index = loadClauseIndex(root);
    expect(clauseResolves(index, 'schema:§7.9')).toBe(false);
    expect(clauseResolves(index, 'schema:§7.1')).toBe(true);
    expect(clauseResolves(index, 'schema:§7')).toBe(true);
  });

  it('a fence with more than three backticks toggles the skip state too', () => {
    const root = tmp('fenced-long');
    writeSchemaDoc(root, ['````', '## 8. Inside', '````', '## 9. Outside', ''].join('\n'));
    const index = loadClauseIndex(root);
    expect(clauseResolves(index, 'schema:§8')).toBe(false);
    expect(clauseResolves(index, 'schema:§9')).toBe(true);
  });
});

describe('AC: malformed refs are rejected by the grammar, not looked up', () => {
  const malformed = ['schema:6', 'schema:§', 'schema:§4.10.11.2', 'schema:§ 5'];

  it.each(malformed)('%s fails the grammar and has no clause number', (ref) => {
    expect(CLAUSE_REF_RE.test(ref)).toBe(false);
    expect(clauseNumber(ref)).toBeUndefined();
  });

  it('well-formed refs pass the grammar and yield their number', () => {
    expect(clauseNumber('schema:§5')).toBe('5');
    expect(clauseNumber('schema:§4.11')).toBe('4.11');
    expect(clauseNumber('schema:§4.10.11')).toBe('4.10.11');
  });

  it('clauseResolves never consults the index for a malformed ref', () => {
    const index = new Set(['5', '6', '6.2']);
    const has = vi.spyOn(index, 'has');
    for (const ref of malformed) expect(clauseResolves(index, ref)).toBe(false);
    expect(has).not.toHaveBeenCalled();
  });
});

describe('AC: the document is read once per run', () => {
  it('loadClauseIndex opens cortex-schema.md exactly once and later lookups touch no file', () => {
    const root = tmp('once');
    const docPath = writeSchemaDoc(root, AC_DOC);
    readFileSpy.mockClear();
    const index = loadClauseIndex(root);
    const opens = readFileSpy.mock.calls.filter((c) => String(c[0]) === docPath).length;
    expect(opens).toBe(1);
    readFileSpy.mockClear();
    for (let i = 0; i < 30; i++) clauseResolves(index, i % 2 === 0 ? 'schema:§6.2' : 'schema:§99');
    expect(readFileSpy).not.toHaveBeenCalled();
  });

  it('the index is a snapshot — editing the document after the load changes no lookup', () => {
    const root = tmp('snapshot');
    writeSchemaDoc(root, AC_DOC);
    const index = loadClauseIndex(root);
    writeSchemaDoc(root, '## 6. Cross-reference conventions\n\n### 6.9 New section\n');
    expect(clauseResolves(index, 'schema:§6.2')).toBe(true);
    expect(clauseResolves(index, 'schema:§6.9')).toBe(false);
  });
});

describe('AC: a project without the schema document resolves nothing, without error', () => {
  it('returns an empty index and every clause ref is unresolved', () => {
    const root = tmp('no-doc');
    let index: Set<string> | undefined;
    expect(() => {
      index = loadClauseIndex(root);
    }).not.toThrow();
    expect(index?.size).toBe(0);
    expect(clauseResolves(index as Set<string>, 'schema:§6')).toBe(false);
  });

  it('a schema document somewhere other than the project root is never consulted', () => {
    const root = tmp('elsewhere');
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'cortex-schema.md'), '## 6. Cross-reference\n', 'utf-8');
    expect(loadClauseIndex(root).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3.4 second revision — `loadClauseHeadings`: the same scan, keeping the
// heading text (hooks.search-annotate Rule 5e reads it for the schema target).
// ---------------------------------------------------------------------------
import { loadClauseHeadings } from '../../../src/schema/clauses.js';

describe('loadClauseHeadings — heading text alongside the number (search-annotate Rule 5e)', () => {
  const HEADINGS_DOC = [
    '# Cortex Schema',
    '',
    '## 5. Hook payload contracts',
    '',
    '### 4.11 `recall-index.json` — the compiled recall index (new at 3.4)',
    '',
    '```',
    '## 9. fake',
    '```',
    '',
    '## Appendix A — check table',
    '',
  ].join('\n');

  it('maps each numbered heading to its text with the number and its trailing dot or space trimmed', () => {
    const root = tmp('headings');
    writeSchemaDoc(root, HEADINGS_DOC);
    const headings = loadClauseHeadings(root);
    expect(headings.get('5')).toBe('Hook payload contracts');
    expect(headings.get('4.11')).toBe('`recall-index.json` — the compiled recall index (new at 3.4)');
    expect(headings.size).toBe(2);
  });

  it('skips a heading inside a fence and never maps an appendix', () => {
    const root = tmp('headings-fence');
    writeSchemaDoc(root, HEADINGS_DOC);
    const headings = loadClauseHeadings(root);
    expect(headings.has('9')).toBe(false);
    expect([...headings.values()].some((t) => /appendix/i.test(t))).toBe(false);
  });

  it('agrees with loadClauseIndex on the set of numbers', () => {
    const root = tmp('headings-agree');
    writeSchemaDoc(root, AC_DOC);
    expect([...loadClauseHeadings(root).keys()].sort()).toEqual([...loadClauseIndex(root)].sort());
  });

  it('a missing document yields an empty map without throwing', () => {
    const root = tmp('headings-missing');
    let headings: Map<string, string> | undefined;
    expect(() => {
      headings = loadClauseHeadings(root);
    }).not.toThrow();
    expect(headings?.size).toBe(0);
  });
});
