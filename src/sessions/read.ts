/**
 * Session-reading layer (spec loops.session-reading, 7 rules; design §11.5,
 * §16.2 step 10). The shared substrate that lets distil and session-observe
 * read Claude Code session transcripts for *this project only*: locate the
 * project's transcript directory, enumerate its sessions, parse their JSONL
 * tolerantly into typed entries, and distil messages, tool uses and the
 * session title from them.
 *
 * Pure Core (governed by R-001): no LLM, no network, no subprocess. Strictly
 * READ-ONLY — this module writes nothing, ever; parsed content is returned
 * in-process only and persistence decisions belong to consumers.
 *
 * The transcript location and entry shapes are Claude Code's — unversioned and
 * changeable — so the layer degrades rather than insists (Rule 6): a missing
 * directory yields an empty list, and a format change surfaces as high
 * `skipped` counts, never a crash.
 *
 * All exported functions are synchronous; they perform only local `fs` reads.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/** A session transcript located under the project's `~/.claude/projects/<slug>/`. */
export interface SessionInfo {
  /** Session id — the transcript filename stem (without the `.jsonl` suffix). */
  id: string;
  /** Absolute path to the `.jsonl` transcript file. */
  path: string;
  /** File last-modified timestamp, used for ordering and the `since` filter. */
  mtime: Date;
}

/**
 * One parsed JSONL entry. Its `type` is preserved verbatim (unknown types pass
 * through untouched, per Rule 3); every other field is left as parsed.
 */
export interface SessionEntry {
  type: string;
  [key: string]: unknown;
}

/** Result of a tolerant transcript parse (Rule 3). */
export interface SessionReadResult {
  /** The readable entries, in file order. */
  entries: SessionEntry[];
  /** Count of malformed / unusable lines skipped (never thrown). */
  skipped: number;
}

/** An extracted user/assistant message text with its timestamp (Rule 4). */
export interface ExtractedMessage {
  role: 'user' | 'assistant';
  text: string;
  /** ISO timestamp when the source entry carried one. */
  timestamp?: string;
}

/**
 * One assistant `tool_use` part distilled to what consumers may see (Rule 7):
 * the tool name, the enclosing entry's timestamp, and — for the file tools —
 * the path, or — for Bash — a bounded command prefix. Never bodies, never
 * `tool_result` contents, never any other input field.
 */
export interface ExtractedToolUse {
  name: string;
  /** ISO timestamp of the enclosing assistant entry, when it carried one. */
  timestamp?: string;
  /** `input.file_path` (or `input.notebook_path`) for Write/Edit/Read/NotebookEdit. */
  filePath?: string;
  /** First {@link BASH_COMMAND_CHARS} characters of `input.command` for Bash. */
  command?: string;
}

interface ListSessionsOptions {
  /** Injectable home dir so tests never touch the real `~/.claude`. Defaults to `os.homedir()`. */
  home?: string;
  /**
   * Keep only sessions whose file mtime is at-or-after this instant
   * (`mtime >= since`). Omit to return all sessions.
   */
  since?: Date;
}

interface ReadSessionOptions {
  /** Injectable home dir; defaults to `os.homedir()`. */
  home?: string;
}

const JSONL_SUFFIX = '.jsonl';
/** Rule 7: only these tools contribute a `filePath`; every other input is dropped. */
const FILE_PATH_TOOLS: ReadonlySet<string> = new Set(['Write', 'Edit', 'Read', 'NotebookEdit']);
/** Rule 7: a Bash command is carried as a bounded prefix, never whole. */
const BASH_COMMAND_CHARS = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Rule 1 — the project's transcript directory name: the absolute project path
 * with every `/` replaced by `-` (e.g. `/Users/x/proj` → `-Users-x-proj`).
 * The path is resolved (normalised) but symlinks are NOT followed, matching the
 * observed Claude Code convention of encoding the cwd path as-is.
 */
export function projectSlug(root: string): string {
  return path.resolve(root).split('/').join('-');
}

/** The `<home>/.claude/projects/<slug>/` transcript directory for a project root. */
function transcriptDir(root: string, home: string): string {
  return path.join(home, '.claude', 'projects', projectSlug(root));
}

/**
 * Rule 2 — enumerate this project's sessions only. Reads exactly the
 * `<home>/.claude/projects/<slug>/*.jsonl` directory (never another project's,
 * even when its slug shares a prefix — the exact directory name is used) and
 * returns each session's id + mtime, sorted newest-first (ties broken by id for
 * determinism). `since` filters by mtime (at-or-after). A missing directory
 * yields an empty list, never an error (Rule 6).
 */
export function listSessions(root: string, opts: ListSessionsOptions = {}): SessionInfo[] {
  const home = opts.home ?? os.homedir();
  const dir = transcriptDir(root, home);

  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return []; // missing (or unreadable) directory → nothing learned, no throw
  }

  const sessions: SessionInfo[] = [];
  for (const dirent of dirents) {
    if (!dirent.isFile() || !dirent.name.endsWith(JSONL_SUFFIX)) continue;
    const full = path.join(dir, dirent.name);
    let mtime: Date;
    try {
      mtime = fs.statSync(full).mtime;
    } catch {
      continue; // vanished between readdir and stat — skip, never throw
    }
    if (opts.since && mtime.getTime() < opts.since.getTime()) continue;
    sessions.push({ id: dirent.name.slice(0, -JSONL_SUFFIX.length), path: full, mtime });
  }

  sessions.sort((a, b) => b.mtime.getTime() - a.mtime.getTime() || a.id.localeCompare(b.id));
  return sessions;
}

/**
 * Rule 3 — tolerant JSONL parse of a single transcript file. Each line that
 * parses to a typed object yields a `SessionEntry` (its `type` preserved,
 * unknown types included); blank lines are ignored; every other line
 * (malformed JSON, non-object, or missing a string `type`) is skipped and
 * counted. A missing/unreadable file yields an empty result, never a throw.
 */
export function readSessionFile(filePath: string): SessionReadResult {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return { entries: [], skipped: 0 };
  }
  return parseSessionJsonl(raw);
}

/**
 * The pure string half of {@link readSessionFile}: tolerant JSONL parse of
 * already-read transcript content (Rule 3 semantics, no fs). Shared with
 * hooks.post-read, which reads a bounded transcript *tail* rather than a
 * whole file.
 */
export function parseSessionJsonl(raw: string): SessionReadResult {
  const entries: SessionEntry[] = [];
  let skipped = 0;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue; // blank lines are structure, not corruption

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      skipped++;
      continue;
    }
    if (!isRecord(parsed) || typeof parsed.type !== 'string') {
      skipped++;
      continue;
    }
    entries.push({ ...parsed, type: parsed.type });
  }
  return { entries, skipped };
}

/**
 * Convenience wrapper composing with {@link listSessions}: reads the transcript
 * for `sessionId` under `<home>/.claude/projects/<slug>/`. Equivalent to
 * `readSessionFile(<slug-dir>/<sessionId>.jsonl)`.
 */
export function readSession(root: string, sessionId: string, opts: ReadSessionOptions = {}): SessionReadResult {
  const home = opts.home ?? os.homedir();
  return readSessionFile(path.join(transcriptDir(root, home), `${sessionId}${JSONL_SUFFIX}`));
}

function extractText(content: unknown): string | undefined {
  if (typeof content === 'string') return content.length > 0 ? content : undefined;
  if (Array.isArray(content)) {
    const parts = content
      .map((block) => (isRecord(block) && typeof block.text === 'string' ? block.text : ''))
      .filter((text) => text.length > 0);
    return parts.length > 0 ? parts.join('') : undefined;
  }
  return undefined;
}

/** Resolve a message role from the entry `type`, falling back to `message.role`. */
function messageRole(entry: SessionEntry): 'user' | 'assistant' | undefined {
  if (entry.type === 'user' || entry.type === 'assistant') return entry.type;
  if (isRecord(entry.message)) {
    const role = entry.message.role;
    if (role === 'user' || role === 'assistant') return role;
  }
  return undefined;
}

/**
 * Rule 4 — distil what consumers actually need: the ordered user/assistant
 * message texts with timestamps, ignoring non-message entry types. Tolerates
 * both string and array `content` shapes; entries without extractable text are
 * skipped (Rule 3/6). Consumers needing more read the raw entries instead.
 */
export function extractMessages(entries: SessionEntry[]): ExtractedMessage[] {
  const messages: ExtractedMessage[] = [];
  for (const entry of entries) {
    const role = messageRole(entry);
    if (role === undefined || !isRecord(entry.message)) continue;
    const text = extractText(entry.message.content);
    if (text === undefined) continue;
    const timestamp = typeof entry.timestamp === 'string' ? entry.timestamp : undefined;
    messages.push(timestamp !== undefined ? { role, text, timestamp } : { role, text });
  }
  return messages;
}

/**
 * Rule 7(a) — every `tool_use` content part of every assistant entry, in
 * transcript order, reduced to `{ name, timestamp?, filePath?, command? }`.
 * `filePath` comes from `input.file_path` (falling back to `input.notebook_path`)
 * for Write/Edit/Read/NotebookEdit; `command` is the first 200 characters of
 * `input.command` for Bash; nothing else is read from any input — no file
 * bodies, no `tool_result` contents, no other tool's arguments. Parts that are
 * not records, lack a string `name`, or carry a non-record input are skipped,
 * never thrown (Rule 3/6). Pure, in-process, read-only (Rule 5).
 */
export function extractToolUses(entries: SessionEntry[]): ExtractedToolUse[] {
  const uses: ExtractedToolUse[] = [];
  for (const entry of entries) {
    if (messageRole(entry) !== 'assistant' || !isRecord(entry.message)) continue;
    const content = entry.message.content;
    if (!Array.isArray(content)) continue;
    const timestamp = typeof entry.timestamp === 'string' ? entry.timestamp : undefined;
    for (const part of content) {
      if (!isRecord(part) || part.type !== 'tool_use' || typeof part.name !== 'string') continue;
      const input = isRecord(part.input) ? part.input : undefined;
      if (input === undefined) continue;
      const use: ExtractedToolUse = { name: part.name };
      if (timestamp !== undefined) use.timestamp = timestamp;
      if (FILE_PATH_TOOLS.has(part.name)) {
        const filePath = typeof input.file_path === 'string' ? input.file_path : input.notebook_path;
        if (typeof filePath === 'string') use.filePath = filePath;
      } else if (part.name === 'Bash' && typeof input.command === 'string') {
        use.command = input.command.slice(0, BASH_COMMAND_CHARS);
      }
      uses.push(use);
    }
  }
  return uses;
}

/**
 * Rule 7(b) — the session's user-assigned title: the `customTitle` of the last
 * `custom-title` entry (Claude Code appends the entry repeatedly rather than
 * rewriting it, so the last one is current), or `undefined` when no such entry
 * carries a string title. Observed, externally owned shape (Rule 6).
 */
export function sessionTitle(entries: SessionEntry[]): string | undefined {
  let title: string | undefined;
  for (const entry of entries) {
    if (entry.type === 'custom-title' && typeof entry.customTitle === 'string') title = entry.customTitle;
  }
  return title;
}
