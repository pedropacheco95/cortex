---
id: specflow.a-specific-ask-is-not-generalised-away
status: implemented
implemented_by:
  - ../../specs/specflow/intent-reconcile.spec.md
---

# What someone specifically asked for is still pinned after the spec absorbs it

## Outcome

When this works, the gap between "the password needs one uppercase" and "passwords meet the
complexity policy" stops being invisible.

Specs generalise, and they should — that is how a request becomes a rule rather than a
one-off. But generalising loses things quietly. The spec is written, tests are generated from
it, everything passes, and the specific thing the stakeholder said is now covered by a criterion
that may or may not actually require it. Nobody finds out, because there was never a test that
would fail if it stopped being true.

The outcome is that every specific ask gets pinned by a test before the spec absorbs it, and
someone checks afterwards whether the spec's own test still requires it. If it does, the pin is
removed and the fact recorded. If it does not, that is a finding — the spec is missing a
criterion — and it gets filed like any other defect.

## Who this is for

Developers working from stakeholder requests in spec-managed projects, where the request and the
spec are written by different people (or the same person on different days) and the drift
between them is silent.

## User Journey

1. Someone states a specific requirement in passing — a threshold, a format, a must-never.
2. Before the spec is written, that sentence is pinned by a test that fails today, checking
   exactly what was said, in the words it was said in.
3. The normal spec-first flow runs: the ask lands in a spec criterion or a project rule, tests
   are generated from the spec, code is written.
4. Afterwards, someone asks the one question that matters: does the spec's own test still
   require the specific thing? Not "is it in the spec somewhere" — would it fail if the
   behaviour changed?
5. If yes, the pin is retired and the whole trail is recorded: what was said, where it landed,
   which test covers it now. If no, a missing-criterion bug is filed and the entry is flagged.

## Business Rules

1. The user's words are recorded verbatim. A paraphrase is already the generalisation this
   whole outcome exists to catch.
2. Pinning tests are temporary by design. They are retired once a spec-derived test subsumes
   them — never maintained in parallel, never a second suite.
3. "Covered by the spec" means a test would fail if the behaviour changed. Nothing weaker
   counts.
4. When nothing covers it, that is a defect in the spec and it goes to the bug flow — it is not
   resolved by widening the definition of covered.
5. The record links to where the intent landed; it never copies the tests.

## Success Metrics

- Every specific stakeholder ask can be traced from the words said to the test that now
  enforces it.
- No pinning test remains in the suite after its intent has been reconciled.
- Asks that the spec generalised away surface as filed bugs rather than as surprises months
  later.

## Out of Scope

- Maintaining a parallel suite of user-worded tests. The register holds words, not tests.
- Deciding whether the ask was a good idea — that is the brainstorm's conversation.
- Judging subsumption mechanically. Whether a test covers an intent is a semantic judgment made
  by a skill, not by the deterministic binary.

## Notes

- Fork 2 of the 2026-08 absorption round (`plans_and_handoffs/plans/2026-08-03.md` §0.5). The
  register artefact and its validation are `archive.intent-register`; the judgment is
  `specflow.intent-reconcile`.
- Whether the gap this catches deserves a name of its own — "ask↔spec drift", distinct from
  spec-drift and layer-drift — is deliberately unsettled, pending real examples (plan §5, §6).
