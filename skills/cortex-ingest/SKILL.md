---
name: cortex-ingest
description: >-
  Ingest a non-spec source into Cortex project memory (atlas). Use this when the
  user says "ingest this transcript", "ingest this RFP", "ingest this brief",
  "ingest this email", "ingest this design doc", "add this to project memory",
  "capture this call", "remember this decision", "log these stakeholders", or
  drops any raw material (transcript / RFP / Slack export / PDF / design doc)
  that is project memory rather than product requirements. Preserves the source
  verbatim under atlas/sources/ and extracts schema-conformant stakeholders,
  decisions, and domain terms cross-linked back to it. Sibling of specflow-ingest,
  which owns requirement-shaped sources.
---

# cortex-ingest

You turn a raw, non-spec source into durable Cortex project **memory**. You own
`atlas/` — the human-and-project context layer. You are the sibling of
`specflow-ingest`, which owns requirement-shaped sources.

Everything you write MUST conform to `cortex-schema.md` §4.4 (atlas artefacts).
Cite it when in doubt. Follow this workflow in order.

## 0. Route requirements-shaped content away first

Skim the source. If it is **primarily product requirements** (feature requests,
acceptance criteria, scope, user stories), do NOT ingest that here — **hand off
to `specflow-ingest`** and ingest only the memory-shaped remainder (who was in
the room, what was decided and why, domain vocabulary). Say so in your summary.

## 1. Index-first — read before you write

Before writing anything, read the atlas indexes to learn what already exists and
where things go (index-first protocol, design §9.1):

- Read `atlas/_index.md`.
- Read the target directories' `_index.md` files — `atlas/sources/_index.md`,
  `atlas/stakeholders/_index.md`, `atlas/decisions/_index.md`,
  `atlas/domain/_index.md`.

## 2. Preserve the source verbatim

Copy the source **byte-for-byte, unedited** to `atlas/sources/<slug>.<ext>`
(pick a short kebab-case `<slug>`; keep the original extension). Write a sibling
`atlas/sources/<slug>.meta.md` per schema §4.4 with frontmatter:

```yaml
---
id: source.<slug>
kind: <transcript|rfp|slack|pdf|design-doc|other>   # §4.4 enum
captured: 2026-06-29T14:00:00Z                        # ISO-8601 UTC, trailing Z
origin: <where it came from — call, email thread, upload>
---
```

`kind` MUST come from the §4.4 enum `transcript|rfp|slack|pdf|design-doc|other`.
`captured` MUST be an ISO-8601 datetime.

## 3. Extract entries — provenance is mandatory

Extract stakeholders, decisions, and domain terms into §4.4-conformant files.
**Provenance is mandatory: an entry that cannot cite its source is not written.**
Every extracted file MUST carry a `sources:` list pointing at the ingested
source (e.g. `- atlas/sources/<slug>.<ext>`).

- **Stakeholders** → `atlas/stakeholders/<slug>.md` — `id: stakeholder.<slug>`,
  required `name`, `role`; plus `sources:`.
- **Decisions** → `atlas/decisions/<YYYY-MM-DD>-<slug>.md` —
  `id: decision.<YYYY-MM-DD>-<slug>`, required `title`, `date` (ISO datetime);
  plus `sources:`. Body: "on DATE we chose X because Y — see source Z".
- **Domain terms** → `atlas/domain/<term>.md` — `id: domain.<term>`, required
  `term`, `definition`; plus `sources:`.

`id` MUST match the per-kind pattern AND the filename. `date`/`captured` MUST be
ISO-8601. Every path in `sources:` MUST resolve.

## 4. Atlas-only write boundary

Write **only inside `atlas/`**. **Never** write to `compass`, `anatomy`,
`specs`, or `pulse`. If you spot a rule candidate (a durable engineering
convention the project should adopt), do NOT write it anywhere — list it in your
closing summary as a **suggestion for the human** only. Rule candidates are
surfaced, never authored.

## 5. Re-ingest is an update, not a duplicate

Before writing each entry, check existing atlas ids (from the indexes and the
target directories). If a matching `id` already exists, **refresh the existing
entry** (append the new `sources:` entry, update the body) rather than creating
a duplicate. Re-ingesting the same source updates in place.

## 6. Validate before finishing

After writing, run `cortex validate` from the project root. Fix every `error`
it reports before you finish. Exit 0 means conformant.

## 7. Closing summary

Report: the source preserved (path + `id`), each entry written or refreshed
(with its `id`), anything routed to `specflow-ingest`, any rule candidates as
suggestions for the human, and the `cortex validate` result.
