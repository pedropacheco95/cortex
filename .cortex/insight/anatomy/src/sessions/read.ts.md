---
path: src/sessions/read.ts
extracted_at: 2026-09-22T09:55:29Z
extraction_level: 3
size_lines: 296
size_tokens: 2971
centrality: high
built_at_commit: "a66041b"
source_sha256: "d05a06dbf687ee2ec3924aba40f7f5b5ca431ff09e060f36d8cc1c1e9652c6f8"
---
# src/sessions/read.ts

## Purpose

The shared session-reading layer (spec `loops.session-reading`, 7 rules; design §11.5, §16.2 step 10) — the substrate that lets hooks and pulse loops read this project's own Claude Code session transcripts. It locates the project's transcript directory under `~/.claude/projects/<slug>/` (Rule 1: the absolute project path with every `/` replaced by `-`), enumerates its `.jsonl` sessions, tolerantly parses their entries (Rule 3: malformed lines are skipped and counted, never thrown), and distils three consumer-facing views: ordered user/assistant message texts (Rule 4), a bounded/redacted list of tool uses (Rule 7), and the session's user-assigned title (Rule 7b). Pure Core (R-001): no LLM, no network, no subprocess; strictly read-only — this module writes nothing, ever, and every export is synchronous, doing only local `fs` reads. Because the transcript location and entry shapes are Claude Code's own (unversioned, changeable), the layer is built to degrade rather than insist (Rule 6): a missing directory yields an empty list, and a format change surfaces as high `skipped` counts rather than a crash.

## Main players

- `projectSlug` (lines 106-108) — critical. Rule 1's directory-naming function: `path.resolve(root)` with `/` replaced by `-`. Every other function in the file (and every consumer) depends on this exact transform matching Claude Code's own convention; symlinks are deliberately not followed.
- `listSessions` (lines 123-150) — critical. Enumerates exactly `<home>/.claude/projects/<slug>/*.jsonl`, sorted newest-first (mtime, tie-broken by id), with an optional `since` mtime filter. Returns `[]` rather than throwing on a missing/unreadable directory (Rule 6) and skips (not throws) a file that vanishes between `readdir` and `stat`.
- `parseSessionJsonl` (lines 175-196) — critical. The pure string half of transcript parsing (no `fs`): line-by-line tolerant JSON parse, skipping blank lines silently and counting (not throwing on) malformed JSON, non-object lines, or objects missing a string `type`. Deliberately factored out of `readSessionFile` so it can be reused against a partial transcript.
- `readSessionFile` / `readSession` (lines 159-167, 203-206) — supporting. Thin `fs`-reading wrappers around `parseSessionJsonl`; `readSession` composes with `listSessions`'s directory-naming convention to look up one session by id.
- `extractMessages` (lines 235-246) — critical. Rule 4: reduces raw entries to `{role, text, timestamp?}`, tolerating both string and content-block-array message shapes (via `extractText`) and skipping entries with no extractable text.
- `extractToolUses` (lines 258-281) — critical, privacy-load-bearing. Rule 7(a): reduces every assistant `tool_use` part to `{name, timestamp?, filePath?, command?}` — deliberately narrow. Only `Write`/`Edit`/`Read`/`NotebookEdit` (`FILE_PATH_TOOLS`) contribute a `filePath`; `Bash` contributes only the first `BASH_COMMAND_CHARS` (200) characters of its command; every other tool's input, and all `tool_result` contents, are never read. This is the redaction boundary between raw transcripts and anything a loop or hook persists.
- `sessionTitle` (lines 289-295) — supporting. Rule 7(b): returns the `customTitle` of the *last* `custom-title` entry, because Claude Code appends this entry type repeatedly rather than rewriting it in place.
- `messageRole` (lines 220-227) — supporting. Resolves a message's role from `entry.type` first, falling back to `entry.message.role` — the two-source fallback both `extractMessages` and `extractToolUses` rely on.

## Insights

- The 200-character `BASH_COMMAND_CHARS` truncation and the `FILE_PATH_TOOLS` allowlist in `extractToolUses` are the only place in this module enforcing what of a session transcript may leave process memory into a persisted artefact (e.g. a distil report or pulse observation) — any consumer wanting more detail is expected to read raw `entries` itself rather than this module widening the extraction, per the file's own header comment ("Consumers needing more read the raw entries instead").
- `parseSessionJsonl` was deliberately split out of `readSessionFile` so `src/hooks/transcript-head.ts` can feed it a bounded *tail* slice of a transcript (not the whole file) — a hook-specific performance need this module accommodates without adding a second parsing implementation.
- Determinism note: `listSessions`' sort is mtime-descending with an id tie-break, not filename order — two sessions created in the same test tick need distinct mtimes or ids to sort predictably, a common source of flaky fixtures in tests that exercise this function.
- The module trusts the filesystem's directory-slug convention completely; there is no verification that a given `<slug>` directory actually corresponds to `root` beyond the string transform in `projectSlug` — a project whose absolute path collides after the `/`→`-` substitution (unlikely but not impossible with unusual directory names) would silently read another project's transcripts.

## Connections

Uses:
- (none src-internal — pure `fs`/`path`/`os`)

Used by:
- src/hooks/session-end.ts — imports `parseSessionJsonl`, `extractMessages`, `extractToolUses`, `sessionTitle` (plus the `ExtractedMessage`/`ExtractedToolUse`/`SessionEntry` types) to distil the just-ended session for the hook's own summarisation.
- src/hooks/transcript-head.ts — imports `extractMessages`, `parseSessionJsonl` to parse a bounded transcript-tail slice rather than a whole file (see Insights).
- src/pulse/distil.ts — imports `listSessions`, `readSessionFile`, `extractMessages` (plus the `ExtractedMessage` type) to mine this project's session history for recurring corrections.
- src/pulse/threads.ts — imports the `ExtractedMessage` type only (type-only dependency, no runtime call into this module).
- src/pulse/usage.ts — imports `listSessions`, `readSessionFile` (plus the `SessionEntry` type) to compute usage evidence over the project's own sessions.
- tests/atomic/hooks/session-end.test.ts, tests/atomic/insight/session-observe.test.ts, tests/atomic/loops/session-reading.test.ts, tests/atomic/pulse/distil.test.ts — mocked unit coverage of individual exports.
- tests/fixtures/sessions.ts — shared test-fixture helper building synthetic transcript files.
- tests/spec/loops/session-reading.test.ts, tests/spec/pulse/threads.test.ts — integrated-slice coverage against real fixture transcript directories.

## Query pointers

- If you need to change what a hook or loop learns from a session (add a new distilled field), also read: the `ExtractedMessage`/`ExtractedToolUse` interfaces here, then the consumer in `src/hooks/session-end.ts` or `src/pulse/distil.ts` that shapes the output — the redaction boundary in `extractToolUses` (Insights) is the thing to check before widening extraction.
- If you need to change the transcript-location convention (Rule 1), read first: `projectSlug` and every direct caller of `listSessions`/`readSession` (all five in-edges above), since none of them independently re-derive the slug.
- If you need to add tolerance for a new/changed Claude Code entry shape, read first: `parseSessionJsonl` and `messageRole`, then check `tests/atomic/loops/session-reading.test.ts` for the existing malformed-input fixtures it is tested against.
