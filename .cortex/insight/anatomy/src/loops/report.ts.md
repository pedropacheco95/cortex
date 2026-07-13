---
path: src/loops/report.ts
extracted_at: 2026-07-12T01:10:00Z
extraction_level: 3
size_lines: 28
size_tokens: 270
centrality: high
built_at_commit: "fd7b55b"
source_sha256: "e97cd7203395b8f653f7c1401d89fdc553aeb224ce3dda7cfd27e1237fa10392"
---

# src/loops/report.ts

## Purpose

A tiny (28-line) shared always-write report writer: its single export, `writePulseReport`, is the one code path every deterministic loop and pulse module funnels its single sanctioned markdown write through — it ensures the destination directory exists (by default `.cortex/pulse/reports/`, now that pulse was reorganized into `reports/`/`state/`/`extraction/` zones), prepends a standard header (kind/loop/generated timestamp) via `pulseReportHeader`, normalises trailing newlines, and overwrites the loop's own report file. It exists so that "overwrite my own file under the pulse zone, nothing else" is enforced by a single function rather than by convention across a dozen call sites. A new optional `opts.dir` override lets a caller (distil's `suggestions.md`) keep a root-level `.cortex/pulse/` artefact instead of a `reports/` one, while still reusing the same header/write mechanics.

## Main players

- `writePulseReport` (lines 13-28) — the sole export: builds the destination directory (`opts.dir` if given, else `.cortex/pulse/reports/`), prepends `pulseReportHeader(kind, loop, generatedIso)`, writes `filename` with the body's trailing newlines collapsed to exactly one, and returns the written path. [critical]

## Insights

- Despite being only 28 lines, this file is imported by 13 other files across `src/loops/`, `src/pulse/`, and `src/insight/` — every loop's and pulse module's single sanctioned pulse-report write funnels through here, which is precisely what makes the project's "propose, don't mutate" discipline auditable: there is exactly one function in the codebase that writes a report file under the pulse zone.
- It hard-normalises trailing newlines (`body.replace(/\n*$/, '\n')`) regardless of what the caller passes, guaranteeing every report file ends in exactly one newline — a small formatting guarantee that downstream parsers (e.g. `readPendingSections` in `src/pulse/distil.ts`) can rely on without re-checking.
- It deliberately delegates header formatting to `pulseReportHeader` in `src/cli/templates.ts` rather than building the header inline, keeping the header format owned by the CLI templates layer while this file owns only the write mechanics.
- The pulse reorg (commit `577ff08`, "Pulse reorganized into reports/ state/ extraction/ zones") moved the default destination from `.cortex/pulse/` directly to `.cortex/pulse/reports/`, and added the `opts.dir` escape hatch so `src/pulse/distil.ts` could keep writing `suggestions.md` at the pulse root — every other caller is unaffected since the default already matches their intent.

## Connections

Uses:
- `src/cli/templates.ts` — `pulseReportHeader`, which formats the kind/loop/generated-timestamp header prepended to every report body.

Used by: `src/insight/refresh-daily.ts`, `src/insight/refresh-full.ts`, `src/insight/session-observe.ts`, `src/loops/atlas-staleness.ts`, `src/loops/bug-triage.ts`, `src/loops/lint-scheduled.ts`, `src/loops/onboarding-drift.ts`, `src/loops/rule-decay.ts`, `src/loops/skill-suggest.ts`, `src/loops/spec-drift.ts`, `src/loops/verify-scheduled.ts`, `src/pulse/distil.ts`, `src/pulse/hygiene.ts` — all 13 channel their sole pulse-report write through this one function.

Semantically related (not imports): `src/pulse/fences.ts` and `src/pulse/types.ts` — all three are small, pure, widely-shared infrastructure modules that keep loop and pulse behaviour convergent rather than duplicated across otherwise-independent files.

## Query pointers

If you need to see how the report header is formatted, also read: `src/cli/templates.ts`. If you need to see the report-body construction convention every caller follows (build `lines: string[]`, `.join('\n')`, then call this), also read: `src/loops/bug-triage.ts` and `src/loops/skill-suggest.ts`.
