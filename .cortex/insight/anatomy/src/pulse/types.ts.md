---
path: src/pulse/types.ts
extracted_at: 2026-09-22T09:54:50Z
extraction_level: 3
size_lines: 123
size_tokens: 1300
centrality: medium
built_at_commit: "a66041b"
source_sha256: "fa966081c47be8c43869700aaf014e9d879f645b0cc4f0f14f9b1212e43e6944"
---
# src/pulse/types.ts

## Purpose

Defines the typed pulse gate's shared type→policy contract (schema §4.5.1/§4.5.2): the seven legal `**Type:**` values (`SUGGESTION_TYPES` — `decision-candidate` added at v3.0/A7.4, `evidence-candidate` added at 3.4), the three payload-operation shape markers (`PAYLOAD_SHAPES`), the create-only type set (`CREATE_ONLY_TYPES`, currently just `evidence-candidate` — a re-measurement is always a new file that `supersedes` the old one, never an append or edit), and — most importantly — the per-type permitted `**Target:**` root table (`permittedRoots`/`isTargetPermitted`/`permittedRootsLabel`), e.g. `rule-candidate` may only target `.cortex/compass/`, `decision-candidate` only `.cortex/atlas/decisions/`, `evidence-candidate` only `.cortex/atlas/evidence/`, and only `user-directed-capture` may target the ungated `.cortex/insight/map/`. The header states its reason for existing explicitly: this table is extracted so the runtime accept path (`review.ts`) and the schema validator (`schema/checks/pulse.ts`) share ONE copy of the policy and cannot drift. It is a pure module — no fs, no LLM, no network.

## Main players

- `SUGGESTION_TYPES` / `SuggestionType` (lines 18–27) — critical. The closed seven-value enum every other player in this file and its two consumers key off; the source of truth for what a `**Type:**` line may legally say.
- `permittedRoots` (lines 68–88) — critical. The per-type target-root table itself: a `switch` over `SuggestionType` returning an array of `RootSpec` (`dir`/`file`/`skill` matchers). This is the one table both `review.ts` (runtime, with `..`-escape resolution) and `schema/checks/pulse.ts` (structural validator) consume — the file's entire reason to exist.
- `isTargetPermitted` (lines 95–103) — critical. The pure string-level check the validator treats as authoritative: is `target` inside one of `permittedRoots(type)`'s specs. Normalises a leading `./` and trims before matching.
- `CREATE_ONLY_TYPES` (line 34) — supporting. A `ReadonlySet<SuggestionType>` (today just `evidence-candidate`) that `schema/checks/pulse.ts` consults to error on any payload shape other than `**Proposed file:**` for that type.
- `permittedRootsLabel` (lines 106–122) — supporting. Human-readable mirror of `permittedRoots`, used only in error messages (`review.ts`'s refusal text, the validator's diagnostics) — must be kept in sync with `permittedRoots` by hand since it's a separate `switch`, not derived from the `RootSpec` data.
- `RootSpec` (lines 51–54) — supporting. The three-shape union (`dir` prefix, exact `file` path, or `skill` — a NEW `.claude/skills/<name>/SKILL.md`) every root-table entry is built from.
- `DEFAULT_SUGGESTION_TYPE` (lines 36–37) — supporting. `'rule-candidate'`, the v1-era tolerance value used when a section carries no `**Type:**` line at all.

## Insights

- **This file is a policy contract deliberately duplicated by reference, not by inheritance**: `review.ts`'s runtime check and `schema/checks/pulse.ts`'s validator check are two independent call sites reading the same `permittedRoots`/`isTargetPermitted` functions — the drift this file exists to prevent is between those two consumers, not within this file itself. Any change to a type's permitted roots automatically propagates to both without either consumer needing an update.
- **`permittedRootsLabel` is NOT derived from `permittedRoots`'s data** — it's a hand-written parallel `switch` producing prose. Adding a type (or changing a `RootSpec`) requires updating both switches by hand; nothing enforces they stay in sync beyond code review and whatever test coverage exists (`tests/atomic/pulse/types.test.ts` per the sibling test file naming convention, not confirmed read here).
- **`user-directed-capture` is the sole type permitted to target `.cortex/insight/map/`** (`INSIGHT_MAP`, line 63) — every other type's root list excludes it explicitly, per the comment "never insight/map (insight is ungated)" on the `promotion`/`gated-layer-update` case. This is the structural enforcement of the two-layer rule that insight is inferred/ungated while compass/atlas are gated.
- **`decision-candidate` and `evidence-candidate` each get their own narrow sole-home directory** (`atlas/decisions/`, `atlas/evidence/` respectively) rather than the broader `atlas/` prefix that `promotion`/`gated-layer-update`/`user-directed-capture` get — these two types cannot land anywhere else under atlas, a stricter policy than the general atlas-writing types.
- **The `skill` `RootSpec` kind is structurally shape-based, not path-prefix-based**: `isTargetPermitted`'s `skill` branch checks `t.startsWith('.claude/skills/') && t.endsWith('/SKILL.md')` rather than an exact prefix match — this is the same shape test `review.ts`'s `skillTargetName` independently re-implements at the fs-resolution layer (this file's version has no `..`-escape awareness, deliberately, per the module doc's stated division of labour).

## Connections

Uses: (none src-internal — pure module, no imports at all)

Used by:
- src/pulse/review.ts — the runtime accept path, which additionally resolves paths against the same `permittedRoots(type)` table for `..`-escape safety beyond this file's pure string check; also consumes `DEFAULT_SUGGESTION_TYPE`, `isSuggestionType`, `permittedRootsLabel`.
- src/schema/checks/pulse.ts — the schema validator, using `isTargetPermitted`/`permittedRootsLabel`/`CREATE_ONLY_TYPES` as the structural authority for target-root and payload-shape validation.

Semantically related (not imports):
- src/pulse/fences.ts — both are pure §4.5-contract policy modules shared between writers (`distil.ts`, `review.ts`) and validators specifically to prevent drift between independent consumers, without either file importing the other.

## Query pointers

- If you need to add or change a suggestion type's legal target roots, edit `permittedRoots` here AND the parallel `permittedRootsLabel` switch — then check both `src/pulse/review.ts` and `src/schema/checks/pulse.ts` pick up the change (they should, being direct callers, but verify test coverage on both sides).
- If you need to understand why a particular `**Type:**` payload shape is refused, also read: `src/pulse/review.ts` (the `hasPayload`/target-permission checks) and `src/schema/checks/pulse.ts` (the validator's own shape enforcement, including `CREATE_ONLY_TYPES`).
