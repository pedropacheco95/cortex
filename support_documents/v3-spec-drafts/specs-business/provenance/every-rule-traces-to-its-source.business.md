---
id: provenance.every-rule-traces
status: draft
implemented_by:
  - ../../specs/provenance/frontmatter-check.spec.md
---

# Every enforceable rule traces to the authority that justifies it

## Outcome

When this works, nobody has to take a rule, a spec, or a decision on faith. Ask "why does this rule exist" and the answer is one hop away — a document Cortex holds, an atlas decision, or at minimum "someone typed this directly, no external authority claimed." And the question runs backward too: when a client renegotiates a requirement, or a stakeholder decision gets revisited, Cortex can immediately show everything that was built on top of it — every rule, every spec — so a renegotiation isn't followed by a silent, unnoticed drift between what's authorized and what's enforced.

## Who This Is For

Developers who inherit a rule or a spec and need to know whether it's still justified; stakeholders and project owners who need to know, when something they agreed to changes, exactly what downstream content that touches.

## User Journey

1. A rule, a spec, or an atlas decision is created — either by hand, or as part of applying an ingested document's change plan.
2. Where it derives from something — an ingested document, a recorded decision, a specific conversation — that origin is recorded on the artefact itself, in one consistent form.
3. Anyone reading the artefact can follow the origin forward to the source and confirm it says what the artefact claims.
4. When a source changes — a document is superseded, a decision is revisited — anyone can ask the reverse question, "what derives from this," and get a complete list without having to grep the whole project by hand.
5. An artefact with no recorded origin is understood to mean "authored directly" — a stated, deliberate absence, not a gap or an oversight.

## Business Rules

1. A rule, a spec, or an atlas decision that claims to come from somewhere records that origin on itself, in a form anyone (and anything) can follow.
2. An origin that points at something Cortex holds (an ingested document, an atlas decision) must actually resolve to that thing — a dangling claim of authority is caught, not silently tolerated.
3. An origin that points at a conversation outside Cortex's storage (a Claude Code session) is recorded as a citation of where the idea came from — it establishes the trail without pretending Cortex can retrieve the whole conversation.
4. No origin recorded means the artefact was authored directly — that is a valid, complete answer, not missing data.
5. The trail runs backward as well as forward: given a source, everything that derives from it is discoverable in one query, not by manual search.

## Success Metrics

- Any rule, spec, or atlas decision carrying a recorded origin can be traced to a source that actually exists and says what's claimed.
- A dangling or broken origin reference is caught and flagged, never silently passed.
- Given a document or decision that changed, every rule/spec/decision derived from it is found in one query.
- An artefact with no recorded origin is never mistaken for "provenance unknown" — it reads as "authored directly," on inspection.

## Out of Scope

- Judging whether a cited source actually *justifies* the artefact's content — this outcome is about traceability existing and resolving, not about grading the strength of the justification.
- A taxonomy of relationship strengths (strongly-implies vs. loosely-informed-by) — v3 records one relationship, "derives from"; finer distinctions are a later refinement.
- Automatically re-writing a rule when its source changes — surfacing the drift for human review is in scope; auto-editing the rule is not.

## Notes

- This outcome is the backward-traversal half of the citation graph Cortex already maintains for `implements`/`depends_on`/`governs` — it reuses that same mechanism rather than inventing a parallel one; the new capability is answering "what derives from this," not just "what does this derive from."
- The three kinds of source a rule can point at — a captured document, a recorded decision, or a bare session citation — are treated differently on the resolves-or-not question: the first two must resolve, the third is trusted as a citation because Cortex was never asked to store it.
