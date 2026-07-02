# Pulse — Overview

## What this is

The self-maintenance process: two loops, Hygiene (fast, mostly deterministic, daily) and Distil (slower, LLM-heavy, weekly). Propose-don't-mutate — pulse writes ONLY to `.cortex/pulse/`.

## What it covers

**Specs written:**

- `pulse.review-cli` — the human gate: `pulse-list` / `pulse-accept` / `pulse-reject`, verbatim application to cerebrum-only targets, dismissal memory with the configurable window.

- `pulse.hygiene` — the daily deterministic sweep: orphan branches, PR staleness (gh-optional), anatomy drift, cerebrum dead refs, spec orphans, aged TODOs → `pulse/hygiene-report.md` (always-write); drop-off detection deferred to the agentic layer.

_Planned (not yet written):_

- Hygiene: orphan branches, stale PRs, drop-offs, anatomy drift, cerebrum dead refs, spec orphans, and aged TODOs → `pulse/hygiene-report.md`
- Distil: extracting recurring patterns from session transcripts → `pulse/suggestions.md`
- The propose-don't-mutate guarantee (writes confined to `.cortex/pulse/`)

## Why it's grouped this way

Pulse owns the two original self-maintenance loops. The wider family of thirteen loops and the shared loop substrate live in `loops/`. Pulse's defining constraint is that it proposes rather than mutates: it only ever writes to `.cortex/pulse/`, leaving acceptance to the human-reviewed pulse CLI.

These two loops predate and seed the broader loop family, which is why they keep their own domain rather than folding into `loops/`.

## Related groups

- Business outcomes for this domain: `../../specs-business/pulse/`
- The wider loop family and shared substrate: `../loops/`
- Pulse review CLI (accept/reject): `../core-cli/`
- Reads from anatomy, cerebrum, and specs: `../anatomy/`, `../cerebrum/`
