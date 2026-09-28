---
path: src/pulse/usage.ts
extracted_at: 2026-09-22T09:54:50Z
extraction_level: 3
size_lines: 872
size_tokens: 9940
centrality: high
built_at_commit: "a66041b"
source_sha256: "77b86ac00395aed5f61f774b3c873a8fec4a42bd9d03bc6330683c797e6e4762"
---
# src/pulse/usage.ts

## Purpose

Implements `cortex usage` (spec `pulse.usage`), the read-side adoption report answering "is Cortex actually being consulted?" purely from evidence that already exists — this project's Claude Code session transcripts, read through the strictly read-only `sessions.read` layer. There is no logging hook, no counter, and no runtime cost anywhere; a write-side probe would be exactly the overhead this measurement exists to avoid justifying (Rule 1). `collectUsage` walks every session once and tracks a wide surface of adoption signals: `cortex insight <verb>` and `cortex recall`/`cortex why` invocations counted only from Bash `tool_use` command fields with quoted spans stripped (Rule 2 — a naive text-wide count over-reports roughly 100x since specs and design docs discuss those verbs constantly); orientation reads under `.cortex/` versus loop-machinery reads under `.cortex/pulse/{state,reports}/` (Rule 3, excluded from "consulting"); reads bucketed by module directory and by always-reported tracked subdirectories (Rule 10); root vs. module `_index.md` reads; searches (Grep tool calls plus Bash greps with a path operand) bucketed into knowledge/machinery/document/other (Rule 8); hook-injected pointer-line (`Recall:`/`Decided:`/`Evidence:`/`Open:`/`Bugs:`) fire-and-follow tracking within a rolling tool-call window (Rule 11); `Deferred:` line fire-and-retry tracking against the read-deferral gate (Rule 13); and sessions where `AskUserQuestion` fired before any orientation read (Rule 4, a floor since prose questions aren't counted). `renderUsageBody` renders the figures with no interpretation or recommendation (Rule 5); an unreadable transcript location renders every figure as "not measurable," never as an observed zero (Rule 6). `runUsage` always writes `.cortex/pulse/reports/usage.md` via the shared pulse report writer, and optionally (`--record`) also writes a gated `atlas/evidence/<date>-usage.md` snapshot of the same counts (Rule 12). Deterministic Core (R-001): counting, bucketing, and rendering only — no LLM call anywhere in the file.

## Main players

- `collectUsage` (lines 492–625) — critical. The single walk over every session's transcript entries, in stream order, maintaining per-session mutable state (`consulted`, `askedBeforeConsulting`, `pending` pointers, `pendingDeferrals`) and dispatching on `tool_use` name (`Bash`, `Grep`, `Read`, `AskUserQuestion`) plus injected/result text scanning for pointer and deferral lines. This is where every counting rule in the header comment is actually enforced.
- `UsageCounts` (lines 66–110) — critical. The complete output shape: every figure `renderUsageBody`/`usageFindings` render is a field here — sessions, skipped lines, readability, window, insight/recall verb tallies, orientation vs. machinery reads (by module and tracked subdir), index reads, search buckets, pointer fire/follow counts, the four-way deferral breakdown, and the pre-consult-question count.
- `pointerTargetsIn` (lines 315–350) — critical. Parses every `Recall:`/`Decided:`/`Evidence:`/`Open:`/`Bugs:` line in a block of hook-injected text into a `PointerTarget`: the pointed path (preferring a trailing `(<path>)`, else the first `/`-bearing token, else an id-shaped token mapped via `ID_SHAPES`), plus an optional `more:` tail (`whyRef`/`moreCommand`) and, for `Open:` lines, the thread's own id (`threadId`) for the "acted on the thread" follow-through path.
- `follows` (lines 409–421) — critical. The single predicate deciding whether a Read or search "follows" a fired pointer/deferral: exact match, directory-above match (search only), or — for a pointed path ending in `-` (a basename prefix, e.g. a thread id) — any path in that directory whose basename starts with the prefix.
- `searchTargetOf` (lines 213–226) — supporting. Buckets a normalised path into `knowledge` (the four knowledge modules or `.cortex/` itself), `machinery` (pulse + three root machinery files), `document` (root docs, `.specflow/`), or `other`.
- `searchTargetsIn` (lines 241–257) — supporting. Extracts path operands from search-shaped command segments in a quote-stripped Bash command: skips leading `NAME=value` assignments and `xargs` flags, requires the command word to be a known search binary AND a following path-shaped operand — a pipe filter like `| grep x` yields nothing.
- `stripQuotedSpans` (lines 192–194) — critical. Strips `'...'`/`"..."` spans from a Bash command before any verb/search matching — the discriminator that keeps command *prose* (e.g. an `echo` string containing the word "cortex insight") from being miscounted as a real invocation; the conservative direction (can only remove matches, never invent one).
- `bashFollows` (lines 451–455) plus `invokesWhy`/`invokesThreadList`/`invokesThreadAct` (lines 436–448) — supporting. Recognise a pending pointer's `more:` tail command (`cortex why <ref>`, `cortex thread list`) or a `cortex thread close|drop|promote <id>` acting on an `Open:` line's own thread as a non-Read form of "follow-through."
- `renderUsageBody` (lines 656–759) — critical. Pure figures-only renderer (Rule 5) producing the markdown report body; branches early to an all-"not measurable" body when `counts.readable` is false (Rule 6).
- `usageFindings` (lines 777–800) / `usageEvidenceFields` (lines 808–822) / `recordUsageEvidence` (lines 831–847) — supporting. The `--record` path: converts `UsageCounts` into the fixed-order typed findings `atlas.evidence` Rule 5 pins, builds the evidence file's fields (with `supersedes` pointing at the previous `*-usage.md` when one exists), and writes it with its own refusal set (not readable; today's file already exists — one recording per day).
- `runUsage` (lines 856–871) — critical. Top-level entry: always writes the pulse report first regardless of `--record`, then optionally records evidence — the report write and the recording are independent success paths.

## Insights

- **The counting-population discipline (Rule 2/9) is the file's central correctness property, not an incidental detail**: every invocation count comes ONLY from Bash `tool_use.input.command` fields (never message prose, never file content), and even within a command string, quoted spans are stripped first via `stripQuotedSpans` — both layers exist because the header comment records a concrete false reading (207 reported vs. 2 actual) that motivated the rule. Any future counting addition to this file should default to this same discipline rather than re-deriving a looser one.
- **Pointer/deferral tracking is two structurally similar but independently-windowed mechanisms**: pointers (Rule 11) use a fixed `POINTER_WINDOW` (10 tool calls) and can be followed by a Read, a search, or a recognized Bash follow-up command; deferrals (Rule 13) use a shorter `DEFER_RETRY_WINDOW` (3 tool calls), can only be "followed" by a Read, and — unlike pointers, which simply stop being pending after their window — explicitly classify into `proceeded` (inside window) vs. `later` (Read came after the window) vs. `abandoned` (no Read ever, counted at session end). A reader porting logic between the two should not assume they share retry semantics.
- **`follows`'s trailing-`-` prefix match is the mechanism that lets a single `Open:` line stand for "any file for this thread," not just one path** — `ID_SHAPES` maps a `T-NNN` token to `.cortex/pulse/threads/T-NNN-` (with the trailing dash preserved deliberately), so a Read of `T-042-some-slug.md` "follows" a pointer that only ever named the id, without this file needing to resolve the actual filename.
- **`searchTargetsIn`'s definition of "a search" is stricter than "any grep-like command appears"**: a segment only counts if, after stripping quotes and skipping `NAME=value`/`xargs` prefixes, the resolved command basename is in `SEARCH_COMMANDS` AND a path-operand token follows it — `isPathOperand` requires a `/`, a bare `.`, or a file extension, so `grep -c foo` (no path) is silently not a search, while `grep foo src/` is.
- **`cortexGreps` is explicitly a derived/legacy figure, kept only for report continuity**: the doc comment on the field says it "equals knowledge + machinery" of `searchesByTarget` — a reader adding a new search bucket must remember this invariant would break unless `cortexGreps`'s increment condition is updated in lockstep (it currently checks `bucket === 'knowledge' || bucket === 'machinery'` inline in `search()`, not derived from the final counts object).
- **`emptyCounts()` pre-seeds every enumerable key** (`recallVerbs`, `readsBySubdir`, `searchesByTarget`) so that "zero across sessions" and "never measured" are always distinguishable at the type level — `renderUsageBody`'s all-not-measurable branch is a wholly separate code path gated on `counts.readable`, never inferred from all-zero counts.
- **The `--record` evidence write and the always-write report are deliberately decoupled success paths**: `runUsage` writes `usage.md` unconditionally first, then evaluates `--record` — so a `--record` refusal (already-recorded-today, or unreadable) never prevents the report itself from landing, only returns a non-zero exit for the recording half.
- **`usageFindings`'s field order is externally pinned, not incidental**: the comment cites `atlas.evidence` Rule 5 as requiring this exact order (searches by bucket, then per-verb insight findings sorted, then recall, then tracked reads, then pointers, then the four deferral counts, then questions) — reordering fields here would violate a cross-file evidence-shape contract, not just cosmetic output.

## File map

- Lines 1–31: module doc comment (spec reference, Rule 1's no-logging-hook rationale, Rule 2's counting-population rule with its concrete false-reading example) and imports.
- Lines 33–64: bucket/window constants — `MACHINERY_PREFIXES`, `TRACKED_SUBDIRS`, `RECALL_COMMANDS`, `SearchTarget` type, `SEARCH_COMMANDS`, `KNOWLEDGE_MODULES`, `MACHINERY_TARGETS`, `DOCUMENT_FILES`, `POINTER_WINDOW`, `DEFER_RETRY_WINDOW`, `THREAD_ACT_VERBS`.
- Lines 66–140: `UsageCounts` interface, `CollectOptions`, `emptyCounts`.
- Lines 142–205: path helpers — `cortexRelative`, `moduleOf`, `toolUses`, `str`, `stripQuotedSpans`, `normalisePath`.
- Lines 207–257: search bucketing — `searchTargetOf`, `isPathOperand`, `searchTargetsIn`.
- Lines 259–350: pointer parsing — `PointerTarget` type, regex constants (`MORE_TAIL_RE`, `POINTER_PREFIX_RE`, `TRAILING_PATH_RE`, `THREAD_ID_RE`), `ID_SHAPES`, `pointerTargetsIn`.
- Lines 352–402: deferral parsing and injected-text extraction — `deferredPathsIn`, `pointerPathsIn` (legacy name), `injectedText`.
- Lines 404–485: follow-through predicates — `follows`, `invokesCortexVerb`, `invokesWhy`, `invokesThreadList`, `invokesThreadAct`, `bashFollows`, `resultText`.
- Lines 487–625: the main walk — `collectUsage`.
- Lines 627–650: report line renderers — `proceedRate`, `verbLines`, `recallLines`, `subdirLines`, `moduleLines`.
- Lines 652–759: `renderUsageBody`.
- Lines 761–847: Rule 12 evidence recording — constants (`USAGE_EVIDENCE_SLUG`, `USAGE_BEARS_ON`), `usageFindings`, `usageEvidenceFields`, `recordUsageEvidence`.
- Lines 849–871: entry point — `runUsage`.

## Connections

Uses:
- src/atlas/evidence.ts — `ensureEvidenceDir`, `evidenceFilePayload`, `latestEvidenceMatching`, `EvidenceFields`/`EvidenceFinding` types back the `--record` path: building, locating the prior recording (for `supersedes`), and landing the gated evidence file.
- src/loops/report.ts — `writePulseReport`, the shared always-write helper `runUsage` uses to land `.cortex/pulse/reports/usage.md` with standard header/provenance.
- src/sessions/read.ts — `listSessions`, `readSessionFile`, `SessionEntry` (type) — the strictly read-only transcript layer `collectUsage` walks; this file never touches transcript files directly.

Used by:
- src/hooks/search-annotate.ts — consumes this file's search/path bucketing conventions (likely `searchTargetOf`/`normalisePath`-adjacent logic) to annotate search tool results at hook time.

## Query pointers

- If you need to add a new countable signal (a new tool, a new pointer prefix, a new bucket), first read Rule 2's counting-population discipline in the header comment, then follow the existing pattern in `collectUsage`'s per-`tool_use` dispatch — never count from message prose or file content.
- If you need to understand the hook-injected pointer/deferral line grammars this file parses, also read: `src/hooks/` (the hooks that emit `Recall:`/`Decided:`/`Evidence:`/`Open:`/`Bugs:`/`Deferred:` lines — not in this scope group) and `src/pulse/threads.ts` (the `Open:` pointer's `T-NNN` id shape and thread-act verbs it recognizes).
- If you need to change what counts as "evidence" for `--record`, also read: `src/atlas/evidence.ts` (`EvidenceFields`/`EvidenceFinding` shapes and the `atlas.evidence` Rule 5 field-order contract `usageFindings` implements).
- If you need to verify the report's figures against a live project, run `cortex usage` and cross-check against `renderUsageBody`'s section-by-section rendering here rather than re-deriving the counting rules from scratch.
