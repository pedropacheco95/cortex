---
name: specflow-intent-reconcile
description: 'Pin a verbatim ask with an anchor test. "pin this ask", "did the spec keep it".'
---

# Specflow: Intent Reconcile

## When to use

Pin a specific stakeholder ask with a verbatim RED anchor test, let the normal spec-first flow
absorb it, then check whether the spec's own test would still fail if the specific behaviour
changed. Subsumed → retire the anchor and record it in the intent register; not subsumed → the
spec generalised the ask away, so file a missing-criterion bug and flag the entry. Use when a
user states a specific requirement in passing ("it needs one uppercase", "never log the token",
"must respond under 200ms"), and again after that ask has landed in a spec. A tap on the
existing classify → spec → test flow, never a second test suite.

## The Iron Law

NO ANCHOR RETIRED WITHOUT A SPEC TEST THAT WOULD FAIL WITHOUT IT

Violating the letter of this law is violating the spirit. If you find yourself constructing a
reading under which the spec obviously covers this ask, that construction is the violation.

Hardening mechanisms per `skills/_conventions/hardening.md`.

## The problem this exists for

Specs generalise, and they should — that is how "the password needs one uppercase" becomes
"passwords meet the complexity policy". But generalising loses things silently. The spec gets
written, tests get generated from it, everything is green, and nothing in the suite would fail
if the uppercase requirement quietly disappeared.

Nobody notices, because there was never a test that pinned the specific thing.

## The three moves

### (a0) First: is the ask even spec-shaped?

Before pinning anything, decide what kind of ask this is:

- **Behavioural** — something that must *stay* true. "The password needs one uppercase." "The
  export must never include soft-deleted rows." These get anchored.
- **Operational** — something to *do*, once. "Remove the sentinel git hooks." "Bump the
  dependency." "Delete that stale branch." These do not.

The test: **would you want a test that fails if this stopped being true?** If there is no
"stopped being true" — the action either happened or it did not — the ask is operational.

An operational ask is completed and reported, and that is the whole of it: no anchor, no
register entry, no bug. Forcing one through this skill files a missing-criterion bug against a
spec that should never exist, which is ledger noise wearing the costume of rigour.

Note the failure mode runs both ways: the commonest mistake is treating a behavioural ask as
operational ("just make it do X") and skipping the anchor. When genuinely unsure, treat it as
behavioural — an unnecessary anchor costs one test that you delete at reconciliation, while a
missed one costs the whole mechanism.

### (a) Pin it — write the verbatim anchor, RED

When someone states a specific requirement, before the spec absorbs it:

1. Write a test that checks **exactly what they said**, named in **their words**.
2. Run it. It must fail — and per `specflow-tests`, it must fail **for the right reason**: the
   assertion you wrote, on the value you meant to check. An import error is not RED, and
   an anchor never observed failing pins nothing.
3. Record the entry in `.cortex/archive/intent-register.yaml` with `status: pending`:

```yaml
entries:
  - id: IR-001
    stated_intent: "the password needs one uppercase"   # THEIR words, verbatim
    date: 2026-08-04
    stakeholder: pedro
    anchor_test: tests/atomic/auth/anchor.test.ts::"the password needs one uppercase"
    status: pending
```

**Verbatim means verbatim.** A paraphrase is already the generalisation this skill exists to
catch, performed by the one party who was supposed to be guarding against it.

### (b) Run the normal flow — unchanged

Classify the request through `specflow-entry`, write or update the spec through
`specflow-spec-editor`, generate tests through `specflow-tests`, implement through
`specflow-plan` → `specflow-develop`.

Nothing here changes. Where the intent lands — a spec acceptance criterion or a compass rule —
is the **router's** classification, not a second decision made here. The register's `landing`
field records what the router decided.

### (c) Reconcile — the counterfactual check

One question, and it is not the one that comes naturally:

> **Would the spec-derived test fail if the specific behaviour changed?**

Not "does the spec mention it". Not "do the words overlap". Not "is it implied". Those are
lexical checks and they pass for asks that have been generalised into nothing.

**The operational check — actually do it:**

1. Change the behaviour the ask names (remove the uppercase requirement from the code).
2. Run the spec-derived test for the criterion the ask landed in.
3. Does it fail?

- **It fails → subsumed.** The spec test genuinely requires the specific thing.
- **It passes → not subsumed.** The criterion is satisfied by code that no longer does what the
  user asked for. That is the finding.

Revert your change either way — this is a probe, not an edit.

## Subsumed → retire the anchor

**Delete the anchor test from the suite.** Then record the entry:

```yaml
  - id: IR-001
    stated_intent: "the password needs one uppercase"
    date: 2026-08-04
    stakeholder: pedro
    anchor_test: tests/atomic/auth/anchor.test.ts::"the password needs one uppercase"
    status: reconciled
    landing: auth.password-policy#Password complexity is enforced
    covering_spec_test: tests/spec/auth/password-policy.test.ts
```

The live suite stays spec-derived. The register holds **words and links**, never copies of
tests — the whole point is that there is exactly one suite to maintain, and it is the one
derived from the specs.

## Not subsumed → flag it and file the bug

The spec generalised the ask away. That is a **defect in the spec**, and it goes where defects
go:

1. Route to `specflow-bugs` — Type 1 (missing acceptance criterion) if the spec governs the
   behaviour but no criterion pins this case, or Type 4 (missing dev spec) if nothing governs it
   at all.
2. Record the entry `flagged` with the filed bug:

```yaml
    status: flagged
    landing: auth.password-policy
    flagged_bug: B-014
```

**Do NOT keep the anchor running as a substitute for the missing criterion.** It would go
green, the suite would look complete, and the gap would be hidden behind exactly the kind of
passing test this skill exists to distrust. The anchor's job was to surface the gap; the bug is
what closes it.

## Rationalization table

| Thought/Excuse | Reality |
|---|---|
| "The spec obviously covers this — the criterion is right there." | Then the counterfactual takes thirty seconds and you will have proof. "Obviously covers" is the exact belief that lets a generalised criterion pass for a specific one, and it is held most strongly right after writing the criterion. |
| "The spec test mentions the same words, so it's subsumed." | Words in a test name are not assertions. A test called `enforces the password policy` can assert `result).toBeDefined()`. Change the behaviour and run it — that is the only check that distinguishes the two. |
| "I'll keep the anchor around too — belt and braces." | Then you have two suites, one of which nobody maintains, and the day the spec changes legitimately the anchor fails and gets deleted in irritation. Retire it or file the bug; there is no third state. |
| "Paraphrasing the intent makes the register tidier." | The register exists because paraphrase loses the specific thing. A tidy record of what you *thought* they meant is the failure mode with better formatting. |
| "Filing a bug for a missing criterion is heavy for something this small." | It is one ledger entry, and it is the only mechanism that gets the criterion written. The alternative is a flagged gap nobody acts on, which is why the flagged status requires a bug id that resolves. |
| "The anchor failed on an import error, but it failed, so it's RED." | It is broken, not red. It will go green when you fix the import, regardless of whether the behaviour is right, and then it pins nothing while looking like it pins something. |

## Worked example

> Pedro, mid-conversation: "the export must never include soft-deleted rows."

**(a)** Anchor: `tests/atomic/export/anchor.test.ts::"the export must never include soft-deleted rows"`
— seeds one soft-deleted row, asserts it is absent from the export. Run it: fails on the
assertion (the export currently includes it). RED for the right reason. Register `IR-007`,
`status: pending`.

**(b)** Router classifies it as a change to `export.row-selection`. Spec-editor adds the
criterion *"Deleted rows are excluded"*. `specflow-tests` generates the spec test. Develop
implements.

**(c)** Counterfactual: remove the `deleted_at IS NULL` filter. Run
`tests/spec/export/row-selection.test.ts`. **It passes** — the generated test only asserted the
row *count* matched the fixture, and the fixture had no soft-deleted rows.

**Not subsumed.** File Type 1 against `export.row-selection`: the criterion exists but no test
pins the soft-deleted case. Entry `IR-007` → `flagged`, `flagged_bug: B-021`. Delete the anchor;
the bug carries the work now.

Note what would have happened without the probe: the criterion is in the spec, the suite is
green, and the export starts leaking deleted rows the next time someone touches that query.

## What this skill does NOT do

- **Does not pin operational asks.** One-off actions are done, not anchored (step a0).
- **Does not maintain a parallel suite.** One anchor per intent, alive only between (a) and (c).
- **Does not decide where the intent lands.** That is `specflow-entry`.
- **Does not write or edit specs.** That is `specflow-spec-editor`.
- **Does not fix the gap it finds.** That is the bug flow.
- **Does not judge mechanically.** Core validates the register's shape and links
  (`check.archive-intent-register`); subsumption is this skill's judgment.
