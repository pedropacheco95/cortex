---
id: decision.2026-07-10-schema-document-revised-in-place-per-version-not-via-addenda
title: "Schema document revised in place per version, not via addenda"
date: 2026-07-10T10:54:03.209Z
provenance:
  - derives_from: claude-sessions/pedropacheco1/ca09424d-c3cf-471c-b5a3-5e9077cf1fe4
---

The schema is the living contract referenced by version; a consumer at version N must read one coherent document, not reconcile a locked prior-version file against a delta. So cortex-schema.md is rewritten in place at each new version rather than accreting addenda. The prior version survives byte-exact in git history, and because edits are surgical (untouched text preserved verbatim), the git diff itself is the audit trail. This practice persisted from v2.0 through v3.0 and is stated in the schema's own header.
