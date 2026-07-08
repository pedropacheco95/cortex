---
id: decision.2026-07-07-provenance-derives-from
title: Persistent artefacts carry provenance/derives_from tracing to their authorizing source
date: 2026-07-07T12:00:00Z
sources:
  - ../sources/cortex-v3-reframe.md
---

# Provenance via derives_from on authorizable artefacts

On 2026-07-07 we chose that **every persistent artefact that can trace to an
authorizing source carries provenance** — a frontmatter `provenance:` field
listing one or more `derives_from:` sources. This applies to **compass rules,
both spec trees, and atlas decisions**. Sources can be archive documents
(`archive/documents/<slug>/...`), Claude Code sessions
(`claude-sessions/<user>/<session-id>`, cited but not stored), or atlas
decisions. Provenance is **not required** — its absence means "authored
directly"; it is populated only when a real source exists.

For **v1 the relationship type is always `derives_from`** — we deliberately do
not distinguish "derives from" vs. "informed by" vs. "discussed in" yet; a
richer relationship taxonomy is a future refinement to introduce with a schema
migration when real use surfaces the need.

We chose this because provenance is what enables drift detection when a source
changes, "what changes if we renegotiate X?" backward citation-graph queries,
and a real audit trail from every enforceable rule to its authority — and
`derives_from`-only keeps v1 simple.

See source: atlas/sources/cortex-v3-reframe.md ("Provenance", "Future ideas").
