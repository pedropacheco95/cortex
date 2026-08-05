---
id: core-cli.init-profile
status: implemented
depends_on:
  - core-cli.init
  - schema.validator
implements: ../../specs-business/core-cli/developer-sets-up-cortex-in-one-command.business.md
governed_by: []
governs:
  - "src/cli/init.ts"
  - "src/cli/templates.ts"
  - "src/schema/checks/config.ts"
---

# `cortex init --profile` — choosing the process profile

## Intent

Plan §3 item 5.1. Cortex Core is process-agnostic (plan §0.1): the knowledge layer and the
deterministic binary do not know or care how a project builds. But the *loops and skills* a
project wants do depend on that — a project running the workflow-first `superpowers` profile has
no spec tree, so scheduling a spec-drift loop against it produces a daily report about nothing.

This spec adds the one field that records the choice, and the one mechanism that reads it:
`cortex.config.json` gains `profile`, and scheduled-task writing scopes Bucket-3 members out
when the profile is not `specflow`.

The profile is **recorded, not enforced.** Nothing in Core refuses to run because of it. It
selects which loops are scheduled; it does not police what the user does.

## Entities

- **READS:** the `--profile` flag; `.cortex/cortex.config.json` (`profile`) on later runs.
- **WRITES:** `.cortex/cortex.config.json` — the `profile` key.
- **CREATES:** nothing new. Scheduled-task payloads are written as before, scoped.

## Rules

1. **`profile` is an optional config key** with the enum `specflow | superpowers` and the
   default `specflow` (schema §10.1). Optional and defaulted, so every existing project keeps
   validating and keeps behaving exactly as it does today.
2. **`cortex init --profile <name>`** records the choice. With no flag on a **fresh** project
   the profile is `specflow` — the plan's stated default (§0.2). An unrecognised value is a
   usage error, not a silent fallback.
   On an **existing** project, plain `init` refuses and defers to `cortex sync` (Rule 1,
   unchanged); the only re-entry is `--force`, and there the flag's *absence* preserves the
   recorded profile rather than resetting it — a forced repair must not silently flip a
   `superpowers` project back to `specflow` because the flag was omitted.
3. **`check.config` validates the enum** when the key is present, and is silent when it is
   absent. An unknown value is an `error`; a missing key is not a violation.
4. **Bucket-3 scheduling is scoped by profile.** A scheduled-task bundle declares which
   profiles it belongs to, and — for the mixed bundles — which of its *members* are Bucket-3.
   Under a non-`specflow` profile: a bundle whose every member is Bucket-3 is **not written at
   all**; a mixed bundle is written with its Bucket-3 members' skills dropped from
   `requiredSkills` and an explicit scoping instruction naming the members to skip.
5. **The Bucket-3 roster (plan §1):** the spec loops are `bug-triage`, `spec-drift`, and
   `test-runner`, plus the `weekly-quality` bundle's `specflow-lint` and `specflow-verify`
   members — all of which operate on the spec trees. Everything else (pulse-hygiene,
   insight-refresh daily/full, session-observe, pulse-distil, rule-decay, atlas-staleness,
   onboarding-drift) is Bucket-1 and is scheduled under **every** profile, unconditionally.
6. **Scoping never rewrites a member's discipline.** A scoped bundle's surviving members run
   exactly as they do today: same order, same reports, same failure isolation. The only change
   is which members are present.
7. **Profile does not gate skill installation.** `cortex init` installs every packaged bundle
   regardless of profile — a user who switches profiles later should not have to reinstall, and
   an unused skill costs nothing until it is invoked. Only *scheduling* is scoped.

## Acceptance Criteria

### An explicit profile is recorded

- **Given** `cortex init --profile superpowers`
- **When** init completes
- **Then** `.cortex/cortex.config.json` contains `"profile": "superpowers"`

### No flag means specflow on a fresh project

- **Given** `cortex init` on a fresh project with no `--profile` flag
- **When** init completes
- **Then** the recorded profile is `specflow`

### A forced re-init preserves the recorded profile unless the flag says otherwise

- **Given** a project recorded as `superpowers`
- **When** `cortex init --force` runs with no `--profile` flag
- **Then** the recorded profile is still `superpowers`; and when it runs with
  `--profile specflow`, the recorded profile becomes `specflow`

### An unrecognised profile is rejected

- **Given** `cortex init --profile waterfall`
- **When** init runs
- **Then** it exits non-zero naming the valid values, and does not scaffold a project with an
  invalid profile

### The spec loops are not scheduled under superpowers

- **Given** `cortex init --profile superpowers`
- **When** the scheduled-task payloads are written
- **Then** no `test-runner` bundle payload is written, and the `daily` and `weekly-quality`
  payloads neither require nor instruct their Bucket-3 members

### The knowledge loops are scheduled under every profile

- **Given** `cortex init --profile superpowers`
- **Then** the `daily`, `weekly-curation`, `weekly-quality`, and `monthly-review` bundles are
  still written, and their Bucket-1 members (pulse-hygiene, insight-refresh, session-observe,
  pulse-distil, rule-decay, atlas-staleness, onboarding-drift) are all still instructed

### Specflow scheduling is unchanged

- **Given** `cortex init` under the default profile
- **Then** all five bundles are written with every member and every required skill exactly as
  before this spec

### The validator accepts the enum and rejects anything else

- **Given** a config with `"profile": "superpowers"` → no violation; with `"profile": "nope"` →
  a `check.config` error; with no `profile` key → no violation

### An existing project keeps validating

- **Given** a project whose `cortex.config.json` predates this field
- **When** `cortex validate` runs
- **Then** it is conformant — the field is optional and defaulted

## Notes

- **Engineering call recorded per standing authorities (member-level scoping).** The plan
  says "the spec loops are not scheduled", which reads as if loops map one-to-one onto
  bundles. They do not: `daily` mixes pulse-hygiene, insight-refresh, and session-observe
  (Bucket-1) with bug-triage and spec-drift (Bucket-3), and `weekly-quality` mixes
  insight-refresh-full with specflow-lint/verify. Dropping whole bundles would take the
  knowledge loops down with the spec loops, which contradicts plan §1's "Bucket-1 loops are
  unconditional". Scoping is therefore **per member**, and only `test-runner` — Bucket-3 in
  its entirety — disappears as a whole bundle.
- The bundle payloads are prompts executed by an agent, so member scoping is expressed the way
  everything else in them is: an explicit instruction line. `requiredSkills` is filtered in the
  same pass, because Rule 17 refuses to register a bundle whose skills are absent, and under
  `superpowers` the specflow bundles may legitimately never be invoked.
- Profile is deliberately **not** consulted anywhere else in Core. Widening its reach —
  refusing commands, hiding skills, changing validator behaviour — would make Core
  process-aware, which plan §0.1 forbids.
