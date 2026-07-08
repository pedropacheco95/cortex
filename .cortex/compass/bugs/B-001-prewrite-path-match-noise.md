---
id: B-001
title: PreWrite warns on path match even when the rule's content predicate does not fire
type: wrong-rule
severity: medium
status: resolved
affects:
  - hooks.pre-write
  - src/hooks/pre-write.ts
proposed_fix: Amend hooks.pre-write Rule 4 so a rule with an evaluable check predicate (regex/grep) warns only when the predicate fires; path-match-only warning remains for rules without an evaluable predicate (none/ast). Then align src/hooks/pre-write.ts and add an AC pinning "predicate present but not firing → silence".
opened: 2026-07-02T00:00:00Z
resolved: 2026-07-02T23:00:00Z
---

# B-001 — PreWrite warns on path match even when the predicate does not fire

## Evidence

Live smoke on the real repo, first session with seeded rules: a clean write (`const a = 1`) to `src/schema/x.ts` produced the R-001 warning despite containing no LLM SDK import. R-001 has `check: {kind: regex, expect: absent}` which did not match — the warning came from the `governs` path match alone.

## Diagnosis (seven-type classification)

`hooks.pre-write` Rule 4 states path-match OR predicate-match as sufficient. As written, any rule with broad `governs` warns on **every** write to governed paths — contradicting design §6.3 ("average overhead near zero", warnings only when a rule actually applies) and the business spec's Business Rule 3 ("silence is the normal case"). The spec's rule is wrong as written → **type: wrong-rule**.

## Intended semantics

- Rule has an evaluable predicate (`regex`/`grep`): warn **only** when the predicate fires.
- Rule has no evaluable predicate (`check` absent or `kind: none`/`ast`): warn on path match — the hook can't verify content mechanically, so surfacing the rule is the correct conservative behaviour.

## Resolution (2026-07-02)

Fixed as proposed, in the constellation-compiler round (no git history yet — change summary stands in for the resolving commit):

- `specs/hooks/pre-write.spec.md` Rule 4 revised to two-stage semantics; two ACs added ("Predicate passes on a governed path → silent (B-001 regression)", "Predicateless rule still warns on path match").
- `src/hooks/pre-write.ts` aligned; suite green (233 tests).
- `cortex-schema.md` §4.2 gained the PreWrite consumption note so future rule authors can infer the split from the schema.

Verified live on this repo: clean write to `src/schema/` is silent; an `@anthropic-ai/sdk` import still warns. Entry retained as ledger history — the system caught itself.
