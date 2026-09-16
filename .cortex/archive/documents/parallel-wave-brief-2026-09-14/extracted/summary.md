# Parallel-wave improvement brief — summary

Source: `../source.md` (verbatim; gitignored). Kind `brief` (`../../../types/brief.yaml`).
Author: the coordinator of six parallel Claude Code sessions on an external production
project (Flask + React + Expo monorepo, ~850 tracked Cortex files, schema **3.3**, modules
compass / atlas / archive / insight / pulse). Written 2026-09-14 after one continuous 16-hour
session (2026-09-13/14) that shipped an eight-PR release, filed 17 tickets and wrote 7 compass
rules. Shared with Pedro 2026-09-16; ingested the same day against Cortex schema **3.4** at
commit `6014b09`.

## The brief's thesis

Cortex's bottleneck in a long-lived multi-session workload is **retrieval, integrity and
freshness**, not coverage. The headline failure: six sessions spent hours treating two
scheduled QA jobs as a black box while `compass/environment.md` already named the ten tasks,
the registry path and the editing procedure. "The content was there. Retrieval failed."
Every ask is aimed at getting existing knowledge to the moment of need, checking the graph
the design promises, or stamping inferred knowledge with "as of when".

## Headline table — each item against Cortex at 3.4 (2026-09-16)

| § | Item | Status | Where it stands today |
|---|---|---|---|
| 0 / 1.1 | Non-implementer (coordinator, reviewer, planner) read protocol | **new** | CLAUDE.md protocol addresses "before working a task"; no role-aware wording anywhere. |
| 1.2 | Surface `environment.md` at session start / first tool use | **new** | Reachable only via `compass/_index.md`; 2026-09-16 retired the session-start coverage map, so nothing is loaded at start. |
| 1.3 | Instrument whether `insight/` is used | **already-addressed** | `pulse.usage` counts `cortex insight` invocations; `atlas/evidence/2026-09-15-usage.md` and `2026-09-16-usage.md` record the numbers; the 2026-08-05 decision reversed pull-only insight on that basis. |
| 2.1 | Duplicate rule id within a module not caught | **verified-defect** | `checkXrefUnique` (`src/schema/checks/xref.ts`) scans only the two spec globs; two `compass/rules/R-026-*.md` files sharing `id: R-026` pass `cortex validate` (orchestrator, 2026-09-16). Violates schema §6 global rule 1. Filed as B-019 the same day. |
| 2.1 | Rule number must agree across filename / `id:` / H1 | **partially-addressed** | `check.rule` errors when `id` disagrees with the filename prefix; the H1 heading is not compared (orchestrator, 2026-09-16). |
| 2.1 | Index completeness (entries vs rules) as a warning | **new** | `check.index-shape` checks the prompt shape, not coverage. |
| 2.1 | Validate that the citation graph resolves | **does not hold at 3.4** | A dangling `source:` IS an error (§6 rule 4, `check.xref`; orchestrator, 2026-09-16). Likely true at the author's 3.3 or a symptom of their 16 other errors — see `contradictions.md`. |
| 2.2 | Id scheme for parallel authorship (slug identity or append-only registry) | **new** | Rules and bugs stay sequential; only `S-`/`T-` ids have a counter file. |
| 3.1 | Commit stamp on inferred knowledge | **partially-addressed** | Per-file insight entries already carry `built_at_commit` and `source_sha256` (§4.10.2); `cortex insight file` output does not print them (verified 2026-09-16). The ask is surfacing, not storing. |
| 3.1 | Commit stamp on bug-ledger entries | **new** | §4.2 has `opened`/`resolved` datetimes, no commit. |
| 3.2 | A "currently true" surface (known-broken, owner, fix in flight) | **partially-addressed** | Open threads (`pulse.threads`) plus `hooks.prompt-route` / `hooks.search-annotate` pointers cover "still open"; bug `status:` covers "known-broken"; nothing carries owner or in-flight fix. |
| 4.1 | Capture ritual for recurring traps | **partially-addressed** | `hooks.session-end` captures findings, approvals, questions deterministically; `<cortex:finding>` tag; `cortex thread promote --to compass/bugs`. No end-of-task "did you lose time?" prompt; our own `do-not-repeat.md` also has one free-text entry and no rule. |
| 4.2 | Lightweight decision capture, promotable later | **partially-addressed** | Approval threads + `cortex thread promote --to atlas/decisions` draft a decision from one paragraph; `decision-candidate` via session-observe. No explicit one-line "what / why / rejected" form. |
| 5 | Placement guidance generated at adoption | **new** | `cortex init` writes the CLAUDE.md Cortex section; it does not state where prose vs knowledge lives relative to the ignore rules. |
| 6 | Module `visibility:` declaration / operational-specifics warning | **new** | RULES.md rule 12 (pointers, never secrets) is adjacent but does not cover aggregate reconnaissance in a public repo. |
| 7 | Keep: rules/ as durable home, rule format, citation frontmatter, compass/atlas/insight split | no action | Confirms the design; recorded in `evidence.md`. |

## Files in this extraction

- `claims.md` — the brief's factual claims, numbered, with the section they come from.
- `asks.md` — every suggestion, in the author's priority order, with our status and the
  route (pulse proposal / spec change / no action).
- `evidence.md` — the cost figures and incidents the author attaches to each claim, plus what
  the author says worked.
- `contradictions.md` — where the brief's description of Cortex disagrees with schema 3.4 or
  with the recall work shipped 2026-09-15/16.
