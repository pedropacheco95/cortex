---
path: src/pulse/usage.ts
extracted_at: 2026-08-07T01:00:00Z
extraction_level: 2
size_lines: 302
size_tokens: 3320
centrality: low
built_at_commit: "c2de5f6"
source_sha256: "1bfc73f50164a8f7bd17c5422b9fa772aad9d83633f37de21fb8d530389a9ddc"
---
# src/pulse/usage.ts

## Purpose
`cortex usage` (spec `pulse.usage`) — NEW file. Answers "is Cortex actually being consulted?" purely from evidence that already exists: this project's Claude Code session transcripts, read through the strictly read-only `sessions.read` layer. There is no logging hook, no counter, and no runtime cost anywhere — a write-side probe would be exactly the overhead this measurement exists to avoid justifying (Rule 1). The load-bearing counting rule (Rule 2) is that `cortex insight <verb>` invocations are counted only inside Bash `tool_use` command fields, with quoted spans stripped first (`stripQuotedSpans`) — a naive count over raw transcript text over-counts roughly 100x because specs and design docs discuss those verbs constantly. `collectUsage` walks every session once, tracking: insight-verb invocation counts, orientation reads under `.cortex/` versus loop-machinery reads under `.cortex/pulse/{state,reports}/` (Rule 3, excluded from "consulting"), reads bucketed by module directory, root vs. module `_index.md` reads, `.cortex/`-targeted searches (Grep tool calls plus bash greps), and sessions where `AskUserQuestion` fired before any orientation read (Rule 4 — a floor, since prose questions aren't counted). `renderUsageBody` renders the figures with no interpretation or recommendation (Rule 5) — an unreadable transcript location renders every figure as "not measurable," never as an observed zero (Rule 6). `runUsage` writes `.cortex/pulse/reports/usage.md` through the shared `writePulseReport` helper, always-write per schema §4.5. Deterministic Core (R-001): counting, bucketing, and rendering only, no LLM call anywhere in the file.

## Connections
Uses:
- src/sessions/read.ts: `listSessions`, `readSessionFile`, `SessionEntry` (type) — the read-only transcript layer this module counts over; never touches transcripts directly.
- src/loops/report.ts: `writePulseReport` — the shared pulse-report writer so `usage.md`'s header shape matches every other loop's report.

Used by:
- src/cli/cli.ts: dynamic-import call site (`../pulse/usage.js`, line ~152) — `cortex usage` dispatches to `runUsage('.')`.
