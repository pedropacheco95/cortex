/**
 * Atomic tests — the transcript-head session-kind probe (`hooks.pre-read-writeback`
 * Rule 7(g) "Scheduled and unknown sessions are never deferred", the probe half;
 * schema §5 row (d) "the transcript's first user line is not a scheduled preamble").
 * Reads at most TRANSCRIPT_HEAD_BYTES of the file named, never throws, and
 * answers `unknown` for everything it cannot see.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { TRANSCRIPT_HEAD_BYTES, sessionKindFromTranscriptHead } from '../../../src/hooks/transcript-head.js';
import { makeTmpDir, cleanTmp } from '../../fixtures/hooks-harness.js';
import { writeTranscriptFile } from '../../fixtures/session-end-harness.js';
import { textTurn, toolTurn, read, customTitleEntry, scheduledTaskUserTurn, skillBaseDirUserTurn } from '../../fixtures/sessions.js';

const dirs: string[] = [];
function tmp(label: string): string {
  const d = makeTmpDir(`thead-${label}`);
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) cleanTmp(d);
});

describe('TRANSCRIPT_HEAD_BYTES', () => {
  it('is 256 KiB, the session-end line cap', () => {
    expect(TRANSCRIPT_HEAD_BYTES).toBe(256 * 1024);
  });
});

describe('sessionKindFromTranscriptHead — the first user line decides', () => {
  it('a first user line starting `Base directory for this skill:` → scheduled', () => {
    const file = writeTranscriptFile(tmp('preamble'), [customTitleEntry('daily'), skillBaseDirUserTurn(), textTurn('assistant', 'ok')]);
    expect(sessionKindFromTranscriptHead(file)).toBe('scheduled');
  });

  it('a first user line containing `<scheduled-task` → scheduled', () => {
    const file = writeTranscriptFile(tmp('tag'), [scheduledTaskUserTurn(), textTurn('assistant', 'ok')]);
    expect(sessionKindFromTranscriptHead(file)).toBe('scheduled');
  });

  it('a human first prompt → interactive, even when a later user line is a scheduled marker', () => {
    const file = writeTranscriptFile(tmp('human'), [
      textTurn('user', 'state/ please'),
      textTurn('assistant', 'ok'),
      skillBaseDirUserTurn(),
    ]);
    expect(sessionKindFromTranscriptHead(file)).toBe('interactive');
  });

  it('a string-content user message is read the way extractMessages reads it', () => {
    const file = writeTranscriptFile(tmp('string'), [
      { type: 'user', message: { role: 'user', content: 'Base directory for this skill: /x' } },
    ]);
    expect(sessionKindFromTranscriptHead(file)).toBe('scheduled');
  });

  it('a tool_result-only user entry is not the human; the next user text line decides', () => {
    const file = writeTranscriptFile(tmp('toolresult'), [
      toolTurn(read('src/a.ts')),
      { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_0', content: 'x' }] } },
      textTurn('user', 'now the human speaks'),
    ]);
    expect(sessionKindFromTranscriptHead(file)).toBe('interactive');
  });
});

describe('sessionKindFromTranscriptHead — everything it cannot see is unknown, never a throw', () => {
  it('a missing path → unknown', () => {
    expect(sessionKindFromTranscriptHead(path.join(tmp('missing'), 'nope.jsonl'))).toBe('unknown');
  });

  it('an undefined or empty path → unknown', () => {
    expect(sessionKindFromTranscriptHead(undefined)).toBe('unknown');
    expect(sessionKindFromTranscriptHead('')).toBe('unknown');
  });

  it('a directory → unknown', () => {
    expect(sessionKindFromTranscriptHead(tmp('dir'))).toBe('unknown');
  });

  it('an empty file → unknown', () => {
    const file = path.join(tmp('empty'), 't.jsonl');
    fs.writeFileSync(file, '');
    expect(sessionKindFromTranscriptHead(file)).toBe('unknown');
  });

  it('no user line at all → unknown', () => {
    const file = writeTranscriptFile(tmp('nouser'), [customTitleEntry('x'), textTurn('assistant', 'hello')]);
    expect(sessionKindFromTranscriptHead(file)).toBe('unknown');
  });

  it('a first user line that is not JSON → unknown', () => {
    const file = path.join(tmp('badjson'), 't.jsonl');
    fs.writeFileSync(file, '{"type":"user", not json\n' + JSON.stringify(textTurn('user', 'later')) + '\n');
    expect(sessionKindFromTranscriptHead(file)).toBe('unknown');
  });

  it('a 300 KiB first user line is longer than the head → unknown, and only the head is read', () => {
    const dir = tmp('bulk');
    const file = path.join(dir, 't.jsonl');
    const bulk = textTurn('user', 'Base directory for this skill: /x ' + 'y'.repeat(300 * 1024));
    fs.writeFileSync(file, JSON.stringify(bulk) + '\n' + JSON.stringify(textTurn('user', 'human')) + '\n');
    expect(fs.statSync(file).size).toBeGreaterThan(TRANSCRIPT_HEAD_BYTES);
    expect(sessionKindFromTranscriptHead(file)).toBe('unknown');
  });
});
