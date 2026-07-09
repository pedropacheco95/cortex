---
path: src/sessions/read.ts
extracted_at: 2026-07-08T21:00:00Z
extraction_level: 2
size_lines: 226
size_tokens: 2116
centrality: low
built_at_commit: "8248c76"
source_sha256: "9fd1448a56ad7dd33a2813d36d36bc45ca365e84cdebbc913b0a76296aa43ea7"
---
# src/sessions/read.ts

## Purpose
The shared, read-only session-transcript reading layer (spec loops.session-reading) — locates a project's Claude Code transcript directory under `~/.claude/projects/<slug>/`, enumerates its `.jsonl` session files, tolerantly parses their entries (unreadable lines are skipped and counted, never thrown), and extracts ordered user/assistant message texts. Used by session-mining loops (distil, skill-suggest) to read this project's own conversation history; writes nothing, ever.

## Connections
Uses:
- (none src-internal)

Used by:
- src/pulse/distil.ts: `listSessions`, `readSessionFile`/`readSession`, `extractMessages` — reads this project's session transcripts to mine recurring corrections
