---
path: src/schema/checks/pulse.ts
extracted_at: 2026-07-08T20:46:01Z
extraction_level: 2
size_lines: 158
size_tokens: 1572
centrality: medium
built_at_commit: "8248c76"
source_sha256: "e4cbf7506c1dd3cc86d3bd76503070348035566018091b805475b971e54ea775"
---
# src/schema/checks/pulse.ts

## Purpose
Validates `.cortex/pulse/` artefacts (schema §4.5/.1/.2) in two layers: a v1 layer checking frontmatter header presence (`kind`/`generated`/`loop`, all warnings — pulse is transient proposal data, not held to artefact-grade rigor), and a v2 layer parsing each `## S-NNN: …` suggestion section within a file's body (via the internal `parseSuggestionSections`) and validating its typed-pulse gate: `**Type:**` must be present (absent defaults to `rule-candidate` with a warning, v1-era tolerance) and in the shared `SUGGESTION_TYPES` enum (outside it is an error); `**Target:**` must be within the permitted root for that type (error if not, via `isTargetPermitted`); and exactly one payload shape among `**Proposed addition:**`/`**Proposed edit:**`/`**Proposed file:**` must be present (zero or more than one is an error). `pulse-dismissed.md`-kind files are exempt from the per-section checks since they record dismissals, not proposals.

## Main players
- `checkPulse` (lines 65–157) — orchestrates both validation layers over every `.cortex/pulse/*.md` file. [critical]
- `parseSuggestionSections` (lines 36–57) — splits a markdown body into `## S-NNN` sections, closing a section on any other H1/H2 heading. [supporting]
- `fieldValue` (lines 59–63) — extracts a `**Label:** value` bold-field from section text via regex. [supporting]

## Insights
- The `**Type:**` absence tolerance (default to `rule-candidate` + warning rather than error) is explicitly called "v1-era tolerance" — this is backward compatibility for pulse files written before the typed-suggestion contract existed, not a permanent design choice.
- Section boundary detection in `parseSuggestionSections` treats ANY H1/H2 heading (not just another `## S-NNN`) as closing the current section — a stray unrelated heading inside a pulse file will silently truncate the suggestion it follows.

## Connections
Uses:
- src/pulse/types.ts: `SUGGESTION_TYPES`, `PAYLOAD_SHAPES`, `isTargetPermitted`, `permittedRootsLabel`, `SuggestionType` — the entire typed-suggestion contract this check enforces lives there, not here.
- src/schema/types.ts: `Violation` type.

Used by:
- src/schema/validate.ts: calls `checkPulse(root)`.

## Query pointers
If you need to understand the full typed-suggestion contract (enum values, permitted targets per type), also read: src/pulse/types.ts.
