/**
 * Atomic tests — loops.session-reading (6 rules; the 7 spec ACs as labelled
 * describes). Every test runs against a sandboxed tmp dir with a FAKE injected
 * home — the real ~/.claude is NEVER touched. The final AC snapshots the whole
 * fixture tree before and after a list/read/extract sequence to prove the layer
 * is strictly read-only.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { makeTmpDir, cleanTmp, snapshotTree } from '../../fixtures/init-harness.js';
import {
  projectSlug,
  listSessions,
  readSession,
  readSessionFile,
  extractMessages,
} from '../../../src/sessions/read.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`session-reading-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

/** Create `<home>/.claude/projects/<slug>/<id>.jsonl` with the given content. */
function writeTranscript(home: string, slug: string, id: string, content: string): string {
  const dir = path.join(home, '.claude', 'projects', slug);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.jsonl`);
  fs.writeFileSync(file, content, 'utf-8');
  return file;
}

// ===========================================================================
describe('Slug encoding is exact', () => {
  it("projectSlug('/Users/pedropacheco1/Documents/Projetos/cortex') === '-Users-pedropacheco1-Documents-Projetos-cortex'", () => {
    expect(projectSlug('/Users/pedropacheco1/Documents/Projetos/cortex')).toBe(
      '-Users-pedropacheco1-Documents-Projetos-cortex',
    );
  });
});

// ===========================================================================
describe('Project isolation', () => {
  it('a prefix-sharing sibling directory is never read', () => {
    const home = tmp('isolation-home');
    writeTranscript(home, '-tmp-proj-a', 's1', '{"type":"user","message":{"role":"user","content":"a"}}\n');
    writeTranscript(home, '-tmp-proj-a-b', 's2', '{"type":"user","message":{"role":"user","content":"b"}}\n');

    const sessions = listSessions('/tmp/proj-a', { home });
    expect(sessions.map((s) => s.id)).toEqual(['s1']);
  });
});

// ===========================================================================
describe('since-filter and ordering', () => {
  it('since between the first and second mtime → the two newer sessions, newest first', () => {
    const home = tmp('since-home');
    const slug = projectSlug('/tmp/proj');
    const f1 = writeTranscript(home, slug, 'oldest', '{"type":"user","message":{"role":"user","content":"1"}}\n');
    const f2 = writeTranscript(home, slug, 'middle', '{"type":"user","message":{"role":"user","content":"2"}}\n');
    const f3 = writeTranscript(home, slug, 'newest', '{"type":"user","message":{"role":"user","content":"3"}}\n');
    // Deterministic mtimes (seconds since epoch): 1000 < 2000 < 3000.
    fs.utimesSync(f1, 1000, 1000);
    fs.utimesSync(f2, 2000, 2000);
    fs.utimesSync(f3, 3000, 3000);

    const all = listSessions('/tmp/proj', { home });
    expect(all.map((s) => s.id)).toEqual(['newest', 'middle', 'oldest']);

    const since = new Date(1500 * 1000); // strictly between oldest (1000s) and middle (2000s)
    const filtered = listSessions('/tmp/proj', { home, since });
    expect(filtered.map((s) => s.id)).toEqual(['newest', 'middle']);
  });
});

// ===========================================================================
describe('Tolerant parse yields the readable parts', () => {
  it('3 valid + 2 malformed + 1 valid unknown-type → 4 entries (type preserved), skipped === 2', () => {
    const home = tmp('tolerant-home');
    const slug = projectSlug('/tmp/proj');
    const lines = [
      '{"type":"user","message":{"role":"user","content":"hi"},"timestamp":"2026-07-02T00:00:00Z"}',
      '{ this is not json',
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"yo"}]}}',
      'also }} not json {{',
      '{"type":"summary","summary":"a recap"}',
      '{"type":"last-prompt","prompt":"a future format we do not model"}',
    ];
    const file = writeTranscript(home, slug, 'mixed', lines.join('\n') + '\n');

    const result = readSessionFile(file);
    expect(result.entries).toHaveLength(4);
    expect(result.skipped).toBe(2);
    // unknown type included and preserved verbatim
    expect(result.entries.map((e) => e.type)).toEqual(['user', 'assistant', 'summary', 'last-prompt']);
    const lastPrompt = result.entries.find((e) => e.type === 'last-prompt');
    expect(lastPrompt?.prompt).toBe('a future format we do not model');
  });
});

// ===========================================================================
describe('Message extraction', () => {
  it('interleaved message/non-message entries → only user/assistant texts, in order, with timestamps', () => {
    const home = tmp('extract-home');
    const slug = projectSlug('/tmp/proj');
    const lines = [
      '{"type":"summary","summary":"ignored"}',
      '{"type":"user","message":{"role":"user","content":"first question"},"timestamp":"2026-07-02T00:00:01Z"}',
      '{"type":"mode","mode":"ignored"}',
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"an answer"}]},"timestamp":"2026-07-02T00:00:02Z"}',
      '{"type":"last-prompt","prompt":"ignored"}',
      '{"type":"user","message":{"role":"user","content":"second question"},"timestamp":"2026-07-02T00:00:03Z"}',
    ];
    const file = writeTranscript(home, slug, 'convo', lines.join('\n') + '\n');

    const { entries } = readSessionFile(file);
    const messages = extractMessages(entries);
    expect(messages).toEqual([
      { role: 'user', text: 'first question', timestamp: '2026-07-02T00:00:01Z' },
      { role: 'assistant', text: 'an answer', timestamp: '2026-07-02T00:00:02Z' },
      { role: 'user', text: 'second question', timestamp: '2026-07-02T00:00:03Z' },
    ]);
  });
});

// ===========================================================================
describe('Missing history is empty, not an error', () => {
  it('no projects/<slug>/ directory → empty list, no throw', () => {
    const home = tmp('missing-home');
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true }); // exists, but no projects/<slug>
    expect(() => listSessions('/tmp/never-initialised', { home })).not.toThrow();
    expect(listSessions('/tmp/never-initialised', { home })).toEqual([]);
  });
});

// ===========================================================================
describe('Strictly read-only', () => {
  it('a list/read/extract sequence creates, modifies, or deletes nothing', () => {
    const home = tmp('readonly-home');
    const projectRoot = tmp('readonly-project');
    const slug = projectSlug('/tmp/proj');
    writeTranscript(
      home,
      slug,
      's1',
      '{"type":"user","message":{"role":"user","content":"q"},"timestamp":"2026-07-02T00:00:00Z"}\n' +
        '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"a"}]}}\n' +
        'malformed line\n',
    );
    // A file under the project root too, to prove the project side is untouched.
    fs.writeFileSync(path.join(projectRoot, 'marker.txt'), 'do not touch', 'utf-8');

    const homeBefore = snapshotTree(home);
    const projectBefore = snapshotTree(projectRoot);

    for (const session of listSessions('/tmp/proj', { home })) {
      const { entries } = readSession('/tmp/proj', session.id, { home });
      extractMessages(entries);
    }
    // Also exercise a missing-history read against the project root itself.
    listSessions(projectRoot, { home });

    expect(snapshotTree(home)).toEqual(homeBefore);
    expect(snapshotTree(projectRoot)).toEqual(projectBefore);
  });
});
