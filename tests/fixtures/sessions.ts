/**
 * Shared session-transcript fixture builder — writes synthetic `.jsonl`
 * transcripts into a FAKE injected home (`<home>/.claude/projects/<slug>/`), so
 * no test ever reads the real `~/.claude`. Sandboxed tmp projects only.
 *
 * Unlike `distil.test.ts`'s local text-only helper, this one can emit `tool_use`
 * content blocks, which is what `pulse.usage` counts. The block shape mirrors a
 * real transcript: an `assistant` entry whose `message.content` is an array of
 * blocks, each `tool_use` block carrying `name` and `input`.
 */
import * as fs from 'fs';
import * as path from 'path';
import { projectSlug } from '../../src/sessions/read.js';

/** One tool invocation inside an assistant turn. */
export interface ToolUseSpec {
  name: string;
  input: Record<string, unknown>;
}

/** An assistant turn carrying one or more `tool_use` blocks. */
export function toolTurn(...tools: ToolUseSpec[]): Record<string, unknown> {
  return {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: tools.map((t, i) => ({
        type: 'tool_use',
        id: `toolu_${i}`,
        name: t.name,
        input: t.input,
      })),
    },
    timestamp: '2026-07-01T00:00:00Z',
  };
}

/** A plain text turn — used to prove prose is never counted as an invocation. */
export function textTurn(role: 'user' | 'assistant', text: string): Record<string, unknown> {
  return {
    type: role,
    message: { role, content: [{ type: 'text', text }] },
    timestamp: '2026-07-01T00:00:00Z',
  };
}

/** Convenience: a Bash tool call. */
export function bash(command: string): ToolUseSpec {
  return { name: 'Bash', input: { command, description: 'test' } };
}

/** Convenience: a Read tool call. */
export function read(filePath: string): ToolUseSpec {
  return { name: 'Read', input: { file_path: filePath } };
}

/** Convenience: a Grep tool call. */
export function grep(pattern: string, searchPath?: string): ToolUseSpec {
  return {
    name: 'Grep',
    input: searchPath === undefined ? { pattern } : { pattern, path: searchPath },
  };
}

/** Convenience: an AskUserQuestion tool call — the only question signal usage counts. */
export function askUser(question = 'which one?'): ToolUseSpec {
  return { name: 'AskUserQuestion', input: { questions: [{ question }] } };
}

/**
 * Write one transcript for `root` into the injected `home`. Entries are written
 * verbatim, one JSON object per line, in the order given.
 */
export function writeSessionTranscript(
  home: string,
  root: string,
  id: string,
  entries: Record<string, unknown>[],
  mtime?: Date,
): string {
  const dir = path.join(home, '.claude', 'projects', projectSlug(root));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.jsonl`);
  fs.writeFileSync(file, entries.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf-8');
  if (mtime) fs.utimesSync(file, mtime, mtime);
  return file;
}
