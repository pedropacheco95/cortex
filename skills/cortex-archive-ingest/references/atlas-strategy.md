# Extraction strategy: `atlas`

This is step 4's routine for any `archive/types/<id>.yaml` declaring
`extraction: { strategy: atlas, ... }` — the type-routed fold-in of the
former standalone `cortex-ingest` skill (design §6.6, ingest-skill spec rule
8). It is invoked from `SKILL.md` step 4; it does not run on its own and it
does not replace steps 1–3, 5–8 of the main workflow.

**What changed from the old standalone skill:** the source no longer lands
in `atlas/sources/` — it already landed in
`archive/documents/<slug>/source.<ext>` at step 3. Every extracted
stakeholder/decision/domain-term file's `sources:` field now cross-links back
to **this archive document's own `extracted/`** (or its `source.<ext>`),
never to a bare `atlas/sources/` copy. Everything else — the index-first
read, the provenance-mandatory rule, and re-ingest-updates-not-duplicates —
carries over unchanged.

## 1. Index-first — read before you write

Before writing anything, read the atlas indexes to learn what already exists
and where things go (index-first protocol, design §9.1):

- Read `atlas/_index.md`.
- Read the target directories' `_index.md` files — `atlas/stakeholders/_index.md`,
  `atlas/decisions/_index.md`, `atlas/domain/_index.md`.

(There is no `atlas/sources/_index.md` step here — this strategy no longer
writes into `atlas/sources/`.)

## 2. Extract entries — provenance is mandatory

Extract stakeholders, decisions, and domain terms as §4.3-conformant atlas
files, but write them per this type's declared `extraction.outputs` under
**`archive/documents/<slug>/extracted/`** — e.g. an output declared as
`kind: stakeholders`, `path: extracted/stakeholders/` produces one file per
stakeholder there, mirroring the atlas shape below but living under the
archive document.

**Provenance is mandatory: an entry that cannot cite its source is not
written.** Every extracted file MUST carry a `sources:` list pointing at
this archive document — e.g. `- archive/documents/<slug>/source.<ext>` or the
more specific `extracted/` file it was drawn from, not `atlas/sources/`.

- **Stakeholders** → `id: stakeholder.<slug>`, required `name`, `role`; plus
  `sources:`.
- **Decisions** → `id: decision.<YYYY-MM-DD>-<slug>`, required `title`,
  `date` (ISO datetime); plus `sources:`. Body: "on DATE we chose X because Y
  — see source Z."
- **Domain terms** → `id: domain.<term>`, required `term`, `definition`;
  plus `sources:`.

`id` MUST match the per-kind pattern (schema §4.3) AND the filename.
`date` MUST be ISO-8601. Every path in `sources:` MUST resolve.

**Where these files physically live:** under this archive document's
`extracted/` tree (per the type's declared `outputs`), not under
`atlas/stakeholders/`, `atlas/decisions/`, `atlas/domain/` directly. If the
change-plan gate (SKILL.md step 6) is later accepted with "yes," the
*proposal* step is what actually lands durable atlas entries — as
`promotion`-typed pulse suggestions targeting `.cortex/atlas/` — never a
direct write. If the user says "no" at the gate, these extracted files remain
reference-only content inside the archive document, not living atlas
entries; say this explicitly in your summary so the user knows extraction
output is not the same as a landed atlas decision/stakeholder/domain entry
until the gate is accepted.

## 3. Re-ingest is an update, not a duplicate

Before writing each entry, check existing ids — both other archive documents'
`extracted/` output and, if the gate has previously been accepted for this
document, the landed atlas entries themselves. If a matching `id` already
exists, **refresh the existing entry** (append the new `sources:` reference,
update the body) rather than creating a duplicate. Re-ingesting the same
source updates in place.

## 4. Handoff for requirement-shaped content

If, while extracting, you notice the document is **primarily product
requirements** (feature requests, acceptance criteria, scope, user stories)
rather than memory-shaped material (stakeholders/decisions/domain terms), say
so in your summary and suggest `specflow-ingest` for that portion — the same
sibling boundary the old `cortex-ingest` observed.
