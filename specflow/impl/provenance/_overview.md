# Provenance — Overview

## What this is

The engineering specs for the v3 provenance system (build-order-v3 step 4): the `provenance:` frontmatter field carrying `derives_from:` entries on compass rules, both spec trees, and atlas decisions; the three source-type reference forms (archive path, atlas decision, Claude Code session citation) with their differing resolution semantics; `check.provenance`; and the backward-traversal index that answers "what derives from this source."

## What it covers

- `provenance.frontmatter-check` — the whole contract: one relationship type (`derives_from`), absence means "authored directly" (never a warning), archive/atlas references must resolve (error if dangling), `claude-sessions/<user>/<id>` references are shape-checked citations only, and the check maintains the backward index that drift detection and archive's version-update reverse-lookup consume.

## Why it's grouped this way

Provenance is a single, deliberately thin capability grafted onto the existing curated citation graph — the same frontmatter-cross-reference machinery as `implements`/`depends_on`/`governs`, not a parallel validation pipeline. It earns its own domain because it spans every gated artefact class (rules, dev specs, business specs, decisions) rather than belonging to any one of them, and because its one genuinely new power — traversing *backward* from a source to everything built on it — is what turns a renegotiated requirement or a revisited decision from silent drift into a reviewable worklist.

## Related groups

- Business outcomes for this domain: `../../specs-business/provenance/`
- The documents most `derives_from` references point at: `../archive/`
- The decisions single-home whose citations this validates: `../migration/`, `../atlas/`
- The citation-graph machinery this extends: `../schema/`
