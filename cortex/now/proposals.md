---
about: Proposals carried over from the 3.x store, waiting for a decision
permanence: volatile
verified: "2026-10-14 (observed)"
origin:
  - migrated:G-001@d7ed910
  - migrated:G-002@d7ed910
  - migrated:G-004@d7ed910
  - migrated:G-005@d7ed910
  - migrated:G-006@d7ed910
  - migrated:G-007@d7ed910
  - migrated:G-008@d7ed910
  - migrated:G-009@d7ed910
  - migrated:G-010@d7ed910
  - migrated:G-011@d7ed910
  - migrated:G-012@d7ed910
  - migrated:G-013@d7ed910
  - migrated:G-014@d7ed910
  - migrated:G-015@d7ed910
  - migrated:G-016@d7ed910
  - migrated:G-017@d7ed910
  - migrated:G-018@d7ed910
  - migrated:G-019@d7ed910
  - migrated:G-020@d7ed910
  - migrated:G-021@d7ed910
  - migrated:G-022@d7ed910
  - migrated:G-023@d7ed910
  - migrated:G-024@d7ed910
  - migrated:G-025@d7ed910
  - migrated:G-026@d7ed910
  - migrated:G-027@d7ed910
  - migrated:S-013@d7ed910
  - migrated:S-014@d7ed910
  - migrated:S-015@d7ed910
  - migrated:S-018@d7ed910
  - migrated:S-021@d7ed910
  - migrated:S-022@d7ed910
  - migrated:S-024@d7ed910
  - migrated:S-025@d7ed910
  - migrated:S-026@d7ed910
  - migrated:S-027@d7ed910
  - migrated:S-028@d7ed910
  - migrated:S-032@d7ed910
  - migrated:S-033@d7ed910
aliases:
  - G-001
  - G-002
  - G-004
  - G-005
  - G-006
  - G-007
  - G-008
  - G-009
  - G-010
  - G-011
  - G-012
  - G-013
  - G-014
  - G-015
  - G-016
  - G-017
  - G-018
  - G-019
  - G-020
  - G-021
  - G-022
  - G-023
  - G-024
  - G-025
  - G-026
  - G-027
  - S-013
  - S-014
  - S-015
  - S-018
  - S-021
  - S-022
  - S-024
  - S-025
  - S-026
  - S-027
  - S-028
  - S-032
  - S-033
---

# Proposals waiting for a decision

## G-001: Quoted spans in a Bash command are prose, not invocation
until: 2026-11-13
status: pending decision

**Spec:** `pulse.usage` Rule 2
**Severity:** NORMAL
**Files:** `src/pulse/usage.ts` (`stripQuotedSpans`, applied in the Bash branch of `collectUsage`),
`tests/atomic/pulse/usage.test.ts` (two tests)

**What was seen.** Rule 2 says CLI invocations are counted only inside Bash `tool_use` command
fields, which keeps *message* prose out of the count. Running the command against this repo showed
the same error one level down: a command field can itself contain prose. `echo "--- cortex insight
invocations by verb ---"` was counted as an invocation of a verb named `invocations`, and
`grep -oh 'cortex insight [a-z]*' *.jsonl` as one named `query`. The first baseline run reported
five verbs, three of which did not exist. The grep figure was inflated the same way: 125 before,
76 after.

**What was coded.** `stripQuotedSpans(command)` removes single- and double-quoted spans before
matching, for both the verb count and the `.cortex/` grep count. A real invocation is never inside
a quoted string, so quoting is the discriminator. Unterminated quotes are dropped to end of string
— the conservative direction, since it can only remove text, never invent a match.

**Suggested spec addition.** Extend Rule 2 with: *"Quoted spans within a command field are prose,
not invocation, and are excluded before matching — a command that merely names a verb inside an
`echo` or a `grep` pattern invokes nothing."* The rule's existing rationale already covers the
principle; this names the second place it applies.

**Removal.** Delete `stripQuotedSpans` and pass `command` directly at both call sites, then delete
the two tests named "does not count a verb quoted inside an echo or a grep pattern" and "does not
count a grep whose only .cortex mention is inside quotes". Nothing else depends on it.

## G-002: One command that invokes a verb N times counts as one
until: 2026-11-13
status: pending decision

**Spec:** `pulse.usage` Rule 2
**Severity:** NORMAL — it distorts the headline figure
**Files:** `src/pulse/usage.ts` (the Bash branch of `collectUsage` uses `RegExp.exec`, not a global
match)
**Status:** NOT fixed — recorded only, because the correct semantics are a spec question.

**What was seen.** The baseline run reported `cortex insight file: 3` where the hand count was 2.
The extra one is this session's planning-time query, issued as
`for f in a b c; do cortex insight file $f; done` — a single command string that invokes the verb
**three times at runtime** but contains the literal once, so `exec` counts it once. The figure is
therefore a floor for any loop, `xargs`, or `&&`-chained invocation.

**Why it was not silently "fixed".** Counting literal occurrences (`matchAll`) would fix the
chained case and still miss the loop case, where the count depends on runtime expansion a static
parse cannot see. Rule 2 does not say whether the unit is *commands that invoked* or *invocations
performed*, and the two differ. That is a spec decision, not an implementation call.

**Suggested spec addition.** Decide the unit in Rule 2 and say so. If it stays commands-that-
invoked, the report should label the figure a floor the way the question metric already is. If it
becomes invocations-performed, `matchAll` gets the chained case and the loop case stays
unknowable — which is worth stating rather than leaving implied.

#### loops.cortex-loop-bundle (2026-08-06)

**MINOR — the budget guard under-reports savings when bundles are removed.**
Seen: `measure-skill-descriptions.mjs` builds its row set from the working tree, so a
retired bundle contributes to neither the `before` nor the `after` total. After this merge
it reported `-47 chars` when the real saving was 1,202 — the eleven retired bundles simply
vanished from both columns. The absolute total (3,224 chars ≈ 806 tok, down from 4,426 ≈
1,107) is correct; only the delta line is wrong.
Coded: nothing — the guard's assertions are unaffected, and the AC was verified against the
absolute totals instead.
Suggested fix: enumerate bundles at the base ref too (`git ls-tree <ref> skills/`), not only
on disk, so removals land in `before`.
Files: `scripts/measure-skill-descriptions.mjs`.
Removal: n/a — nothing was added.

## G-004: Step 0 observer repairs: defensive branches coded, not asserted
until: 2026-11-13
status: pending decision

**Spec:** `insight.session-observe` Rules 11–13, `pulse.distil` Rule 11
**Severity:** MINOR
**Files:** `src/pulse/distil.ts` (`refreshCorpus`), `src/insight/session-observe.ts` (`parseProposalsFile`)

**What was seen.** Three branches have no test: `refreshCorpus` falling back to a 30-day window
when `generated` is unparseable; `parseProposalsFile` erroring on non-array `observed`/`candidates`
or a non-object file; the `replaced` count in the refresh result not surfaced in the worklist.

**Design note.** Distil's weekly `--collect` still rebuilds the corpus wholesale from
`distil-last-run`. An unclaimed session that falls outside distil's window disappears from the
corpus before its three attempts expire; its `attempts` entry then lingers harmlessly in state.
Decide whether refresh should protect unobserved sessions from the rebuild.

## G-005: Tool-use extraction: notebook_path fallback is from the tool schema, not observed
until: 2026-11-13
status: pending decision

**Spec:** `loops.session-reading` Rule 7
**Severity:** MINOR
**Files:** `src/sessions/read.ts` (`extractToolUses`, `sessionTitle`)

**What was seen.** No NotebookEdit call exists in this project's transcripts, so the
`notebook_path` fallback is unverified against a real entry. Entries typed neither user nor
assistant but with `message.role: assistant` are included by the tool helper (mirrors
`messageRole`) and untested. `sessionTitle` keeps the last *valid* title when the final
`custom-title` entry is malformed; only the malformed-last case is tested.

## G-006: Usage search classification: edge handling coded, not asserted
until: 2026-11-13
status: pending decision

**Spec:** `pulse.usage` Rules 8–11
**Severity:** NORMAL (one item), MINOR (rest)
**Files:** `src/pulse/usage.ts` (`searchTargetOf`, `searchTargetsIn`, `pointerPathsIn`, `follows`)

**What was seen.** NORMAL: `follows()` treats a Read whose absolute path ends with the pointed
relative path as a match for non-`.cortex` pointers; untested. MINOR: `/usr/bin/grep` basename
handling and `NAME=value` prefix skipping are coded, not tested; a Grep tool call without `path`
is not a search (spec says "carrying a path"); a `.cortex/<unknown-module>` search lands in
`other`, not `machinery`. Finding recorded in the spec Notes: hook `additionalContext` lands in
`type: attachment` entries (`hook_additional_context`, `content: string[]`), not user entries;
Rule 11 scans both shapes.

## G-007: Thread ledger primitives: serialiser and parser edge cases coded, not asserted
until: 2026-11-13
status: pending decision

**Spec:** `pulse.threads` Rules 1, 2, 5, 7
**Severity:** MINOR
**Files:** `src/pulse/threads.ts` (`serialiseThread`, `parseThreadFile`, `threadPath`)

**What was seen.** The serialiser JSON-quotes a scalar that is not plain-YAML-safe (a `session`
or `resolved_by` containing spaces or `: `); parse of the quoted form is covered only indirectly.
Parse does not enforce "answered/resolved_by present iff status answered" (type-checked only;
left to `check.threads` per Rule 1). `threadPath` picks the lexicographically first file when two
`<id>-*.md` files exist for one id.

## G-008: Thread verbs and promote: usage-error paths and provenance edge cases untested
until: 2026-11-13
status: pending decision

**Spec:** `pulse.threads` Rules 11–13
**Severity:** MINOR
**Files:** `src/pulse/thread-cli.ts`

**What was seen.** Decision provenance uses the opener citation's user segment for every trail
entry (mixed-user trails are re-homed). A thread whose trail has no well-formed
`claude-sessions/<u>/<id>` citation gets a shape-valid placeholder `derives_from`. `--type` or
`--affects` with `--to atlas/decisions`, and unknown flags on drop/close/promote, exit 2 but are
not asserted. `nextBugId`, `loadThread`, `splitCitation` and a `yamlScalar` duplicate live in
thread-cli.ts because threads.ts lacked them; consider hoisting.

## G-009: Hygiene Rule 8: skipped-count line and the loop skill reference
until: 2026-11-13
status: pending decision

**Spec:** `pulse.hygiene` Rule 8
**Severity:** MINOR
**Files:** `src/pulse/hygiene.ts`, `skills/cortex-loop/references/hygiene.md`

**What was seen.** The report adds a "Thread files skipped: N" line when a thread's frontmatter
fails to parse; the spec only says the count is kept. The shipped hygiene skill reference does
not name the new "Threads and session records" section (the plan forbade bundle changes).

## G-010: Session-end hook: detection edge cases coded beyond the spec wording
until: 2026-11-13
status: pending decision

**Spec:** `hooks.session-end` Rules 4, 5, 7c; `pulse.threads` Rules 4, 9
**Severity:** NORMAL (two items), MINOR (rest)
**Files:** `src/hooks/session-end.ts`, `src/pulse/threads.ts`

**What was seen.** NORMAL: a session never answers a thread whose `sessions` trail already carries
it, otherwise a re-fire answers its own question by key mention and opens a duplicate; Rule 9
should state it. NORMAL: the lexicon fallback strips `<cortex:finding>` tags before scanning
sentences so a tagged sentence is not counted twice; Rule 7c's "untagged" should say so. MINOR:
the first-user line is the first user line that yields text, so a leading tool_result cannot
mislabel `session_kind`. MINOR: `openThreadsFromRecord` prefers `record.reads` over the
conventional ledger path. MINOR: a bulk line skipped by the prefix pass sets `partial: true`,
a cause schema §4.5.3 does not list. Observed on the live run: markdown table rows yield many
lexicon findings (nine on one transcript); being addressed with the harness-entry exclusion.

## G-011: Ref resolver and clause index: test-harness and tolerance edges
until: 2026-11-13
status: pending decision

**Spec:** `schema.bears-on` Rules 1–3, `schema.schema-clauses`
**Severity:** MINOR
**Files:** `src/schema/refs.ts`, `src/schema/checks/bears-on.ts`, `tests/atomic/schema/*.test.ts`

**What was seen.** `resolveRef` also rejects the empty path after normalisation and POSIX-absolute
refs; unparseable decision frontmatter is skipped by `check.bears-on` (check.atlas owns it). Two
test files partially mock `fs` to count reads (no repo precedent; the ESM namespace is sealed).
The spec-layer test uses the fixture's `schema.validator` id where the criterion says
`pulse.usage`, because the valid fixture has no such spec.

## G-012: Recall index compiler: id fallback, whitespace, and a gray-matter cache quirk
until: 2026-11-13
status: pending decision

**Spec:** `recall.recall-index` Rules 8, 10
**Severity:** NORMAL (cache quirk), MINOR (rest)
**Files:** `src/recall/index.ts`, `src/schema/checks/bears-on.ts`, `src/schema/checks/evidence.ts`

**What was seen.** NORMAL: gray-matter caches the file object before parsing when called without
options, so a frontmatter that throws once in `buildIndex` returns empty data on a later re-parse.
The compiler passes a no-cache option; `check.bears-on` and `check.evidence` may carry the same
latent quirk (harmless there: empty data means no `bears_on`, skipped). MINOR: a decision or
evidence file with parseable frontmatter but no string `id` gets `<kind>.<stem>` as its entry id
rather than being skipped. MINOR: thread titles collapse whitespace runs before the 80-char cut.
MINOR: subject keys are created for every resolving ref even when the carrier contributes to no
list (Rule 2 read literally).

## G-013: bears_on seeding and the two decision warnings: judgment calls
until: 2026-11-13
status: pending decision

**Spec:** `insight.session-observe` Rule 6, `constellation.compiler` Rule 10, schema §4.3
**Severity:** MINOR
**Files:** `src/insight/session-observe.ts`, `src/constellation/compile.ts`, `src/schema/checks/atlas.ts`

**What was seen.** An explicit empty `bears_on: []` on a decision is treated as "bears on
nothing" (the schema says 0..n). The constellation compiler skips a scalar `bears_on` silently
rather than counting it. `readLedgerSeed` stops at the cap mid-file, so later sessions never
contribute once the first ledger fills it.

## G-014: cortex sync does not add the 3.4 gitignore line on upgrade
until: 2026-11-13
status: pending decision

**Spec:** `core-cli.init` Rule 2 (fifth gitignore line), schema §10.4 (3.3→3.4 "sync refreshes scaffolding")
**Severity:** NORMAL
**Files:** `src/cli/sync.ts`

**What was seen.** Upgrading this repo from 3.3 to 3.4 with `cortex sync` rewrote
`schemaVersion` and the CLAUDE.md block but left `.gitignore` without `.cortex/recall-index.json`;
the first `cortex scan` then produced an untracked index. Added by hand here. Sync should merge
missing `GITIGNORE_LINES` on a MINOR upgrade, or §10.4 should say the line is init-only.

## G-015: Accepted evidence-candidate lands without a trailing newline
until: 2026-11-13
status: pending decision

**Spec:** `atlas.evidence` Rule 7, schema §4.5.1
**Severity:** MINOR
**Files:** `src/pulse/review.ts`

**What was seen.** `pulse-accept` writes an evidence-candidate payload without a trailing
newline, following the existing B-003 fenced-block semantic; the tests assert that precedent.
Decide whether create payloads should always end in a newline.

## G-016: Recall query module: index inconsistency and token edges
until: 2026-11-13
status: pending decision

**Spec:** `hooks.search-annotate` Rules 4, 5, 9, 11; `recall.recall-index` Rule 6
**Severity:** MINOR
**Files:** `src/recall/query.ts`, `src/recall/index.ts`

**What was seen.** Subjects list observations by theme while entries are keyed
`observation.<theme>`; the query module falls back on lookup and fired ids use the entry key.
Rule 4 tokens are ≥3 chars split on `.`, so clause numbers such as `4.11` or `5` never arrive as
tokens for the Rule 5e number match; callers may pass raw numeric spans. The `more:` tail counts
unfired members only, and is stripped before the pointer-target search so a path ref in it never
becomes the target. The imperative-free criterion forbids "you", but titles are data and one real
thread title contains it; the grammar test uses fixtures without it.

## G-017: PreRead recall marker: parent-directory subjects excluded; evidence ids never cut
until: 2026-11-13
status: pending decision

**Spec:** `hooks.pre-read-writeback` Rule 6, schema §5 PreRead row (c)
**Severity:** NORMAL (first item), MINOR (rest)
**Files:** `src/hooks/pre-read.ts`

**What was seen.** Parent-directory subjects are excluded from the PreRead lookup on the reading
that row (c) names the path, spec id, rule and clause subjects only, and the Grep hook owns
directories; flip the filter if Rule 6 is meant to include search-annotate Rule 5(b). Evidence ids
are never cut by the fit, so three long ids can exceed 200 chars after the three spec'd steps.
Marker-only reads do not touch the read ledger and never carry the duplicate note. A throw inside
the marker lookup logs to hook-errors and still emits the summary (not reachable with the loader).

## G-018: cortex why / recall and the invocation gate: small unasserted paths
until: 2026-11-13
status: pending decision

**Spec:** `recall.why` Rules 1–7, `core-cli.init` Rule 18
**Severity:** MINOR
**Files:** `src/recall/cli.ts`, `src/cli/cli.ts`

**What was seen.** The usage text's closing hint line, an empty `findings:` list (sub-line omitted
rather than "unreadable"), and the inferred `pulse-accept <id>` synopsis are untested. When the
matched key differs from the ref the first line reads `<key> (<kind>, for <ref>)`; the spec only
says the key is named. `--version`/`-v` are treated as unrecognised until a version verb exists.

## G-019: Generated index blocks: trailing newline and sync's re-append half
until: 2026-11-13
status: pending decision

**Spec:** `recall.index-blocks` Rules 5, 7; `core-cli.sync` Rule 4
**Severity:** MINOR
**Files:** `src/recall/index-blocks.ts`, `src/cli/sync.ts`

**What was seen.** An index file lacking a trailing newline gains one on the first write (stable
from the second run). Sync's "refresh re-appends the block" half of Rule 7 has no code path because
`refreshIndexes` never rewrites today; flagged in a comment for the version-keyed template work.

## G-020: Hygiene retention does not cover the recall-fired and read-deferred ledgers
until: 2026-11-13
status: pending decision

**Spec:** `pulse.hygiene` Rule 7, `hooks.search-annotate` Rule 9, `hooks.pre-read-writeback` Rule 7
**Severity:** MINOR
**Files:** `src/pulse/hygiene.ts`

**What was seen.** `pulse/state/recall-fired/<session>` (step 3) and `pulse/state/read-deferred/<session>`
(step 4) accumulate one file per session like `state/reads/`, but Rule 7's 14-day deletion names
`state/reads/` only. Extend Rule 7 to the three per-session ledger directories or say why not.

## G-021: Step 4 seed: duplicated scheduled-session constants and an uncut long path
until: 2026-11-13
status: pending decision

**Spec:** `hooks.prompt-route` Rule 4, `hooks.search-annotate` Rule 10, `pulse.usage` Rule 11
**Severity:** MINOR
**Files:** `src/pulse/distil.ts`, `src/recall/query.ts`, `src/pulse/usage.ts`

**What was seen.** `distil.ts` keeps private SCHEDULED_* constants that duplicate
`src/hooks/harness.ts` (behaviour identical); hoist when distil is next touched. `fitOpenLines`
emits a line uncut when the path alone keeps it over budget. `pointerTargetsIn` now prefers a
trailing `(<path>)` over the first `/`-bearing token, otherwise an `Open:` line pointed at
`state/` from its key text; Rule 11's wording is being aligned by the orchestrator.

## G-022: Read-deferral gate: an unreachable criterion half and a budget-order observation
until: 2026-11-13
status: pending decision

**Spec:** `hooks.pre-read-writeback` Rule 7
**Severity:** NORMAL
**Files:** `src/hooks/pre-read.ts`, `src/insight/entry.ts`

**What was seen.** The criterion half "an entry lacking size_lines falls through to the Rule 2
payload" is unreachable: `parseEntry` rejects such an entry before Rule 7 sees it, so today's
behaviour is silence plus one "insight entry unreadable" log; the test pins that. Either the
criterion wording or the parser needs a change. Observation for the experiment: on the real
`src/pulse/usage.ts` entry the Purpose first line is 1,655 chars, so the pinned budget order
(drop Connections first) yields `Connections: -` and a trimmed purpose; long-Purpose L2 entries
will routinely lose their Connections in the deny reason. Legacy read-memory self-heal before the
Rule 7 check is coded but untested.

## G-023: prompt-route lists the threads directory itself instead of via listThreads
until: 2026-11-13
status: pending decision

**Spec:** `hooks.prompt-route` Rule 5
**Severity:** MINOR
**Files:** `src/hooks/prompt-route.ts`, `src/pulse/threads.ts`

**What was seen.** Rule 5 says "via listThreads", but `listThreads` returns no filenames and
re-lists per `threadPath` call; to keep one readdir and the 200-file cap the hook lists the
directory and parses with `parseThreadFile` (same skip-unparseable semantics, tested). Either
`listThreads` grows an options parameter or the rule wording follows the code.

## G-024: Session-end lexicon captures the assistant's own status ladders as findings
until: 2026-11-13
status: pending decision

**Spec:** `hooks.session-end` Rule 7c
**Severity:** NORMAL
**Files:** `src/hooks/session-end.ts`

**What was seen.** On 2026-09-16 the hook opened threads T-001 and T-002 of kind `finding` from
the assistant's brief output ("0% ░░░░░░░░░░ done when a grep into the schema returns…", a RULES
bullet). Lines with progress-bar glyphs, `NN%` figures or "done when" are status, not
measurements. Being addressed in wave follow-up A3.

## G-025: Recall carriers: rule subjects shadowed by exact paths and capped across globs
until: 2026-11-13
status: pending decision

**Spec:** `recall.recall-index` Rules 2, 15, 17
**Severity:** NORMAL
**Files:** `src/recall/index.ts`, `src/recall/cli.ts`

**What was seen.** `cortex why src/schema/checks/xref.ts` lists 0 rules although R-001 governs it: the
exact-path subject shadows the `src/schema` directory subject, and R-001's 20-file cap across
seven globs reaches only the alphabetically first 20 files. A resolved bug's `affects` still
create empty subject keys (mirrors superseded decisions per Rule 2). fast-glob `dot:false` means a
rule governing `.specflow/**` gets only its directory-prefix subject. R-/B- follow-through uses the
`<id>-` basename prefix, so an id file without a slug would not follow. Keyword matching reaches
resolved bugs by design ("scheduled tasks" → two resolved bugs on this repo).

## G-026: Id registry: reserved lines are claimable, sync step has no progress message
until: 2026-11-13
status: pending decision

**Spec:** `schema.id-registry` Rules 2–4, `core-cli.sync` Rules 14–15
**Severity:** MINOR
**Files:** `src/compass/registry.ts`, `src/cli/sync.ts`, `src/pulse/review.ts`

**What was seen.** A `reserved` registry line is claimable by any slug on accept (an id reserved
with `cortex id next rule` can still land as a proposal). `allocateId` normalises a slug to the
grammar and the CLI never rejects one. Sync Rule 15 emits no progress message because Rule 14 pins
exactly seven; the registry creation is only in the summary line. The bug-currency `triaged`
without `owner` is deliberately not warned (shape-only).

## G-027: Promote: a refused promote leaves a reserved registry id; archive-root check is prefix-based
until: 2026-11-13
status: pending decision

**Spec:** `schema.id-registry` Rule 3, `insight.promotion-mechanism` Rules 5–6
**Severity:** MINOR
**Files:** `src/compass/registry.ts`, `src/pulse/thread-cli.ts`, `src/pulse/promote.ts`

**What was seen.** `allocateId` appends the registry line before `thread promote`'s no-clobber
check, so a refused promote leaves an issued-but-unused id (by design — ids are never reused —
but untested). The archive-root restriction in `planPromotion` compares normalised project-relative
prefixes; an absolute `**Target:**` is refused earlier by review.ts's permitted-root gate, so no
hole, but the two checks overlap. `check.pulse` still has no Source-shape check per proposal type
(B-020's adjacent item): the producer/gate split is caught only by the ingest-skill spec test.

## S-013: Always-resident context is a permanent per-session cost in every consuming pr...
until: 2026-11-13
status: pending decision

**Source:** distil (sessions: fc8202fc-723d-4a7c-82df-597d17b5601c, 70746728-ff13-4543-a618-90ab8d6b8232, 618b4051-af55-475e-8d18-4e95af0adf42, 3bac199d-2d61-471f-b48b-f91c871cd282)
**Target:** .cortex/compass/preferences.md
**Pattern:** Always-resident context is a permanent per-session cost in every consuming project — keep the skill listing small: merge related skills into one bundle with reference files, keep `description:` frontmatter terse, and make scheduled-task-only skills callable-only with no trigger surface.
**Occurrences:** 6
**Confidence:** high

**Proposed addition:**

```
- **Treat always-resident context as a budget, not a free surface.** Cortex installs its skills into every consuming project's `.claude/skills/`; each skill's `description:` frontmatter is resident in the skill listing of EVERY session there, while the body is lazy-loaded and free. Before adding a skill or lengthening a description, price it: prefer merging related skills into one bundle with `references/` files over adding a sibling, keep descriptions terse, and give skills that only scheduled tasks invoke no trigger surface at all (callable-only, named explicitly by the payload). The same reasoning applies to CLAUDE.md and SessionStart-hook output — Pedro's stated preference is a lengthier session-start injection over a large CLAUDE.md, because the hook payload is tunable and CLAUDE.md is not. (Pedro, repeatedly across the 14-skills cleanup, the skill-listing token measurement, and the cortex-loop bundling.)
```

## S-014: Pedro routinely runs two or more Claude sessions against this repo at once; a...
until: 2026-11-13
status: pending decision

**Source:** distil (sessions: 618b4051-af55-475e-8d18-4e95af0adf42, f4e6e3a9-b9fd-475c-807c-68910703d74d, 70746728-ff13-4543-a618-90ab8d6b8232)
**Target:** .cortex/compass/preferences.md
**Pattern:** Pedro routinely runs two or more Claude sessions against this repo at once; an implementation session must isolate itself (worktree/branch from its own last commit), commit only its own files, and never read a dirty working tree as evidence about its own work.
**Occurrences:** 6
**Confidence:** high

**Proposed addition:**

```
- **Assume a concurrent session is editing this repo.** Pedro commonly drives two or more Claude sessions against the same tree at the same time. Before implementing: branch or take a git worktree based on your own last commit rather than working in the shared checkout, and be explicit about version bumps because a sibling session may be bumping the same ones. When committing: commit only the files you touched, never `git add -A`. When diagnosing: a dirty working tree or an unexpected diff is a sibling's in-flight work until proven otherwise — this is the same failure mode already recorded for parallel subagents in `standing-authorities.md` and for the weekly-quality bundle, generalised to whole sessions. (Pedro, 2026-08: "Im working 2 sessions at the same time, perhaps you should work on a work tree"; "Commit everything thats yours, nothing that isnt"; "be mindful of the versions cause im doing other changes".)
```

## S-015: Changes to `cortex init` / `cortex sync` / skill installation are not done un...
until: 2026-11-13
status: pending decision

**Source:** distil (sessions: 5d0bfb94-f382-47c0-8190-8f2cc978dd0c, 70746728-ff13-4543-a618-90ab8d6b8232, f4e6e3a9-b9fd-475c-807c-68910703d74d, 3bac199d-2d61-471f-b48b-f91c871cd282)
**Target:** .cortex/compass/preferences.md
**Pattern:** Changes to `cortex init` / `cortex sync` / skill installation are not done until they have been run in a second, real consuming project — repeatedly the in-repo suite was green while the real-project behaviour was wrong.
**Occurrences:** 5
**Confidence:** medium

**Proposed addition:**

```
- **Ship-path changes are verified in a second real project, not only by the suite.** Any change to `cortex init`, `cortex sync`, the scaffolded `.cortex/` layout, or skill/scheduled-task installation must be exercised by actually running the command in another project on this machine before it is reported as working. Every regression in this class was found that way and not by the in-repo tests: skills the developer deleted being reinstalled, a retired bundle that sync never removed, and a nested `.cortex/.specflow` duplicate created by init inside an existing layer. Name the project you ran it in and paste the observed output in the report. (Pedro, recurring: "I ran cortex sync and the loop skills were not deleted"; "in the project i ran cortex init looks like a have a duplicate of cortex inside it".)
```

## S-018: Writing a session handoff document — current state, what was being attempted,...
until: 2026-11-13
status: pending decision

**Type:** skill-proposal
**Source:** distil (sessions: 3bac199d-2d61-471f-b48b-f91c871cd282, f4e6e3a9-b9fd-475c-807c-68910703d74d, b45a78eb-5ef3-4fa3-81ad-0a56c18db988, 70746728-ff13-4543-a618-90ab8d6b8232)
**Target:** .claude/skills/session-handoff/SKILL.md
**Pattern:** Writing a session handoff document — current state, what was being attempted, learnings, and what the next session needs — into the gitignored `plans_and_handoffs/handoffs/<date>.md`, re-derived from scratch each time it is asked for.
**Occurrences:** 3
**Confidence:** medium

**Proposed file:**

```
---
name: session-handoff
description: 'Write a handoff so another session can continue this work. "write a handoff", "hand this off".'
---

# session-handoff

## When to use

The user says "write a handoff", "write a handoff file", "so another session can pick this up", or is about to stop work that a parallel or later session will continue. Also use it unprompted at a natural stopping point when work is unfinished and the user runs concurrent sessions on this repo.

This is the write half. To *consume* a handoff, just read the newest file in `plans_and_handoffs/handoffs/`.

## Where it goes

`plans_and_handoffs/handoffs/<YYYY-MM-DD>.md` — gitignored, alongside `plans_and_handoffs/plans/<YYYY-MM-DD>.md`. If a file for today already exists, append a new `## <HH:MM> — <topic>` section rather than overwriting it; two sessions can hand off on the same day.

## What to write

One file, these sections in order. Write for a reader with zero memory of your conversation — name every path in full and never say "as discussed above".

1. **Goal** — what this work is trying to achieve, and the spec or plan that authorises it.
2. **State on disk** — what is committed (with the commit sha and branch), what is uncommitted, and whether a worktree is in play. Run `git status` and `git log --oneline -5` and paste the real output; do not summarise it from memory.
3. **Done** — each completed step with the file paths it touched.
4. **Not done** — the remaining steps in execution order, each concrete enough to start without asking a question.
5. **Verification state** — the actual result of `pnpm build`, the test suite, and `cortex validate`, with counts. If you did not run them, say so explicitly.
6. **Learnings** — what surprised you: dead ends, false leads, gotchas, and any behaviour that contradicted a spec or a report. This is the section the next session cannot reconstruct, so it is the one worth the most words.
7. **Open questions for the user** — anything you were blocked on.

## Discipline

- Verify before you write: read `git status`, the test output, and the files you claim to have changed. A handoff that misstates disk state is worse than none, because the next session will act on it.
- Never invent progress. "Not started" is a legitimate entry.
- The handoff is a note to a peer, not a report to the user — do not use it to replace the summary you owe the user in chat.
- Write the file before you say you are done, so the work survives if the session ends.

```

## S-021: Headless `cortex` invocations in scheduled/unattended runs can hang at near-z...
until: 2026-11-13
status: pending decision

**Source:** distil (sessions: 9c6cdd6d-65db-46dd-998f-2232f2b016bb, 797a3f69-2c76-4d6a-86b4-3a9dd6910913, 738a8033-6a3e-4ac5-9063-23ab51cb5024, 18c9473f-b581-4cca-bd1a-ce9e50c725bb)
**Target:** .cortex/compass/environment.md
**Pattern:** Headless `cortex` invocations in scheduled/unattended runs can hang at near-zero CPU, and macOS has no `timeout` command — run them backgrounded and poll instead of waiting synchronously.
**Occurrences:** 4
**Confidence:** high

**Proposed addition:**

```
Headless `cortex` commands are run backgrounded and polled, never awaited synchronously. In scheduled/unattended runs some long-running Core commands (`cortex pulse-hygiene`, the insight-extraction `runL1` path) have been observed hanging at near-zero CPU rather than exiting. This machine is macOS and has **no `timeout` binary** — a `timeout ... ; echo $?` wrapper both fails with "command not found" and, when piped, reports the pipe tail's status, so it silently reads as success. Use the Bash tool's own `run_in_background`/`timeout` parameters, poll for completion, and fall back to the last written report if the command never returns. Distinct instance class with no mitigation available: the `cortex hook session-start` hook itself, measured at an 807ms median across 31 runs but with 3 outliers near ~930s across three projects — nobody invokes it manually, the harness does. Promoted from `insight/observations/headless-cli-hang.md` (three sessions), re-confirmed live in the 2026-08-20 weekly-curation run.
```

## S-022: The global `cortex` binary on this machine is a `pnpm link` to this repo's `d...
until: 2026-11-13
status: pending decision

**Source:** distil (sessions: fc8202fc-723d-4a7c-82df-597d17b5601c, 5d0bfb94-f382-47c0-8190-8f2cc978dd0c, 70746728-ff13-4543-a618-90ab8d6b8232)
**Target:** .cortex/compass/environment.md
**Pattern:** The global `cortex` binary on this machine is a `pnpm link` to this repo's `dist/`, not a published install, so every local build takes effect immediately and silently in every other Cortex project on the machine.
**Occurrences:** 3
**Confidence:** high

**Proposed addition:**

```
The global `cortex` binary is a `pnpm link` straight to this repo's `dist/` output — version `1.0.0` has never been published to the registry. There is no install or upgrade step between this repo and the other Cortex projects on this machine (`client-A`, `client-B`, `client-C`): the moment `pnpm build` runs here, every one of them is running the new binary the next time `cortex` is invoked there. Two consequences. (1) When a change in this repo does not show up in another project — or a change appears in another project that nobody made there — check first whether they are the same linked binary rather than independent installs. (2) Schema/seed chains are exposed to a "seed-version trap": a `SKILL_ADDITIONS` entry added *within* an already-recorded schema version is silently skipped in projects that recorded that version before the entry existed. Promoted from `insight/observations/cortex-binary-is-pnpm-link.md` (three sessions).
```

## S-024: Give Claude extra tools, not extra obstacles — a design that adds context-pol...
until: 2026-11-13
status: pending decision

**Source:** distil (sessions: f2a2b32d-7342-4527-99e4-a7716db566b6, f4e6e3a9-b9fd-475c-807c-68910703d74d)
**Target:** .cortex/compass/preferences.md
**Pattern:** Give Claude extra tools, not extra obstacles — a design that adds context-pollution, per-read overhead, or user hassle to deliver knowledge is rejected in favour of one Claude can query cheaply when it chooses.
**Occurrences:** 6
**Confidence:** medium

**Proposed addition:**

```
- **Tools, not obstacles.** Cortex earns its keep by making the right knowledge cheap to *fetch*, never by forcing it in front of every action. Proposals that work by injection or interception get judged on the overhead and the pollution they add: Pedro killed the `UserPromptSubmit` hook outright ("Lets not have any of those hooks then"), killed an always-resident context block ("Im not liking this way. Its context poluting. Its not good practice"), and stated the principle directly — "The idea is to give Claude extra tools, not give it extra obstacles." The target shape is a navigable wiki: "cortex is meant to act as a wiki where claude could quickly and cheaply get the right information", segregated so each file is a small read, with an index Claude can traverse to the exact file instead of guessing two or three words to grep. The same instinct applies to the user side of any feature — "We can just check now what skills to install or upgrade with a version bump. That can be information on our side. No cost or hassle for the user." Where interception *is* the right answer (the pre-read hook offering a file's summary before Claude reads it), it must be optional, cheap, and bullet-proof: "Any error from our side must allow claude to read the file, we can never get into a loop." (Pedro, 2026-08, cortex-adoption brainstorm and the sync/skills work.)
```

## S-025: Cortex's own insight layer is scoped to `src/` only — the 150-200 non-src fil...
until: 2026-11-13
status: pending decision

**Source:** distil (sessions: 9c6cdd6d-65db-46dd-998f-2232f2b016bb, 67da915c-1080-40a7-a0a8-ece57da80042, 09124a88-f17c-456b-9005-164bc9d793d7, 797a3f69-2c76-4d6a-86b4-3a9dd6910913, 3cde3a93-2188-49fa-b41b-eac6de3a81ac, d3f0bc08-35e2-4c69-bd4f-4d120632e173, f2a2b32d-7342-4527-99e4-a7716db566b6, 24a8c676-da90-4f8c-ad2f-c3891847195b)
**Target:** .cortex/compass/preferences.md
**Pattern:** Cortex's own insight layer is scoped to `src/` only — the 150-200 non-src files the refresh loops flag dirty every cycle stay pending by design — and its query surface cannot see `.cortex/compass/` or `.cortex/atlas/` at all, so "why" questions must be grepped there directly.
**Occurrences:** 8
**Confidence:** high

**Proposed addition:**

```
- **Insight on this project covers `src/` only — the perpetual pending count is expected, and the query surface cannot see compass or atlas at all.** `anatomy/` has a single `src/` subtree; this project runs the fully flat/unscoped layout (no `scopes/`, no `scope-registry.yaml` — a full collect reports "0 scopes") and the `src/`-only coverage is a hard L1 skip-list exclusion, not a registry that partially covers other paths. `.cortex/`, `.specflow/` and `.claude/` are hard-excluded because insight is about the code, not the knowledge layer, specs, or skill bundles. The daily and full refresh loops therefore report 150-200 non-`src/` files as dirty or new every cycle and leave them `pending` forever: that is the designed state, not a defect — do not "fix" it by extracting them, and do not widen the scope from inside an unattended loop. The direct consequence to know before reaching for `cortex insight` on a "why" question: `cortex insight concept <compass-concept>` returns "no such concept" and `cortex insight file <path-under-compass>` returns "no insight entry" — grep `compass/` and `atlas/` directly instead. A blind A/B of insight-informed vs code-only agents on identical questions found compass/atlas citations were exactly where insight's only outright wins came from, while it lost or tied on the code-focused questions it should have won. Promoted from `insight/observations/insight-scope.md`, re-confirmed across eight sessions.
```

## S-026: The session-observe boundary audit misattributes ANY pre-existing uncommitted...
until: 2026-11-13
status: pending decision

**Source:** distil (sessions: 9c6cdd6d-65db-46dd-998f-2232f2b016bb, 67da915c-1080-40a7-a0a8-ece57da80042, 09124a88-f17c-456b-9005-164bc9d793d7, c564d673-033f-4801-879c-f8bc6628e43c, d97506f5-d147-4dd2-829c-1131fb83ed23)
**Target:** .cortex/compass/do-not-repeat.md
**Pattern:** The session-observe boundary audit misattributes ANY pre-existing uncommitted `.cortex/` diff to itself — not just the same-run insight-refresh member's writes — because this repo goes weeks without committing the `.cortex/` state its own loops keep writing.
**Occurrences:** 5
**Confidence:** high

**Proposed addition:**

```
Do not treat the daily bundle's session-observe boundary-audit violations as a real breach on first sight. Member 5 (`session-observe`) audits itself by diffing the working tree against git HEAD, and it misattributes ANY pre-existing uncommitted diff under the paths it checks to itself — this is not limited to same-run ordering against member 4 (`insight-refresh-daily`). Confirmed on 2026-09-04: member 4 reconciled zero entries that cycle, yet member 5 still reported 16 violations — 14 against `.cortex/insight/anatomy/src/cli/{scaffold,templates}.ts.md` left uncommitted by an unrelated earlier session, plus 2 against gated compass paths (`compass/bugs/_index.md`, an untracked `B-017-*.md`) that member 5 never touches. The real root cause is this dogfood repo going weeks without committing `.cortex/` while every loop that legitimately writes there piles diffs onto the working tree; the audit then attributes all of it, gated or not, to whichever loop ran last. Confirm by checking whether the flagged diffs pre-date this run (`git log` / `git diff` timestamps on the named files) before treating a violation count as real. Nothing is lost when it fires — `applyObserve` still lands proposals and advances observed-state. Committing `.cortex/` state every bundle run, per this repo's own convention of tracking `.cortex/`, clears the noise at the source. Promoted from `insight/observations/session-observe-audit-false-positive.md`, five sessions.
```

## S-027: A scheduled bundle can fail to produce its reports with no error surfaced any...
until: 2026-11-13
status: pending decision

**Source:** distil (sessions: de9fdb35-c4bf-439e-b00e-b5c5d99febe4, 8da7a3fc-de1a-4627-a3da-53c03a0c3b0c, 21e2fe3a-3538-44ab-b913-05072d15d0cd, 756acbee-b342-4c03-a263-e17c939a01f4, f8c94661-47c1-4ea2-bb28-01cb26f70e0e, b6fa9d2b-cc7e-472d-a709-12d5dd22d38a)
**Target:** .cortex/compass/do-not-repeat.md
**Pattern:** A scheduled bundle can fail to produce its reports with no error surfaced anywhere — silent no-act, a mid-run connection drop, or an expired/revoked OAuth token all look identical from the outside, so a missing or stale pulse report must never be read as 'the bundle had nothing to report'.
**Occurrences:** 6
**Confidence:** high

**Proposed addition:**

```
Do not read an absent or stale pulse report as a clean cycle. A scheduled-bundle session can fail to produce some or all of its reports for at least three distinct reasons, and the scheduled-task infrastructure surfaces none of them as a failure: (a) silent no-act — the `<scheduled-task>` prompt is delivered, the session answers with one line ("Ready — what would you like to work on?", "I'll run the bundle, let me start by orienting") and stops at 2 messages, nothing runs (2026-08-28 `cortex-daily`; 2026-09-05 `cortex-weekly-curation`); (b) mid-run connection drop ("API Error: Connection closed mid-response", 2026-09-02 `cortex-test-runner`, whose `test-failures.md` still reads 2026-08-30); (c) mid-run OAuth expiry or revocation ("401 OAuth access token has expired" / "has been revoked", two different strings on 2026-08-30 across two unrelated sessions, i.e. an account-level event, not a code bug). An independent four-agent audit on 2026-09-02 confirmed the same gap from the outside: no daily transcript exists for 2026-08-27 or 2026-09-02 while the registry's `lastRunAt` claims a 2026-09-02 fire and every daily report's `generated:` stamp reads 2026-09-01. It recurs across weeks and at least three of the five bundles (`daily`, `weekly-curation`, `test-runner`). The only detection available today is comparing each `.cortex/pulse/reports/*.md` mtime against its bundle's expected cadence — do that before concluding a loop found nothing. The proposed durable fix (not yet built): a per-bundle `.cortex/pulse/reports/<bundle>-digest.md` stamped `started:`/`finished:` with one line per member (ran / failed: `<error>` / skipped-timeout), plus a deterministic hygiene check that flags a bundle digest stale past ~1.5x its cadence. Promoted from `insight/observations/scheduled-task-silent-noop.md`, six sessions.
```

## S-028: The five deployed scheduled-task payloads under `~/.claude/scheduled-tasks/co...
until: 2026-11-13
status: pending decision

**Source:** distil (sessions: 3885d16d-c73e-4b00-9867-71aafcc75a91, d97506f5-d147-4dd2-829c-1131fb83ed23, 2e498599-40da-4415-bd91-93d104ffac1b, b6fa9d2b-cc7e-472d-a709-12d5dd22d38a)
**Target:** .cortex/compass/environment.md
**Pattern:** The five deployed scheduled-task payloads under `~/.claude/scheduled-tasks/cortex-*/SKILL.md` are a stale snapshot that `cortex sync`/`init` never refreshes without `--force`, so the live `<scheduled-task>` prompt a bundle session receives is not authoritative about what its members do — follow the current `cortex-loop` skill's `references/*.md` or the CLI verb instead.
**Occurrences:** 4
**Confidence:** high

**Proposed addition:**

```
The deployed scheduled-task prompts on this machine are stale; the live `<scheduled-task>` text is not authoritative. `~/.claude/scheduled-tasks/cortex-*/SKILL.md` — what the Desktop app actually fires — is distinct from this repo's `src/cli/templates.ts` source and from the `.claude/skills/cortex-loop/references/*.md` the current skill reads, and all five payloads are a snapshot from around 2026-07-20 that predates the 2026-08-06 single-`cortex-loop`-skill consolidation. Root cause confirmed in code (2026-09-02 four-agent audit): `writeScheduledTasks` in `src/cli/scaffold.ts` has a preserve-if-exists branch that never refreshes an existing payload — only `--force` rewrites it — so every `cortex sync`/`cortex init` since has silently left them in place. Confirmed drift: `monthly-review` describes an `onboarding-drift` spec-coverage check that `src/loops/onboarding-drift.ts` does not implement (its four checks are `checkClaudeMdVersion`, `checkIndexHeadings`, `checkIndexBudgets`, `checkTemplateIdentical`), declares schema 3.0 (actual: 3.3) and names the wrong report path; `daily` names five retired standalone skills and pre-reorg report paths (`.cortex/pulse/hygiene-report.md` instead of `.cortex/pulse/reports/hygiene.md`) and still claims spec-drift classifies findings per the seven-type taxonomy when the loop is report-only. Practical rule for any session running a bundle: follow the current `references/*.md` or the CLI verb's own behaviour, and do not be alarmed when the two disagree. A second consequence worth knowing: the Desktop wrapper reportedly permits a scheduled session to write only what its own task text names, so the stale `daily` payload — which never mentions `insight/observations/` — may be actively suppressing session-observe's primary output path under stricter enforcement. Fix (not yet applied): regenerate all five payloads from the current `src/cli/templates.ts` and add a payload-hash check to `writeScheduledTasks` so a template change is reflowed instead of preserved forever. Promoted from `insight/observations/scheduled-task-prompt-drift.md`, four sessions.
```

## S-032: A full insight refresh reporting "0 error(s), 0 warning(s)" is not evidence t...
until: 2026-11-13
status: pending decision

**Source:** distil (sessions: 6269c225-4eb2-4338-8e96-1ac622c1313d, 48235c09-94b4-4161-80b4-b9bf15253041, 5bb14cf5-9c83-40e8-b08b-b90d14df7818)
**Target:** .cortex/compass/do-not-repeat.md
**Pattern:** A full insight refresh reporting "0 error(s), 0 warning(s)" is not evidence the insight store is coherent — checkInsightGraph validates only internal consistency and the shrink guard is blind in the same direction, so whole files missing from graph.json or tags.json bless as valid and the gap is self-perpetuating through reverse-index.json.
**Occurrences:** 3
**Confidence:** high

**Proposed addition:**

```
Do not read `cortex loop-insight-refresh --full --report`'s "0 error(s), 0 warning(s)" as a coherence guarantee for the insight store. The L4 layer (`graph.json` / `clusters.json` / `tags.json`) can fall behind L1–L3 (`anatomy/`, `ledger.json`) with no deterministic check noticing: `checkInsightGraph` (`src/schema/checks/insight.ts`, §4.10.6) validates only *internal* consistency — duplicate node ids, dangling edge endpoints, cluster `scope` validity, tags schema — and never compares the graph against `anatomy/`, the ledger, or the source tree, so a graph missing entire files is structurally valid. `reportFull`'s only other guard is a shrink check against a baseline captured from live state at `--collect` time, so a store already missing nodes when collect ran shows no shrink. Both guards are blind in exactly the same direction.

Hit three times on the weekly-quality member 3. 2026-08-20: `graph.json` held 81 `file:` nodes against 83 `src/**/*.ts` files and 83 anatomy entries. 2026-09-06: the repair was partial in one dimension and nothing noticed for 17 days — `tags.json` sat at 81 assignments against 83 file nodes while a full pass blessed the store clean, and the close-out's `64 tag(s)` summary line reports the size of the *vocabulary*, not the assignment count, so the one number a reader would use to spot the gap cannot move when the gap exists. 2026-09-13: `element:` nodes (63% of the graph) were found covered by no probe at all, thin in exactly the same recently-changed files.

The gap is self-perpetuating: `reverse-index.json` is rebuilt from the graph and the refresh loops use it to decide what a changed file invalidates, so a file absent from the graph is also absent from the invalidation trail and never becomes dirty on its own.

Before trusting a full pass, run the four-layer coherence check rather than an mtime or count comparison: `file:` nodes ↔ `anatomy/**/*.md` ↔ `src/**/*.ts` as a three-way bijection; `concept:` nodes ↔ `concepts/*.md` as a bijection; every cluster member resolving to a real node *and* every file-node belonging to some cluster; every tag assignment keyed to a real node and drawn from `vocabulary`. Repair every dimension in the same pass and re-run the whole check afterwards, not only the probe that fired — the probe that fires first is not the probe that stays broken — and repair additively (adding nodes, verified `imports` edges, tags, cluster memberships) rather than regenerating the store. Verify new edges against the actual import statements in source, not against the anatomy entry's prose. Whether `element:` coverage should be complete for files with L3 main players is a spec question for `insight.storage-format` / `insight.refresh-loops`, not a loop's call — no contract requires it today.
```

---

Candidates: 13 received; 13 proposed (12 carried forward with original ids). Dropped: 0 malformed, 0 below-threshold (occurrences < 3), 0 covered by compass, 0 dismissed (unexpired).
Threshold N=3 (`pulse.distilThresholdN`). First runs bound collection to the last 30 days (engineering call). Proposals flow through `cortex pulse-list` / `pulse-accept` — this loop never touches compass.

## S-033: Cost and usefulness questions about existing behaviour are settled with a mea...
until: 2026-11-13
status: pending decision

**Source:** distil (sessions: 70746728-ff13-4543-a618-90ab8d6b8232, f2a2b32d-7342-4527-99e4-a7716db566b6, 9a121da9-c7a7-403c-bb80-1cb82cb1cf6f)
**Target:** .cortex/compass/preferences.md
**Pattern:** Cost and usefulness questions about existing behaviour are settled with a measurement or a controlled A/B experiment, not argument — but measurements of today's usage must not veto a new idea that changes the paradigm those numbers were taken under.
**Occurrences:** 7
**Confidence:** medium

**Proposed addition:**

```
- **Measure before deciding a cost question — but do not let the measurement design the product.** When a question is about how expensive, how useful, or how much better an *existing* behaviour is, produce a number before producing an opinion, and when two candidate designs can be run head-to-head, run them. Pedro opened the skill-listing work with "what is our skill listing token usage?" and closed it with "How many tokens did we start with, how many do we have now?"; he resolved the does-Cortex-actually-help question by ordering a blind A/B (one agent restricted to Cortex, one forbidden from it, compared on understanding and tokens spent), rejected the first round as noise, and asked for four more rounds because "only after having real numbers can we decide"; later he asked for real usage data from the other repos running Cortex "to understand how and if cortex is being used" before running a new experiment. The stated experiment protocol: **fresh agents for every round** (never reuse a primed one), **at most 4 agents at a time**, and at least one round on a deliberately large topic. The limit, stated just as directly when a usage measurement was used to discount a new design: "we're designing a product. You cant allow a bunch of measurements to completely dictate your analysis of new ideas, because some of these new ideas change the paradigm." So: numbers settle how well the current shape works; they are an input to, not a veto on, a proposal that would change the shape — say which of the two you are doing. (Pedro, 2026-08 skill-listing cleanup and cortex-adoption brainstorm; 2026-09 recall/ontology design session.)
```
