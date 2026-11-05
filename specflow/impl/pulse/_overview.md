# Pulse — Overview

## What this is

The self-maintenance process: two loops, Hygiene (fast, mostly deterministic, daily) and Distil (slower, LLM-heavy, weekly). Propose-don't-mutate — pulse writes ONLY to `.cortex/pulse/`.

## What it covers

**Specs written:**

- `pulse.review-cli` — the human gate: `pulse-list` / `pulse-accept` / `pulse-reject`, verbatim application to compass-only targets, dismissal memory with the configurable window.

- `pulse.hygiene` — the daily deterministic sweep: orphan branches, PR staleness (gh-optional), anatomy drift, compass dead refs, spec orphans, aged TODOs → `pulse/reports/hygiene.md` (always-write); drop-off detection deferred to the agentic layer.

- `pulse.distil` — weekly said-things miner: deterministic collect/propose bookends around an agentic pattern judgment; threshold + covered + dismissed filters; single-S-namespace proposals with session provenance.

- `pulse.usage` — read-side adoption report: counts `cortex insight` invocations by verb (from Bash command fields only), `.cortex/` reads bucketed by module with loop machinery separated from orientation, and questions asked without a prior consult → `pulse/reports/usage.md`. No instrumentation, no runtime cost. Implements a scaffolding outcome, not a pulse one — it measures whether Cortex is reached for.

- `pulse.threads` — the threads ledger (recall work, step 1): `pulse/threads/T-NNN-<slug>.md`, one file per unresolved question, offer, approval, finding, or scratchpad artefact, with its own `state/thread-counter` namespace (never `S-NNN`), deterministic dedupe and answered detection driven by `hooks.session-end`, expiry in place via hygiene Rule 8, and the human verbs `cortex thread list|drop|close|promote`. Like `pulse.usage`, it implements the scaffolding outcome — it exists so a later session has something to reach for. Nothing is injected in this step.

_Planned (not yet written):_

- Hygiene: orphan branches, stale PRs, drop-offs, anatomy drift, compass dead refs, spec orphans, and aged TODOs → `pulse/reports/hygiene.md`
- Distil: extracting recurring patterns from session transcripts → `pulse/suggestions.md`
- The propose-don't-mutate guarantee (writes confined to `.cortex/pulse/`)

## Why it's grouped this way

Pulse owns the two original self-maintenance loops. The wider family of loops and the shared loop substrate live in `loops/` (scheduled as five task bundles per schema §9.1). Pulse's defining constraint is that it proposes rather than mutates: it only ever writes to `.cortex/pulse/`, leaving acceptance to the human-reviewed pulse CLI.

These two loops predate and seed the broader loop family, which is why they keep their own domain rather than folding into `loops/`.

## Related groups

- Business outcomes for this domain: `../../specs-business/pulse/`
- The wider loop family and shared substrate: `../loops/`
- Pulse review CLI (accept/reject): `../core-cli/`
- Reads from anatomy, compass, and specs: `../anatomy/`, `../compass/`
