---
id: specflow.developer-gets-spec-work-grounded-in-project-memory
status: implemented
implemented_by:
  - ../../specs/specflow/cortex-awareness.spec.md
---

# Spec work draws on everything the project already knows

## Outcome

When this works, the specification workflows stop starting from a blank page. Planning an implementation consults the code map, the house rules, and the recorded decisions before proposing anything; generated tests enforce the project's own conventions automatically; a request gets routed by what it actually touches; onboarding builds on the scan instead of re-reading everything; and filed problems land in the shared ledger, classified, where the daily triage finds them. The eleven spec workflows and the knowledge layer stop being two systems that happen to share a folder.

## Who this is for

Developers using the spec-driven workflows on a Cortex-managed project — every one of those workflows now works with the project's accumulated memory behind it.

## User Journey

1. The developer asks for an implementation; the workflow checks what the map, the rules, and the decisions already say before writing a line.
2. Generated tests arrive already enforcing the conventions the project recorded — nobody re-states them.
3. A vague request gets routed correctly because the router checks which part of the project's knowledge it touches.
4. A reported problem lands in the shared ledger, classified, visible to the daily triage — not in a side file nothing reads.
5. All of it ships with Cortex: a new project gets the aware versions on day one.

## Business Rules

1. Workflows that produce code or plans always consult the map, the rules, and the relevant decisions first — depth of consultation matches the weight of the output.
2. Workflows that produce specs or ingest sources make targeted checks — what exists, what rules apply, what memory relates.
3. Structural workflows change minimally — awareness is added only where it materially improves the output.
4. Anything a workflow files or writes lands in the shared knowledge layer's formats, never in legacy side files.

## Success Metrics

- An implementation plan cites the rules and decisions it honoured.
- A generated test suite includes the project's recorded conventions without being asked.
- A problem filed through the workflow appears in the next daily triage run untouched by hand.

## Out of Scope

- Observing the workflows' behaviour in live sessions — that is the deferred journey tier.
- New workflow capabilities — this grounds the existing eleven, it doesn't extend them.

## Notes

- This is the design's final v1 step: the two lineages becoming one product in practice, not just in packaging.
