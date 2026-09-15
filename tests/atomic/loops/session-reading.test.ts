/**
 * Atomic tests — loops.session-reading (7 rules; the 12 spec ACs as labelled
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
  extractToolUses,
  sessionTitle,
} from '../../../src/sessions/read.js';
import {
  toolTurn,
  toolTurnAt,
  textTurn,
  bash,
  read,
  grep,
  writeTool,
  editTool,
  notebookEditTool,
  rawAssistantTurn,
  customTitleEntry,
  lastPromptEntry,
  writeSessionTranscript,
} from '../../fixtures/sessions.js';

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
        JSON.stringify(toolTurn(writeTool('/tmp/proj/out.md'))) + '\n' +
        JSON.stringify(customTitleEntry('ro')) + '\n' +
        'malformed line\n',
    );
    // A file under the project root too, to prove the project side is untouched.
    fs.writeFileSync(path.join(projectRoot, 'marker.txt'), 'do not touch', 'utf-8');

    const homeBefore = snapshotTree(home);
    const projectBefore = snapshotTree(projectRoot);

    for (const session of listSessions('/tmp/proj', { home })) {
      const { entries } = readSession('/tmp/proj', session.id, { home });
      extractMessages(entries);
      extractToolUses(entries);
      sessionTitle(entries);
    }
    // Also exercise a missing-history read against the project root itself.
    listSessions(projectRoot, { home });

    expect(snapshotTree(home)).toEqual(homeBefore);
    expect(snapshotTree(projectRoot)).toEqual(projectBefore);
  });
});

// ===========================================================================
// Rule 7 — tool-use extraction and session title.
// ===========================================================================
describe('Tool uses are extracted in order with paths', () => {
  it('Read/Edit/Write/NotebookEdit carry filePath, Grep carries nothing, order and timestamps preserved', () => {
    const home = tmp('tooluse-home');
    const root = '/tmp/proj';
    writeSessionTranscript(home, root, 'tools', [
      customTitleEntry('Tool session'),
      textTurn('user', 'please edit things'),
      toolTurnAt('2026-09-15T00:00:01Z', read('/tmp/proj/a.ts')),
      lastPromptEntry('please edit things'),
      rawAssistantTurn(
        [{ type: 'text', text: 'editing now' }, { type: 'tool_use', id: 'toolu_x', ...editTool('/tmp/proj/b.ts') }],
        '2026-09-15T00:00:02Z',
      ),
      textTurn('assistant', 'prose between tools'),
      toolTurnAt('2026-09-15T00:00:03Z', writeTool('/tmp/proj/c.md'), notebookEditTool('/tmp/proj/d.ipynb')),
      { type: 'mode', mode: 'default' },
      toolTurnAt('2026-09-15T00:00:04Z', grep('x')),
    ]);

    const { entries, skipped } = readSession(root, 'tools', { home });
    expect(skipped).toBe(0);
    const uses = extractToolUses(entries);
    expect(uses).toEqual([
      { name: 'Read', timestamp: '2026-09-15T00:00:01Z', filePath: '/tmp/proj/a.ts' },
      { name: 'Edit', timestamp: '2026-09-15T00:00:02Z', filePath: '/tmp/proj/b.ts' },
      { name: 'Write', timestamp: '2026-09-15T00:00:03Z', filePath: '/tmp/proj/c.md' },
      { name: 'NotebookEdit', timestamp: '2026-09-15T00:00:03Z', filePath: '/tmp/proj/d.ipynb' },
      { name: 'Grep', timestamp: '2026-09-15T00:00:04Z' },
    ]);
    // No record carries any other input field (no bodies, no patterns, no old/new strings).
    for (const use of uses) {
      expect(Object.keys(use).sort()).toEqual(
        Object.keys(use)
          .filter((k) => ['name', 'timestamp', 'filePath', 'command'].includes(k))
          .sort(),
      );
    }
    expect(JSON.stringify(uses)).not.toContain('file body that must not leak');
  });

  it('a user-role entry carrying tool_use-shaped parts is not an assistant tool use', () => {
    const entries = [
      { type: 'user', message: { role: 'user', content: [{ type: 'tool_use', name: 'Bash', input: { command: 'x' } }] } },
    ];
    expect(extractToolUses(entries)).toEqual([]);
  });

  it('an entry without a timestamp yields a record without a timestamp key', () => {
    const turn = toolTurn(read('/tmp/proj/a.ts'));
    delete turn['timestamp'];
    expect(extractToolUses([turn as { type: string }])).toEqual([{ name: 'Read', filePath: '/tmp/proj/a.ts' }]);
  });
});

describe('Bash commands are truncated', () => {
  it('a 500-char command is cut to exactly its first 200 chars; description is not carried', () => {
    const command = 'x'.repeat(150) + 'y'.repeat(50) + 'z'.repeat(300);
    const uses = extractToolUses([toolTurnAt('2026-09-15T00:00:00Z', bash(command))]);
    expect(uses).toHaveLength(1);
    expect(uses[0]?.command).toBe(command.slice(0, 200));
    expect(uses[0]?.command).toHaveLength(200);
    expect(uses[0]).toEqual({ name: 'Bash', timestamp: '2026-09-15T00:00:00Z', command: command.slice(0, 200) });
    expect(uses[0]).not.toHaveProperty('description');
  });

  it('a short command is carried whole', () => {
    const uses = extractToolUses([toolTurn(bash('pnpm vitest run'))]);
    expect(uses[0]?.command).toBe('pnpm vitest run');
  });
});

describe('Malformed tool-use parts are skipped, not thrown', () => {
  it('null part, nameless tool_use, string input, and tool_result → one record, no throw, no result leakage', () => {
    const entry = rawAssistantTurn(
      [
        null,
        { type: 'tool_use', id: 'toolu_1', input: { file_path: '/nope' } }, // no name
        { type: 'tool_use', id: 'toolu_2', name: 'Bash', input: 'not a record' },
        { type: 'tool_result', tool_use_id: 'toolu_0', content: 'SECRET RESULT BODY' },
        'a bare string part',
        { type: 'tool_use', id: 'toolu_3', name: 'Read', input: { file_path: '/tmp/proj/ok.ts' } },
      ],
      '2026-09-15T00:00:00Z',
    );
    let uses: ReturnType<typeof extractToolUses> = [];
    expect(() => {
      uses = extractToolUses([entry as { type: string }]);
    }).not.toThrow();
    expect(uses).toEqual([{ name: 'Read', timestamp: '2026-09-15T00:00:00Z', filePath: '/tmp/proj/ok.ts' }]);
    expect(JSON.stringify(uses)).not.toContain('SECRET RESULT BODY');
  });

  it('a tool_use whose input is a non-string file_path / command yields a name-only record', () => {
    const entry = rawAssistantTurn([
      { type: 'tool_use', name: 'Write', input: { file_path: 42 } },
      { type: 'tool_use', name: 'Bash', input: { command: ['not', 'a', 'string'] } },
    ]);
    expect(extractToolUses([entry as { type: string }])).toEqual([{ name: 'Write' }, { name: 'Bash' }]);
  });

  it('assistant entries with string content or no message do not throw', () => {
    const entries = [
      { type: 'assistant', message: { role: 'assistant', content: 'just text' } },
      { type: 'assistant' },
      { type: 'assistant', message: 'not a record' },
    ];
    expect(() => extractToolUses(entries)).not.toThrow();
    expect(extractToolUses(entries)).toEqual([]);
  });
});

describe('No tool use yields an empty array', () => {
  it('text-only messages plus non-message types → []', () => {
    const home = tmp('notools-home');
    const root = '/tmp/proj';
    writeSessionTranscript(home, root, 'plain', [
      { type: 'summary', summary: 'recap' },
      textTurn('user', 'question'),
      { type: 'mode', mode: 'default' },
      textTurn('assistant', 'answer'),
      lastPromptEntry(),
    ]);
    const { entries } = readSession(root, 'plain', { home });
    expect(extractToolUses(entries)).toEqual([]);
    expect(extractToolUses([])).toEqual([]);
  });
});

describe('Session title is read when present, undefined when absent', () => {
  it('present → the customTitle; absent → undefined', () => {
    const withTitle = [customTitleEntry('Cortex daily'), textTurn('user', 'q'), textTurn('assistant', 'a')];
    const without = [textTurn('user', 'q'), lastPromptEntry('q'), textTurn('assistant', 'a')];
    expect(sessionTitle(withTitle as { type: string }[])).toBe('Cortex daily');
    expect(sessionTitle(without as { type: string }[])).toBeUndefined();
    expect(sessionTitle([])).toBeUndefined();
  });

  it('repeated entries: the last one wins; a malformed one is ignored', () => {
    const entries = [
      customTitleEntry('first'),
      textTurn('user', 'q'),
      customTitleEntry('renamed'),
      { type: 'custom-title', customTitle: 123 }, // malformed — not a string
    ];
    expect(sessionTitle(entries as { type: string }[])).toBe('renamed');
    expect(sessionTitle([{ type: 'custom-title' }])).toBeUndefined();
  });
});
