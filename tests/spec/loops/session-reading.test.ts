/**
 * Spec-level test — loops.session-reading. The integrated slice: build a
 * realistic fake home with multiple sessions for one project (plus a
 * prefix-sharing neighbour and a noise-heavy transcript) and walk the full
 * pipeline end-to-end — listSessions → readSession → extractMessages /
 * extractToolUses / sessionTitle — against
 * an injected home so the real ~/.claude is never touched.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { makeTmpDir, cleanTmp, snapshotTree } from '../../fixtures/init-harness.js';
import {
  projectSlug,
  listSessions,
  readSession,
  extractMessages,
  extractToolUses,
  sessionTitle,
} from '../../../src/sessions/read.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`spec-session-reading-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length > 0) cleanTmp(dirs.pop() as string);
});

function writeTranscript(home: string, slug: string, id: string, lines: string[], mtimeSec: number): void {
  const dir = path.join(home, '.claude', 'projects', slug);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.jsonl`);
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf-8');
  fs.utimesSync(file, mtimeSec, mtimeSec);
}

describe('loops.session-reading — integrated list → read → extract slice', () => {
  it('enumerates this project only, tolerates noise, and distils the conversation', () => {
    const home = tmp('home');
    const root = '/Users/dev/myproject';
    const slug = projectSlug(root);

    // Newest session: a clean two-turn conversation.
    writeTranscript(
      home,
      slug,
      'session-newest',
      [
        '{"type":"summary","summary":"session recap"}',
        '{"type":"custom-title","customTitle":"Rules how-to","sessionId":"session-newest"}',
        '{"type":"user","message":{"role":"user","content":"how do I add a rule?"},"timestamp":"2026-07-02T09:00:00Z"}',
        '{"type":"mode","mode":"default"}',
        '{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_0","name":"Read","input":{"file_path":"/Users/dev/myproject/RULES.md"}},{"type":"tool_use","id":"toolu_1","name":"Bash","input":{"command":"ls .cortex/compass/rules","description":"list rules"}}]},"timestamp":"2026-07-02T09:00:03Z"}',
        '{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_0","content":"# Rules body that must not leak"}]},"timestamp":"2026-07-02T09:00:04Z"}',
        '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"write it under .cortex/compass/rules/"}]},"timestamp":"2026-07-02T09:00:05Z"}',
        '{"type":"last-prompt","leafUuid":"leaf-1","sessionId":"session-newest","lastPrompt":"how do I add a rule?"}',
      ],
      3000,
    );
    // Older session: valid entries interleaved with malformed lines (90/10 tolerance).
    writeTranscript(
      home,
      slug,
      'session-older',
      [
        '{"type":"user","message":{"role":"user","content":"earlier question"},"timestamp":"2026-07-01T09:00:00Z"}',
        'GARBAGE not-json',
        '{"type":"last-prompt","prompt":"unknown future type"}',
        '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"earlier answer"}]},"timestamp":"2026-07-01T09:00:05Z"}',
      ],
      2000,
    );
    // A DIFFERENT project sharing a slug prefix — must never appear.
    writeTranscript(
      home,
      projectSlug('/Users/dev/myproject-sandbox'),
      'intruder',
      ['{"type":"user","message":{"role":"user","content":"should not be read"}}'],
      9999,
    );

    const homeBefore = snapshotTree(home);

    const sessions = listSessions(root, { home });
    // This project only, newest-first.
    expect(sessions.map((s) => s.id)).toEqual(['session-newest', 'session-older']);

    // Walk each session: read tolerantly, then extract the messages.
    const conversations = sessions.map((s) => {
      const { entries, skipped } = readSession(root, s.id, { home });
      return {
        id: s.id,
        skipped,
        messages: extractMessages(entries),
        toolUses: extractToolUses(entries),
        title: sessionTitle(entries),
      };
    });

    const newest = conversations[0];
    expect(newest?.skipped).toBe(0);
    expect(newest?.messages).toEqual([
      { role: 'user', text: 'how do I add a rule?', timestamp: '2026-07-02T09:00:00Z' },
      { role: 'assistant', text: 'write it under .cortex/compass/rules/', timestamp: '2026-07-02T09:00:05Z' },
    ]);

    // Rule 7: tool uses ride alongside the messages without changing them.
    expect(newest?.title).toBe('Rules how-to');
    expect(newest?.toolUses).toEqual([
      { name: 'Read', timestamp: '2026-07-02T09:00:03Z', filePath: '/Users/dev/myproject/RULES.md' },
      { name: 'Bash', timestamp: '2026-07-02T09:00:03Z', command: 'ls .cortex/compass/rules' },
    ]);
    expect(JSON.stringify(newest?.toolUses)).not.toContain('must not leak');

    const older = conversations[1];
    expect(older?.title).toBeUndefined();
    expect(older?.toolUses).toEqual([]);
    expect(older?.skipped).toBe(1); // the one malformed line
    expect(older?.messages).toEqual([
      { role: 'user', text: 'earlier question', timestamp: '2026-07-01T09:00:00Z' },
      { role: 'assistant', text: 'earlier answer', timestamp: '2026-07-01T09:00:05Z' },
    ]);

    // Read-only: the whole pipeline changed nothing under the fake home.
    expect(snapshotTree(home)).toEqual(homeBefore);
  });
});
