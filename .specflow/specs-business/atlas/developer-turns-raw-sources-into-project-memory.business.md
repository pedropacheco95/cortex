---
id: atlas.developer-turns-raw-sources-into-project-memory
status: implemented
implemented_by:
  - ../../specs/atlas/ingest-skill.spec.md
---

# A developer turns raw sources into durable project memory

## Outcome

When this works, the raw materials a project accumulates — call transcripts, briefs, requirement emails, design documents — stop rotting in downloads folders and inboxes. The developer hands a source to Cortex; the original is preserved untouched, and the people, decisions, and domain language inside it become structured, cross-linked project memory that the assistant can cite. Months later, "why did we choose this?" traces back to the exact call where it was decided.

## Who this is for

Developers and freelancers accumulating project context from outside the code — client calls, stakeholder emails, requirement documents — who today either re-read the raw material every time or lose it.

## User Journey

1. The developer gives Cortex a source document and says where it came from.
2. The original is filed away verbatim — nothing paraphrased at the source layer.
3. Cortex reads it and drafts memory entries: who was involved, what was decided and why, which domain terms it uses — each entry pointing back at the source it came from.
4. The developer reviews what was extracted; the entries join the project's memory and start showing up in cited answers.
5. Handing over the same document again refreshes what exists instead of duplicating it.

## Business Rules

1. The original source is preserved exactly as given — extraction never alters or replaces it.
2. Every extracted entry names the source it came from; memory without provenance doesn't get written.
3. Ingesting touches only the project-memory area — never the rules, the code map, or the specifications.
4. If the source suggests a new project rule, that is proposed to the developer, not silently written.
5. Extraction checks its own output for consistency before finishing.

## Success Metrics

- A source document becomes cited, navigable memory in one interaction.
- Every memory entry can be traced to its source in one hop.
- Re-ingesting a document never produces duplicates.

## Out of Scope

- Sources that are requirements for the product's behaviour — those flow through the specification-ingest path, a separate outcome.
- Automatic ingestion on a schedule — this is a deliberate, developer-invoked act.
- Extracting rules or conventions directly — rule curation stays a human decision.

## Notes

- Raw sources may contain sensitive material; they live in the one part of project memory that stays off the shared record by default.

## Notes

- **Delivery moved (2026-08-05).** This outcome was first delivered by the standalone
  `cortex-ingest` skill (`atlas.ingest-skill`, retained for lineage). It is now delivered by
  `cortex-archive-ingest`'s `atlas` extraction strategy — one ingestion pipeline for every
  document kind, with sources kept under `archive/` and the same provenance chain as everything
  else. The promise to the developer is unchanged; only the skill that keeps it moved.
