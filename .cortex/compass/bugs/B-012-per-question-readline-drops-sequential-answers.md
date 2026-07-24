---
id: B-012
title: creating and closing a fresh readline.Interface per y/N prompt can drop or misattribute a buffered answer across rapid sequential prompts
type: missing-criterion
severity: high
status: resolved
affects:
  - core-cli.sync
  - core-cli.init
  - src/cli/scaffold.ts (promptYesNo, installSkills, createPromptInterface)
  - src/cli/sync.ts (syncSkillBundles, syncScheduledTaskPayloads, sync)
proposed_fix: Give promptYesNo an optional shared rl parameter; create ONE readline.Interface per command invocation (installSkills, sync) and pass it through every promptYesNo call in that run, closing it once at the end, instead of one create/close cycle per question; add a defensive post-loop invariant in syncScheduledTaskPayloads that re-checks every written/refreshed payload's marker hash against its content and rewrites it if mismatched.
resolved: 2026-07-22T18:24:02Z
opened: 2026-07-22T18:24:02Z
---

# B-012 — Per-question `readline.Interface` create/close cycles dropped a buffered marker-write answer under rapid sequential prompts

## Evidence

Found live-testing `cortex sync` against a real project (`berd`) during this
round. In one real run, `syncScheduledTaskPayloads` prompted the user twice in a
row for two differing scheduled-task payloads (one per differing skill bundle
first, via `syncSkillBundles`, then one per differing task payload). Both
answers were "y". Afterward, one of the two payloads had its refreshed content
on disk AND a matching `.cortex-installed.json` marker; its sibling — refreshed
in the exact same run, immediately after — had the refreshed content but no
marker update, leaving it looking like unknown-provenance on the next `sync` run.

Root cause: `promptYesNo` (`src/cli/scaffold.ts`) created a brand-new
`readline.Interface` on `process.stdin`/`process.stdout`, awaited one answer,
then closed it — once per question. `installSkills` and (before this fix)
`syncSkillBundles`/`syncScheduledTaskPayloads` each called `promptYesNo` inside a
loop, one call per differing item, meaning a command asking several questions in
one run (skill bundles, then task payloads) created and closed several
independent interfaces back-to-back on the same underlying stdin. Rapid
sequential create-question-close cycles on the same stdin stream is a known
Node.js `readline` footgun: input already buffered by the OS/terminal for a
question can be delivered to (or attributed to) the *next* interface instead of
the one that asked, so an answer can appear to go missing on one prompt while
adjacent prompts behave normally — exactly the "one payload got its marker, the
sibling refreshed right after did not" symptom observed.

## Diagnosis (seven-type classification)

1. **Dev spec governing this behaviour?** YES — `core-cli.sync`
   (`.specflow/specs/core-cli/sync.spec.md`) Rules 5 and 8 own the
   `.cortex-installed.json` marker judgment call for skill bundles and task
   payloads respectively; `core-cli.init`'s skill-install loop shares the same
   prompt mechanism (`installSkills`) via `src/cli/scaffold.ts`.
2. **Does the spec have a rule covering this case?** YES — Rules 5 and 8 state
   the marker mechanism correctly ("an unmodified payload is refreshed silently
   … a user-modified one is left in place and reported") and the shipped
   acceptance criteria ("Unmodified skill bundle is upgraded silently", "User-
   modified skill bundle is preserved and reported") confirm the single-item case
   works.
3. **Is the rule itself correct?** YES — nothing about the marker mechanism
   itself is wrong; a single prompt, single item, always worked correctly, which
   is exactly why every existing AC (each written as a single differing
   bundle/payload) passed.
4. **Does the rule have an acceptance criterion covering this case?** NO — every
   AC in `core-cli.sync` exercises exactly one differing skill bundle or one
   differing task payload per scenario. None asserts the property that actually
   broke: that when a run prompts for *several* differing items in sequence (the
   common real-world case — differing skill bundles, then differing task
   payloads, in the same `cortex sync` invocation), every one of them ends the
   run with its content and marker in sync. That criterion was never stated, so
   the per-question-interface implementation was free to (and did) drop an
   answer's downstream effect on one item while its neighbours worked — the same
   shape of gap as B-002 and B-010: a mechanism is correct for the case its ACs
   actually test, but a concrete multi-item variant was never criterion-ed.

First NO at step 4 → **type: missing-criterion**. Not wrong-rule or
incomplete-rule: Rules 5/8's marker judgment call is correct as stated; the gap
is that no AC ever exercised more than one prompted item in a single run.

Severity **high**: this silently desynchronizes on-disk content from its marker
for scheduled-task payloads (and, by the same mechanism, skill bundles) on any
real project where more than one item needs a decision in the same `sync`
run — the common case for a project that has drifted on several fronts at once
— with no error surfaced; the affected item then misreports as
"unknown provenance" and re-prompts unnecessarily on the next run.

**Does this affect skill-bundle installs the same way?** YES, at both call
sites, not just the task-payload one: `installSkills` (`core-cli.init`'s skill
loop) and `syncSkillBundles` (`core-cli.sync`'s Rule 5) each looped over
multiple bundles calling `promptYesNo` per bundle, exactly the same
per-question-interface shape that broke task payloads. Skill-bundle installs
were at equal risk of a dropped answer across two or more overwrite prompts in
the same `cortex init`/`cortex sync` run — the marker-desync just happened to
surface first in the task-payload case because that's what the live `berd` run
exercised with two differing items back to back. The fix is a single shared-
interface mechanism (`createPromptInterface()` in `scaffold.ts`) applied at
**both** call sites: `installSkills` creates one `rl` up front (when not
`--yes`) and passes it to every `promptYesNo` call in its bundle loop, closing
it once at the end; `sync()` creates one `rl` up front and threads it through
**both** `syncSkillBundles` and `syncScheduledTaskPayloads` in the same run (so
a run that prompts for both differing skill bundles and differing task payloads
shares one interface across the whole command, not one per sub-loop), closing
it once in a `finally`.

## Intended semantics

A command that may ask more than one y/N question in a single invocation must
create exactly one `readline.Interface` for that invocation and reuse it for
every question, closing it once at the end — never one create/close cycle per
question. Additionally, every payload/bundle a run actually writes or refreshes
must end that run with its on-disk content and marker hash in agreement,
regardless of how many other items were prompted in the same run.

## Resolution (2026-07-22)

**Spec:** `.specflow/specs/core-cli/sync.spec.md` — no Rule text change needed;
Rules 5 and 8's marker judgment call was already correct. (Flagging for the
owner: the AC family for both rules would benefit from a "two or more differing
items in one run" acceptance criterion alongside the existing single-item ones,
mirroring B-010's precedent of adding the round-trip guarantee that was always
implicit — this was not added in this pass since spec edits require separate
user approval per RULES 19, and is left as a follow-up rather than silently
patched here.)

**Code (`src/cli/scaffold.ts`):**
- Added `createPromptInterface()`: returns a `readline.Interface` on
  `process.stdin`/`process.stdout` when both are a TTY, `undefined` otherwise
  (mirroring `promptYesNo`'s existing non-interactive-safe default).
- `promptYesNo(promptText, rl?)`: when a shared `rl` is passed, asks the
  question on it directly (no create/close); omitted, falls back to the
  original single-shot create-question-close-in-`finally` shape for genuine
  single-question callers.
- `installSkills()`: creates one shared `rl` up front (`yes ? undefined :
  createPromptInterface()`), passes it to every `promptYesNo` call in its
  bundle loop, closes it once in a `finally`.

**Code (`src/cli/sync.ts`):**
- `syncSkillBundles()` and `syncScheduledTaskPayloads()` both gained an
  optional `rl` parameter, threaded through to their `promptYesNo` calls.
- `sync()`: creates one shared `rl` up front (same `yes` gate), passes it to
  **both** `syncSkillBundles` and `syncScheduledTaskPayloads` in the same run,
  closes it once in a `finally` that wraps both calls plus the hooks/git-hook
  steps between them.
- `syncScheduledTaskPayloads()`: added a defensive post-loop invariant — after
  the main loop, every `canonical` name in `result.written` or `result.refreshed`
  has its on-disk `SKILL.md` hash recomputed and compared against its marker;
  a mismatch is corrected by rewriting the marker. This is a structural
  guarantee against the observed symptom regardless of root cause, on top of
  (not instead of) the shared-interface fix — each branch already writes
  content and marker together in the same synchronous block, so this is
  normally a no-op, but it closes the gap even if some other future code path
  reintroduces a similar desync.

**Tests:** `pnpm vitest run tests/atomic/core-cli tests/spec/core-cli` — 8 files,
191 passed, including the existing Rule 5/Rule 8 single-item marker ACs
(unaffected by the refactor) and the sync CLI-dispatch tests exercising the full
multi-item prompt path end-to-end via `withHomeEnv` (see B-011).
