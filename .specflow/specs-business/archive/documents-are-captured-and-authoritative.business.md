---
id: archive.documents-are-captured-and-authoritative
status: implemented
implemented_by:
  - ../../specs/archive/ingest-skill.spec.md
---

# Every authoritative document is captured, once, on one pipeline

## Outcome

When this works, no document that ever authorized a rule, a spec, or a decision lives only in someone's inbox or a chat thread nobody can find again. A client sends a v2.1 spec, a stakeholder emails a compliance requirement, a call gets transcribed — whatever the shape, it enters Cortex through one systematic pipeline, the same way every time. The document itself is kept verbatim, forever, even after it's superseded by a newer version — because the audit question is never "what does the current spec say" alone, it's "what did we agree to, and when did it change." Nobody has to remember which of three ingestion tools to reach for, or improvise a new folder convention for a document type Cortex hasn't seen before.

## Who this is for

Developers and stakeholders on a Cortex-managed project who need downstream rules, specs, and decisions to be traceable back to whatever authorized them — and who need old versions of client/stakeholder documents to still be there when a dispute or a renegotiation makes "what did v2.0 actually say" a live question.

## User Journey

1. Someone hands Cortex a document — a client specification, a contract, a meeting transcript, a compliance document, anything that might authorize downstream work.
2. Cortex classifies its type — either because the person said what it is, or by recognizing it from its content — and stores the original untouched, alongside whatever structured content can be pulled out of it.
3. Cortex asks, plainly: should this feed a change plan (new or updated rules, specs, decisions), or is it reference material for now? Either answer is fine and reversible later.
4. If yes, a plan is drafted and put in front of the person before anything downstream actually changes — nothing here bypasses ordinary review.
5. When a newer version of a document already in Cortex arrives, Cortex diffs it against what's there, points out what's new/changed/removed, and preserves the old version rather than overwriting it — so both versions exist, one marked current.
6. At any point, anyone can browse a single index of everything that's been captured, and see what's active versus superseded.

## Business Rules

1. Every authoritative document enters through the same pipeline, regardless of type — no separate tool per document shape.
2. The original document is preserved verbatim, including every superseded version — nothing is deleted when a newer version replaces it.
3. Capturing a document never silently changes rules, specs, or decisions — proposing downstream changes is always a separate, confirmable step, and applying them goes through the same human-reviewed gate everything else does.
4. New document types are supported by describing them, not by rewriting the capture pipeline.
5. A single, browsable index always reflects what has been captured and whether each document is current or superseded.

## Success Metrics

- Every rule, spec, or decision that claims a document-shaped authority can be traced to a document actually held in Cortex, not to memory of an email.
- A superseded document version is still retrievable after being replaced.
- Ingesting a document never applies a downstream change without the person having seen and approved a plan first.
- A newly-encountered document type is captured on day one by adding a type description, not by a code change to the ingestion path.

## Out of Scope

- Deciding whether a specific requirement inside a document is *correct* — capture and classification only; the change-plan review is where correctness judgment happens.
- The mechanics of the human-review gate itself — that belongs to the pulse-gate outcome; this outcome is about what reaches it and why.
- Automated, confidence-scored auto-approval of extracted changes — a document's structured content always passes through the yes/no gate; nothing here auto-applies.

## Notes

- This outcome absorbs what used to be a separate, atlas-only capture path (stakeholders, decisions, domain terms lifted from a transcript or brief) — that capture becomes one more document type on the same pipeline, so a stakeholder decision and a client spec requirement carry the same kind of traceable origin.
- The audit property — "we can always show what we agreed to and when it changed" — is what makes this outcome distinct from a general-purpose file drop: supersession is preserved by design, not by discipline.
