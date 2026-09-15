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

// ---------------------------------------------------------------------------
// Rule 7 helpers (loops.session-reading tool-use extraction). Additive only —
// names are distinct from everything above so parallel appends never collide.
// ---------------------------------------------------------------------------

/** Convenience: a Write tool call (body included, to prove bodies are never extracted). */
export function writeTool(filePath: string, content = 'file body that must not leak'): ToolUseSpec {
  return { name: 'Write', input: { file_path: filePath, content } };
}

/** Convenience: an Edit tool call. */
export function editTool(filePath: string): ToolUseSpec {
  return { name: 'Edit', input: { file_path: filePath, old_string: 'a', new_string: 'b' } };
}

/** Convenience: a NotebookEdit tool call — its observed path key is `notebook_path`. */
export function notebookEditTool(notebookPath: string): ToolUseSpec {
  return { name: 'NotebookEdit', input: { notebook_path: notebookPath, new_source: 'x' } };
}

/** An assistant turn of `tool_use` blocks stamped with an explicit timestamp. */
export function toolTurnAt(timestamp: string, ...tools: ToolUseSpec[]): Record<string, unknown> {
  return { ...toolTurn(...tools), timestamp };
}

/** An assistant turn whose content parts are given verbatim (for malformed-part tests). */
export function rawAssistantTurn(parts: unknown[], timestamp?: string): Record<string, unknown> {
  const entry: Record<string, unknown> = { type: 'assistant', message: { role: 'assistant', content: parts } };
  if (timestamp !== undefined) entry['timestamp'] = timestamp;
  return entry;
}

/** The observed `custom-title` metadata entry (shape verified 2026-09-15; no timestamp). */
export function customTitleEntry(title: string, sessionId = 'sess-0000'): Record<string, unknown> {
  return { type: 'custom-title', customTitle: title, sessionId };
}

/** The observed `last-prompt` resume-pointer entry (shape verified 2026-09-15). */
export function lastPromptEntry(lastPrompt?: string, sessionId = 'sess-0000'): Record<string, unknown> {
  const entry: Record<string, unknown> = { type: 'last-prompt', leafUuid: 'leaf-0000', sessionId };
  if (lastPrompt !== undefined) entry['lastPrompt'] = lastPrompt;
  return entry;
}

// ---------------------------------------------------------------------------
// session-kind fixtures (insight.session-observe Rule 12 / pulse.distil Rule 11)
// ---------------------------------------------------------------------------

/** The first user turn of a scheduled-task session as Claude Desktop writes it. */
export function scheduledTaskUserTurn(taskName = 'cortex-daily'): Record<string, unknown> {
  return textTurn(
    'user',
    `<scheduled-task name="${taskName}" file="/Users/someone/.claude/scheduled-tasks/${taskName}.md">run the bundle</scheduled-task>`,
  );
}

/** The first user turn of a skill-driven scheduled session (skill preamble). */
export function skillBaseDirUserTurn(skillDir = '/Users/someone/.claude/skills/cortex-loop'): Record<string, unknown> {
  return textTurn('user', `Base directory for this skill: ${skillDir}\n\nRun the daily loop.`);
}

/**
 * A hook-injected context entry, in the shape Claude Code writes when a hook
 * returns `additionalContext`: an `attachment` entry of type
 * `hook_additional_context` whose `content` is an array of strings. Used to
 * prove `pulse.usage` Rule 11 counts pointer lines from hook output.
 */
export function hookContext(...lines: string[]): Record<string, unknown> {
  return {
    type: 'attachment',
    attachment: {
      type: 'hook_additional_context',
      content: [lines.join('\n')],
      hookName: 'SessionStart',
      toolUseID: 'SessionStart',
      hookEvent: 'SessionStart',
    },
    timestamp: '2026-07-01T00:00:00Z',
  };
}

/** Convenience: a Glob tool call — an unrelated tool call for window-counting fixtures. */
export function glob(pattern: string): ToolUseSpec {
  return { name: 'Glob', input: { pattern } };
}
