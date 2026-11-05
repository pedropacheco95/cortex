# Discipline — Overview

## What this is

The shared discipline primitives: skills and authoring conventions that both process profiles
invoke, independent of whether the project builds spec-first or workflow-first. Bucket 2 of the
three-bucket architecture (`plans_and_handoffs/plans/2026-08-03.md` §1) — Bucket 1 is Cortex
Core, Bucket 3 is the process profile.

## What it covers

**Specs written:**

- `discipline.verification-skill` — the `verification-before-completion` skill: an evidence
  gate an agent runs before any completion claim, with the claim→evidence table and the
  rationalization table that keeps it from being talked out of.
- `discipline.hardening-convention` — the Iron Law + rationalization-table + HARD-GATE
  authoring recipe at `skills/_conventions/hardening.md`, the canonical template every
  hardened skill in this repo is grafted from.

_Planned (not yet written):_

- The root-cause-before-fix primitive, currently expressed inside `specflow-bugs`.
- The red-green / watch-it-fail-correctly primitive, currently inside `specflow-tests`.
- The code-review pair, currently `specflow-request-review` / `specflow-receive-review`.

## Why it's grouped this way

These behaviours are process-agnostic. They cannot live under `specflow/` — that domain is one
process profile, and a project on the other profile still needs them. They cannot live under
`core-cli/` either: Core makes no LLM calls (RULES 3) and these are agent disciplines carried
by skill prompts. A third home is the honest one.

The dividing line: if removing the spec tree would make the behaviour meaningless, it belongs
in `specflow/`; if it would still be needed, it belongs here.

## Related groups

- Business outcomes for this domain: `../../specs-business/discipline/`
- The spec-first profile that invokes these primitives: `../specflow/`
- Packaging and install of the skill bundles: `../core-cli/`
