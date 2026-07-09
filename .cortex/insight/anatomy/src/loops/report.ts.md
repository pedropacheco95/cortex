---
path: src/loops/report.ts
extracted_at: 2026-07-08T21:15:00Z
extraction_level: 3
size_lines: 26
size_tokens: 218
centrality: high
built_at_commit: "8248c76"
source_sha256: "b424a0fe6f383c85d8f6a1f98e5d467fb28b278c791749fa10a8bb2c6062e2ba"
---

# src/loops/report.ts

## Purpose

A tiny (26-line) shared always-write report writer: its single export, `writePulseReport`, is the one code path every deterministic loop and pulse module funnels its single sanctioned markdown write through — it ensures the `.cortex/pulse/` directory exists, prepends a standard header (kind/loop/generated timestamp) via `pulseReportHeader`, normalises trailing newlines, and overwrites the loop's own report file. It exists so that "overwrite my own file under `.cortex/pulse/`, nothing else" is enforced by a single function rather than by convention across a dozen call sites.

## Main players

- `writePulseReport` (lines 11-25) — the sole export: builds `.cortex/pulse/`, prepends `pulseReportHeader(kind, loop, generatedIso)`, writes `filename` with the body's trailing newlines collapsed to exactly one, and returns the written path. [critical]

## Insights

- Despite being only 26 lines, this file is imported by 13 other files across `src/loops/`, `src/pulse/`, and `src/insight/` — every loop's and pulse module's single sanctioned pulse-report write funnels through here, which is precisely what makes the project's "propose, don't mutate" discipline auditable: there is exactly one function in the codebase that writes a report file under `.cortex/pulse/`.
- It hard-normalises trailing newlines (`body.replace(/\n*$/, '\n')`) regardless of what the caller passes, guaranteeing every report file ends in exactly one newline — a small formatting guarantee that downstream parsers (e.g. `readPendingSections` in `src/pulse/distil.ts`) can rely on without re-checking.
- It deliberately delegates header formatting to `pulseReportHeader` in `src/cli/templates.ts` rather than building the header inline, keeping the header format owned by the CLI templates layer while this file owns only the write mechanics.

## Connections

Uses:
- `src/cli/templates.ts` — `pulseReportHeader`, which formats the kind/loop/generated-timestamp header prepended to every report body.

Used by: `src/insight/refresh-daily.ts`, `src/insight/refresh-full.ts`, `src/insight/session-observe.ts`, `src/loops/atlas-staleness.ts`, `src/loops/bug-triage.ts`, `src/loops/lint-scheduled.ts`, `src/loops/onboarding-drift.ts`, `src/loops/rule-decay.ts`, `src/loops/skill-suggest.ts`, `src/loops/spec-drift.ts`, `src/loops/verify-scheduled.ts`, `src/pulse/distil.ts`, `src/pulse/hygiene.ts` — all 13 channel their sole pulse-report write through this one function.

Semantically related (not imports): `src/pulse/fences.ts` and `src/pulse/types.ts` — all three are small, pure, widely-shared infrastructure modules that keep loop and pulse behaviour convergent rather than duplicated across otherwise-independent files.

## Query pointers

If you need to see how the report header is formatted, also read: `src/cli/templates.ts`. If you need to see the report-body construction convention every caller follows (build `lines: string[]`, `.join('\n')`, then call this), also read: `src/loops/bug-triage.ts` and `src/loops/skill-suggest.ts`.
