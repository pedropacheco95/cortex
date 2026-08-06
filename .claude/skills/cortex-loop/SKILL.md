---
name: cortex-loop
description: 'Run a named Cortex maintenance loop.'
---

# cortex-loop

## When to use

**This skill is callable-only** — it carries no trigger surface in the skill listing and is not
routed into automatically. It is reached two ways, both of which name it explicitly:

- the five scheduled-task payloads Cortex writes itself (`src/cli/templates.ts`
  `SCHEDULED_TASKS`), each of which names this skill and the reference file for the member it
  is running;
- a developer invoking `/cortex-loop` and naming the loop.

A loop is also runnable without this skill at all: every one has a deterministic CLI verb
(`cortex loop-spec-drift`, `cortex pulse-hygiene`, …) that needs no routing. Reach for the CLI
when you want the loop's mechanical half and no judgment.

## Dispatch

Read **one** reference file — the loop you were asked to run — and follow it exactly. Do not
read the others; they are unrelated work and cost context you will not use. If the caller named
a loop not in this table, say so and stop rather than guessing the nearest match.

| Loop | Reference | CLI verb | Writes |
|---|---|---|---|
| `hygiene` | `references/hygiene.md` | `cortex pulse-hygiene` | `.cortex/pulse/reports/hygiene.md` |
| `bug-triage` | `references/bug-triage.md` | `cortex loop-bug-triage` | `.cortex/pulse/reports/bug-triage.md` |
| `spec-drift` | `references/spec-drift.md` | `cortex loop-spec-drift` | `.cortex/pulse/reports/spec-drift.md` |
| `rule-decay` | `references/rule-decay.md` | `cortex loop-rule-decay` | `.cortex/pulse/reports/rule-candidates.md` |
| `onboarding-drift` | `references/onboarding-drift.md` | `cortex loop-onboarding-drift` | `.cortex/pulse/reports/scaffolding-review.md` |
| `atlas-staleness` | `references/atlas-staleness.md` | `cortex loop-atlas-staleness` | `.cortex/pulse/reports/atlas-review.md` |
| `distil` | `references/distil.md` | `cortex pulse-distil` | `.cortex/pulse/suggestions.md` |
| `session-observe` | `references/session-observe.md` | `cortex loop-session-observe` | `.cortex/insight/observations/` + `.cortex/pulse/reports/session-observe.md` |
| `test-runner` | `references/test-runner.md` | `cortex loop-test-runner` | `.cortex/pulse/reports/test-failures.md` |
| `insight-refresh-daily` | `references/insight-refresh-daily.md` | `cortex loop-insight-refresh --daily` | `.cortex/insight/` + `.cortex/pulse/reports/insight-refresh.md` |
| `insight-refresh-full` | `references/insight-refresh-full.md` | `cortex loop-insight-refresh --full` | `.cortex/insight/` + `.cortex/pulse/reports/insight-refresh.md` |

## Discipline

These hold for every loop. The reference file adds that loop's specifics; it never relaxes
anything here.

1. **Never spawn a nested `claude` subprocess.** You are already running inside a Claude
   session. A loop that shells out to `claude` deadlocks in a scheduled run and burns the
   budget in an interactive one. Run the CLI verb, read the output, do the judgment in this
   session.

2. **Propose, don't mutate (RULES 7).** A loop never writes gated content — `.cortex/compass/`,
   `.cortex/atlas/`, `RULES.md`, and both spec trees change only through the pulse gate or
   direct human review. Loops write to `.cortex/pulse/` and, where the loop owns it, to
   machine-owned ungated state under `.cortex/insight/`. The reference file states which
   applies; the two narrow, reported exceptions (`test-runner`'s writer/verifier split,
   `bug-triage`'s fill-only ledger writes) are stated in their own reference files and nowhere
   else.

3. **A failed loop reports; it does not abort its bundle.** When run as a scheduled-bundle
   member, record the failure and continue to the next member. Never let one member's failure
   take the others down.

4. **The report is the deliverable.** Each loop writes its own output at the path in the table
   above, exactly as it did as a standalone skill. Summarise it for the user afterwards; the
   file, not the summary, is authoritative.

5. **Deterministic half in Core, judgment half here.** The CLI does the file I/O, parsing, and
   schema work; you do the classification and triage it cannot. Never re-derive in prose what
   the CLI already computed, and never overwrite a human's recorded judgment.
