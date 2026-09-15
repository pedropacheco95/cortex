---
kind: insight-observation
updated: 2026-09-06T01:20:00Z
salient: true
sessions:
  - claude-sessions/pedropacheco1/de9fdb35-c4bf-439e-b00e-b5c5d99febe4
  - claude-sessions/pedropacheco1/8da7a3fc-de1a-4627-a3da-53c03a0c3b0c
  - claude-sessions/pedropacheco1/21e2fe3a-3538-44ab-b913-05072d15d0cd
  - claude-sessions/pedropacheco1/756acbee-b342-4c03-a263-e17c939a01f4
  - claude-sessions/pedropacheco1/f8c94661-47c1-4ea2-bb28-01cb26f70e0e
  - claude-sessions/pedropacheco1/b6fa9d2b-cc7e-472d-a709-12d5dd22d38a
---

A scheduled-bundle session can fail to produce its report(s) for several
distinct reasons, not just one — and nothing in the scheduled-task
infrastructure surfaces any of them as a failure. Confirmed instances, by
root cause:

- **Silent no-act:** 2026-08-28, `cortex-daily` — the `<scheduled-task>`
  prompt was delivered as the session's first message, but the session
  replied only "Ready — what would you like to work on?" and stopped at 2
  messages. Nothing ran.
- **Silent no-act, different bundle:** 2026-09-05, `cortex-weekly-curation`
  — the session said "I'll run the weekly-curation bundle. Let me start by
  orienting" and then stopped at 2 messages with no further action. (That
  day's weekly-curation reports were still produced, ~1 hour later, by a
  separate session — so this specific stall was recovered by a retry, not
  by this session.)
- **Mid-run connection drop:** 2026-09-02, `cortex-test-runner` — "API
  Error: Connection closed mid-response" hit right after the assistant said
  "I'll start by reading the loop's context and running the collect stage,"
  before anything was written. `test-failures.md` is still stamped
  2026-08-30, i.e. this run never landed.
- **Mid-run OAuth expiry:** 2026-08-30, `cortex-daily` — "Failed to
  authenticate. API Error: 401 OAuth access token has expired," hit while
  extracting session-observe's target sessions (after members 1-4 had
  already completed and written their reports that cycle).
- **Mid-run OAuth revocation, same day:** 2026-08-30, a separate
  session running an ad hoc bug-triage classification prompt (not a
  `<scheduled-task>` wrapper) — "Failed to authenticate. API Error: 401
  OAuth access token has been revoked," hit at the exact moment classification
  output was due. Two different OAuth failure strings on the same calendar
  day, across two unrelated sessions, suggests an account/token-level event
  that day rather than a single reproducible code bug.

An independent four-agent audit on 2026-09-02 (`b6fa9d2b`) cross-checked
scheduled-session start times against the task registry and found the same
class of gap from the outside: no daily transcript exists for 2026-08-27 or
2026-09-02, while the registry's `lastRunAt` claims a 2026-09-02 fire and
every daily report's `generated:` stamp reads 2026-09-01 — i.e. this is not
rare, it recurs across multiple weeks and at least three of the five
bundles (`daily`, `weekly-curation`, `test-runner`).

**The common thread:** whatever kills the session — no error at all, a
dropped connection, or an expired/revoked token — the result looks
identical from the outside: some or all of that cycle's pulse reports are
simply not written, and nothing currently distinguishes "the bundle had
nothing to report" from "the bundle didn't run." The only detection
available today is comparing each `.cortex/pulse/reports/*.md` mtime
against the expected cadence for its bundle.

**Proposed fix (not yet built, per the 2026-09-02 audit):** give each bundle
run a durable, file-based done-condition — a `.cortex/pulse/reports/<bundle>-digest.md`
stamped with `started:`/`finished:` timestamps and one line per member
(ran / failed: `<error>` / skipped-timeout) — plus a deterministic hygiene
check flagging a bundle's digest as stale once it's older than ~1.5x its
expected cadence. This would catch every instance above, regardless of
which of the three root causes killed the session.
