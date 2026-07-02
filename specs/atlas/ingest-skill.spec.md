---
id: atlas.ingest-skill
status: implemented
depends_on:
  - core-cli.init
  - schema.validator
implements: ../../specs-business/atlas/developer-turns-raw-sources-into-project-memory.business.md
governed_by: []
governs:
  - "skills/cortex-ingest/**"
---

# cortex-ingest Skill

## Intent

`cortex-ingest` is Cortex's first shipped agentic Skill (design §15): it takes a non-spec source (call transcript, RFP, brief, email, design doc), preserves it verbatim under `atlas/sources/`, and extracts schema-conformant atlas entries — stakeholders, decisions, domain terms — cross-linked back to the source. It is the sibling of `specflow-ingest` (which owns requirement-shaped sources); this Skill owns project *memory*. The deliverable is a skill bundle shipped in the npm package and installed by `cortex init` (Rule 4 of `core-cli.init`) — making the previously dormant skills-install path live.

## Entities

- **READS (skill, at run time):** the source document the user provides; `atlas/_index.md` and per-directory indexes (index-first protocol, design §9.1); existing atlas entries (dedup/update on re-ingest).
- **WRITES (skill, at run time):** `atlas/sources/<slug>.<ext>` + `<slug>.meta.md`; `atlas/stakeholders/`, `atlas/decisions/`, `atlas/domain/` entries per schema §4.4 — and nothing outside `atlas/`.
- **CREATES (this spec's deliverable):** the bundle `skills/cortex-ingest/SKILL.md` inside the package.

## Rules

1. **Shipped bundle.** The package ships `skills/cortex-ingest/SKILL.md` with frontmatter `name: cortex-ingest` and a `description` carrying invocation triggers ("ingest this transcript/RFP/brief", "add this to project memory"). `cortex init` installs it via its existing Rule-4 machinery.
2. **Instructed workflow (the SKILL.md body MUST contain each of these, mechanically assertable):**
   a. Read `atlas/_index.md` and the target directories' `_index.md` files before writing (index-first).
   b. Preserve the source verbatim at `atlas/sources/<slug>.<ext>` and write the sibling `<slug>.meta.md` per schema §4.4 (`id: source.<slug>`, `kind` from the §4.4 enum, `captured`, `origin`).
   c. Extract stakeholders, decisions, and domain terms into §4.4-conformant files — correct `id` patterns, `date`/`captured` timestamps, and a `sources:` list pointing at the ingested source. Provenance is mandatory: an entry that cannot cite its source is not written.
   d. Write **only inside `atlas/`** — never cerebrum, anatomy, specs, or pulse. Rule candidates spotted in the source are listed in the closing summary as suggestions for the human, not written anywhere.
   e. Re-ingest is an update: check existing atlas ids first; refresh matching entries rather than duplicating.
   f. Run the schema validator after writing (`cortex validate`) and fix any `error` before finishing.
3. **Requirements-shaped content is routed, not ingested.** The body instructs: if the source is primarily product requirements, hand off to `specflow-ingest` and ingest only the memory-shaped remainder.
4. **`cortex validate` exists as a CLI command.** Rider (standing authority — engineering call): the validator's existing `run()` is wired to `cortex validate [path] [--json]` so Skills and humans can invoke it; exit 0 conformant / 1 not.

## Acceptance Criteria

### Bundle ships and init installs it

- **Given** a fresh project on macOS
- **When** `cortex init --partial --no-llm --yes` runs
- **Then** `.claude/skills/cortex-ingest/SKILL.md` exists with frontmatter `name: cortex-ingest`
- **And** the init summary reports at least 1 skill installed

### Overwrite protection becomes live

- **Given** a project whose `.claude/skills/cortex-ingest/SKILL.md` already exists with user modifications
- **When** init runs without `--yes` in a non-interactive context
- **Then** the user's copy is preserved byte-identical
- **And** with `--yes`, the shipped bundle replaces it

### Body carries the full instructed workflow

- **Given** the shipped SKILL.md
- **When** its body is inspected
- **Then** it contains instructions for: index-first reading, verbatim source preservation with `<slug>.meta.md` per §4.4, provenance-mandatory extraction with `sources:` links, the atlas-only write boundary, re-ingest-as-update, and the post-write `cortex validate` run

### Atlas-only boundary is explicit

- **Given** the shipped SKILL.md body
- **Then** it explicitly forbids writes outside `atlas/` and instructs surfacing rule candidates as human suggestions only

### cortex validate command works

- **Given** the conformant repo
- **When** `cortex validate` runs
- **Then** it exits 0; and with a planted broken `implements:` it exits 1 naming the violation

## Notes

- A Skill is a prompt artefact — its runtime behaviour is exercised by an LLM and is deliberately not unit-tested here. What IS mechanically pinned: the bundle ships, installs, and its body contains the exact workflow contract. Runtime conformance is caught downstream by the validator (`cortex validate`, instructed in the body) and, later, the scheduled `specflow-lint`/verification loops. Journey-tier skill testing is deferred with the rest (v1.1).
- The `cortex validate` rider (Rule 4) also serves every future Skill and loop — first shared CLI surface for the agentic layer.
- Also supports: `core-cli` (validate command, skills-install path). Primary parent remains `atlas.developer-turns-raw-sources-into-project-memory`.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
