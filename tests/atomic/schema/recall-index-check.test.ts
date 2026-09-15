/**
 * Atomic tests — check.recall-index (schema §4.11, Appendix A; spec
 * `recall.recall-index` Rule 13). The check is called directly over a tmp root
 * holding a hand-written `.cortex/recall-index.json`; only when the file exists.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { checkRecallIndex } from '../../../src/schema/checks/recall-index.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/hooks-harness.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`recall-index-check-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function writeIndex(root: string, content: string): string {
  const file = path.join(root, '.cortex', 'recall-index.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf-8');
  return file;
}

function valid(): Record<string, unknown> {
  return {
    schemaVersion: '3.4',
    generated: '2026-09-15T16:00:00.000Z',
    subjects: {
      'R-001': { decided: ['decision.2026-07-01-a'], evidence: ['evidence.2026-09-15-usage'], threads: ['T-001'], observations: ['working-style'] },
    },
    entries: {
      'decision.2026-07-01-a': { kind: 'decision', title: 'a', path: '.cortex/atlas/decisions/2026-07-01-a.md', date: '2026-07-01T00:00:00.000Z', keywords: ['R-001'] },
      'evidence.2026-09-15-usage': { kind: 'evidence', title: 'usage', path: '.cortex/atlas/evidence/2026-09-15-usage.md', date: '2026-09-15T00:00:00.000Z', keywords: ['usage'] },
      'T-001': { kind: 'thread', title: 'q', path: '.cortex/pulse/threads/T-001-q.md', date: '2026-09-15T10:00:00.000Z', keywords: [] },
      'observation.working-style': { kind: 'observation', title: 'working-style', path: '.cortex/insight/observations/working-style.md', date: '2026-09-10T09:00:00Z', keywords: ['style', 'working'] },
    },
    counters: { subjects: 1, entries: 4, droppedRefs: 0 },
  };
}

function run(root: string, doc: unknown): ReturnType<typeof checkRecallIndex> {
  writeIndex(root, typeof doc === 'string' ? doc : JSON.stringify(doc, null, 2) + '\n');
  return checkRecallIndex(root);
}

describe('check.recall-index: absence is never a finding (Rule 13)', () => {
  it('no file → no violations', () => {
    const root = tmp('absent');
    fs.mkdirSync(path.join(root, '.cortex'), { recursive: true });
    expect(checkRecallIndex(root)).toEqual([]);
  });

  it('a valid index → no violations', () => {
    const root = tmp('valid');
    expect(run(root, valid())).toEqual([]);
  });
});

describe('check.recall-index: shape errors (Rule 13; clause §4.11; severity error)', () => {
  it('invalid JSON → exactly one error at the file', () => {
    const root = tmp('json');
    const violations = run(root, '{ not json');
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ severity: 'error', check: 'check.recall-index', clause: '§4.11' });
    expect(violations[0]?.location.path).toBe(path.join(root, '.cortex', 'recall-index.json'));
  });

  it('a JSON array is not an index → one error', () => {
    const root = tmp('array');
    expect(run(root, [])).toHaveLength(1);
  });

  it('every missing top-level key is one error naming the key', () => {
    const root = tmp('keys');
    const violations = run(root, { schemaVersion: '3.4' });
    expect(violations.map((v) => v.location.key).sort()).toEqual(['counters', 'entries', 'generated', 'subjects']);
    expect(violations.every((v) => v.severity === 'error')).toBe(true);
  });

  it('schemaVersion must be a MAJOR.MINOR string', () => {
    const root = tmp('version');
    expect(run(root, { ...valid(), schemaVersion: 3.4 })).toHaveLength(1);
    expect(run(root, { ...valid(), schemaVersion: '3' })).toHaveLength(1);
    expect(run(root, { ...valid(), schemaVersion: '3.4.1' })).toHaveLength(1);
  });

  it('a subject missing one of the four lists, or carrying a non-string element, is an error at key subjects', () => {
    const root = tmp('subject-shape');
    const doc = valid();
    (doc['subjects'] as Record<string, unknown>)['R-002'] = { decided: [], evidence: [], threads: [] };
    (doc['subjects'] as Record<string, unknown>)['R-003'] = { decided: [1], evidence: [], threads: [], observations: [] };
    const violations = run(root, doc);
    expect(violations).toHaveLength(2);
    expect(violations.every((v) => v.location.key === 'subjects')).toBe(true);
    expect(violations.map((v) => v.message).join('\n')).toMatch(/R-002/);
    expect(violations.map((v) => v.message).join('\n')).toMatch(/R-003/);
  });

  it('an id in decided/evidence/threads absent from entries is one error naming the id', () => {
    const root = tmp('dangling-id');
    const doc = valid();
    (doc['subjects'] as Record<string, Record<string, string[]>>)['R-001']!['decided'] = ['decision.2026-07-01-a', 'decision.gone'];
    const violations = run(root, doc);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain('decision.gone');
    expect(violations[0]?.location.key).toBe('subjects');
  });

  it('an observation theme is checked against the observation.<theme> entry key', () => {
    const root = tmp('dangling-theme');
    const doc = valid();
    (doc['subjects'] as Record<string, Record<string, string[]>>)['R-001']!['observations'] = ['working-style', 'audience'];
    const violations = run(root, doc);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain('observation.audience');
  });

  it('an entry with a kind outside the enum or an empty path is an error at key entries', () => {
    const root = tmp('entry-shape');
    const doc = valid();
    (doc['entries'] as Record<string, unknown>)['x'] = { kind: 'rule', title: 'x', path: '.cortex/x.md', date: '', keywords: [] };
    (doc['entries'] as Record<string, unknown>)['y'] = { kind: 'decision', title: 'y', path: '', date: '', keywords: [] };
    const violations = run(root, doc);
    expect(violations).toHaveLength(2);
    expect(violations.every((v) => v.location.key === 'entries')).toBe(true);
    expect(violations.map((v) => v.message).join('\n')).toMatch(/"x"/);
    expect(violations.map((v) => v.message).join('\n')).toMatch(/"y"/);
  });

  it('a non-object subjects or entries value is one error and does not throw', () => {
    const root = tmp('non-object');
    expect(run(root, { ...valid(), subjects: [] })).toHaveLength(1);
    expect(run(root, { ...valid(), entries: 'nope' })).toHaveLength(1);
  });
});
