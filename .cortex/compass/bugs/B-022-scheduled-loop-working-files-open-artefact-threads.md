---
id: B-022
title: Every nightly scheduled loop opens artefact threads for its own scratchpad working files, which now make up most of the open thread ledger
type: wrong-rule
severity: medium
status: open
affects:
  - pulse.threads
  - hooks.session-end
  - src/pulse/threads.ts
proposed_fix: >-
  Correct pulse.threads Rule 3 (and hooks.session-end Rule 9) so a scheduled session opens
  no artefact threads: a loop's scratchpad files are intermediate data whose results already
  land in pulse/reports or pulse proposals. The record keeps the artefacts and copies.
opened: 2026-09-24T09:21:02Z
found_at_commit: a66041b
---

# B-022 — Scheduled loops open artefact threads for their own working files

**Source:** human report (2026-09-23 Jev investigation), confirmed from the session records.

**What happens:** 9 of the 11 threads in `.cortex/pulse/threads/` (T-003 to T-011, all
`kind: artefact`, all `open`) come from **scheduled** sessions. They are the nightly loops'
own scratchpad working files: `bug-triage-results.json`, `session-observe-proposals.json`,
`session-observe-proposals-2.json`, `repair.mjs` and `imports.mjs`. None has a heading, so the
thread titles are bare `/private/tmp/…/scratchpad/…` paths. Each nightly bundle adds about
two more, and the dedupe key is the original path, which contains the session id. So the
same file from the next night's run is never deduplicated. At the 30-day TTL the ledger
settles at roughly 60 open threads of this kind.

**What should happen:** a thread is "a thing a session left unresolved … that would
otherwise be re-derived" (pulse.threads intent). A loop's intermediate JSON has already been
consumed by that loop: its results are written to `pulse/reports/` or `pulse/proposals/`. It
is not unresolved and nobody will re-derive it. Such threads crowd out real ones in `Open:`
pointers, in `cortex thread list`, and in hygiene counts.

**Evidence (Phase 1):**

| Record | Kind | Artefacts | Threads opened |
|---|---|---|---|
| `2eae6760…` | scheduled | bug-triage-results.json, session-observe-proposals.json, session-observe-proposals-2.json | T-003, T-004, T-005 |
| `ab59eba9…` | scheduled | repair.mjs, imports.mjs | T-006, T-007 |
| `38b5dd4a…` | scheduled | bug-triage-results.json, session-observe-proposals.json | T-008, T-009 |
| `1f9160c5…` | scheduled (2026-09-24) | bug-triage-results.json, session-observe-proposals.json | T-010, T-011 |

- The only interactive artefact in the records (`threads-and-backlinks.html`, session
  `9a121da9…`) was `copied: false` and opened nothing, so no interactive artefact thread
  exists yet.
- The code does what the spec says. pulse.threads Rule 3 says: "**Scheduled sessions** …
  open `finding` and `artefact` threads only". The criterion "A scheduled record opens
  finding and artefact threads only" asserts it. This is not a code or test defect.

**Root cause:** pulse.threads Rule 3 was written on the assumption that a scheduled
session's scratchpad holds deliverables. In practice the loop skills use the scratchpad for
intermediate data and deliver through reports and proposals. The rule itself is wrong, so
this is Type 3 and needs the developer's judgment on the chosen option.

**Affected specs:**
- Dev: .specflow/specs/pulse/threads.spec.md (Rule 3, and the criterion "A scheduled record
  opens finding and artefact threads only"); .specflow/specs/hooks/session-end.spec.md
  (Rule 9's restatement, and the criterion "A scheduled session opens finding and artefact
  threads only")
- Business: .specflow/specs-business/scaffolding/assistant-reaches-for-cortex-instead-of-guessing.business.md.
  The follow-rate metric is harmed because noise threads are what the `Open:` lines point at.
  The business promise itself does not need to change.

### Change Plan

**Spec to modify:** .specflow/specs/pulse/threads.spec.md, then hooks.session-end Rule 9
**Change type:** Correct existing rule + update criteria (Type 3, needs human approval)

**Options (developer chooses):**
- **(a) Recommended:** scheduled sessions open `finding` threads only. Artefacts stay in the
  record and are still copied to `pulse/scratch/<session-id>/`, so nothing is lost; they
  just open no thread.
- (b) Scheduled artefact threads are keyed by basename plus the loop name instead of the
  full path. This caps the ledger at one thread per loop file but keeps threads nobody acts on.
- (c) Artefact threads of any session kind require a `first_heading`. Headless JSON and
  scripts then open nothing. This also changes interactive behaviour.

**Criteria to update (under a):** "A scheduled record opens finding and artefact threads
only" becomes "A scheduled record opens finding threads only". The same change applies to
the session-end criterion.

**Then:**
1. Update both specs' rules and criteria. Check whether the pulse.threads intent paragraph
   needs its "scratchpad artefact" line narrowed to interactive sessions.
2. Update the atomic and spec tests in tests/*/pulse and tests/*/hooks/session-end.
3. Fix src/pulse/threads.ts (`openThreadsFromRecord`).
4. Operational cleanup, needing the developer's say-so: drop T-003 to T-011.

### Resolution

