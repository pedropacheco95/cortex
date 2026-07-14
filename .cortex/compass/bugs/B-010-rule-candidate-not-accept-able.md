---
id: B-010
title: rule-candidate proposals from session-observe can never be pulse-accept-ed
type: missing-criterion
severity: high
status: resolved
affects:
  - insight.session-observe
  - src/insight/session-observe.ts (candidateSectionText, ObserveCandidate, validateObserveCandidate)
  - src/pulse/review.ts (payloadKind === 'addition' branch — indirectly, as the mis-triggered path)
  - skills/cortex-loop-session-observe/SKILL.md (+ .claude/skills mirror)
proposed_fix: Add a ruleFilePayload() next to decisionFilePayload() that mirrors it — Core computes the next R-NNN by scanning .cortex/compass/rules/ (plus ids allocated earlier in the same apply batch), builds schema-conformant frontmatter (id/title/source/governs/provenance), and candidateSectionText() emits **Proposed file:** with it instead of **Proposed addition:** + raw prose. Add governedGlobs (+ a distinct title) to the ObserveCandidate rule-candidate shape since Core cannot infer globs (R-001); validateObserveCandidate() accepts them tolerantly. Delete the SKILL.md step 6.5 hand-repair workaround once the round-trip works natively.
resolved: 2026-07-14T00:00:00Z
opened: 2026-07-14T00:00:00Z
---

# B-010 — `rule-candidate` proposals from session-observe are not accept-able

## Evidence

Reported via a cross-project handoff (`HANDOFF-session-observe-rule-candidate-format.md`),
found 2026-07-14 running the daily bundle on the `berd` project: all 13
`rule-candidate` suggestions (S-001–S-013) produced by that run's
`cortex-loop-session-observe --apply` failed `cortex pulse-accept` with:

```
Target file does not exist: .cortex/compass/rules/R-NEW-<slug>.md
```

Reproduced locally: any `rule-candidate` candidate passed through
`applyObserve()` renders a `## S-NNN` section with `**Proposed addition:**`
and an LLM-supplied `**Target:**` under `.cortex/compass/`. `pulse-accept`'s
`addition` payload kind only appends to an already-existing file (or one of
four special-cased compass-core files — `preferences.md`, `environment.md`,
`do-not-repeat.md`, `standing-authorities.md`); `.cortex/compass/rules/` is
never in that list, and a project's rules directory holds no pre-existing file
a brand-new convention could append to. Every rule-candidate that names a
genuinely new rule therefore fails outright, on every project, since the
`rule-candidate` route shipped.

Compounding: even a corrected `**Proposed file:**` create would still fail
`check.rules` (`src/schema/checks/compass.ts`) — it requires `id` (matching
`R-\d{3}` AND the filename), `title`, a resolvable `source` list, and a
`governs` glob list on every `.cortex/compass/rules/R-NNN-*.md` file, and
`candidate.proposedText` was raw prose with none of that. The
`decision-candidate` sibling route already gets this right via
`decisionFilePayload()` (schema-conformant frontmatter, Core-computed
`atlas/decisions/YYYY-MM-DD-<slug>.md` target); there was no `ruleFilePayload()`
equivalent.

## Diagnosis (seven-type classification)

1. **Dev spec governing this behaviour?** YES — `insight.session-observe`
   (`.specflow/specs/insight/session-observe.spec.md`); Rule 3 owns "gated
   convention → compass proposal", and `candidateSectionText()` /
   `ObserveCandidate` implement it.
2. **Does the spec have a rule covering this case?** PARTIALLY. Rule 3 asserts
   the *route* (gated convention → typed pulse proposal targeting
   `.cortex/compass/`) and mentions reusing "the existing rule-candidate
   suggestion type and its append payload shape" — a stray carry-forward
   reference to the pre-v3 mechanism (when compass rules lived as appendable
   entries in a handful of core files, before the one-file-per-`R-NNN`
   ledger existed) rather than a considered statement that a *brand-new*
   rule must use an append shape. Nothing in Rule 3 or its AC family says
   what shape or content the drafted rule file must have.
3. **Does an acceptance criterion assert the behaviour that broke?** NO. The
   spec's only relevant AC ("A gated convention becomes a compass-targeted
   proposal, never a direct write") stops at: the report gains an `S-NNN`
   section with `**Type:** rule-candidate` and `**Target:**` under
   `.cortex/compass/`, and `.cortex/compass/` itself is unchanged. It never
   asserts the property that actually matters end-to-end — that the proposal
   Core writes must itself be `cortex pulse-accept`-able against an empty
   `.cortex/compass/rules/`, and that the landed file must pass
   `check.rules`. Because that criterion was never stated, the implementation
   was free to (and did) copy the wrong payload marker and skip drafting
   conformant frontmatter entirely, and no test ever exercised the round-trip
   to catch it — the exact same shape of gap as B-002 (crash-recovery
   cleanup) and B-006 (atlas/sources id): a check/behaviour exists, a
   concrete case it must also cover was never criterion-ed.

First NO at step 3 → **type: missing-criterion**. Not wrong-rule: Rule 3's
route-level claim (gated convention → compass proposal, human-reviewed) is
still true and unchanged by this fix. Not incomplete-rule: the rule doesn't
need new prose about payload shape so much as the spec needs an AC pinning
the round-trip contract that was always implicit in "never a direct write" —
if it's a proposal, it must be an *acceptable* one. Not layer-drift: the
business spec (`assistant-understands-codebase.business.md`) makes no
promise this contradicts; not test-defect: there was no test asserting the
missing behaviour to begin with.

Severity **high**: every `rule-candidate` this loop has ever proposed for a
genuinely new rule has been silently dead on arrival — the entire "gated
convention becomes a reviewable, actionable proposal" promise (Rule 3/4,
RULES 7) held for `decision-candidate` but not for its `rule-candidate`
sibling, on every project running the daily bundle.

## Intended semantics

A `rule-candidate` proposal must be end-to-end usable exactly like
`decision-candidate`: Core computes the target deterministically (a real,
unused `R-NNN`), drafts schema-conformant frontmatter, and the proposal
round-trips through `cortex pulse-accept` against a project whose
`.cortex/compass/rules/` is empty — the common case, since a fresh rule
almost always targets a brand-new file, not an existing one.

## Resolution (2026-07-14)

**Spec:** `.specflow/specs/insight/session-observe.spec.md` — added the
missing acceptance criterion under the existing "gated convention" AC family:
a `rule-candidate` proposal Core writes must be `cortex pulse-accept`-able
against an empty `.cortex/compass/rules/`, and the resulting file must pass
`check.rules` (id/title/source/governs) and `check.provenance`. No Rule text
change was needed beyond this — Rule 3's route-level claim already held; only
the concrete round-trip guarantee was missing.

**Code (`src/insight/session-observe.ts`):**
- Added `ruleFilePayload(candidate, absRoot, user, allocatedRuleIds)` —
  mirrors `decisionFilePayload()`: computes the next unused `R-NNN` via
  `nextRuleId()` (scans `.cortex/compass/rules/R-\d{3,}[-...].md` on disk,
  combined with a `Set<string>` of ids already allocated earlier in the same
  apply batch so two candidates in one run never collide), derives a display
  `title` (`ruleTitle()`) and filename `slug` (`ruleSlug()`), computes
  `source:` as the on-disk-relative path from the drafted rule file back to
  `.cortex/pulse/reports/session-observe.md` (via `path.relative`, resolved
  by `resolveRelativePath()` at validate time — the one artefact guaranteed
  to exist and back a session-mined convention), `governs:` from
  `candidate.governedGlobs` (fallback `["**/*"]`), and a `provenance:` block
  of `claude-sessions/<user>/<id>` refs (cited-not-resolved, schema §6/A6 —
  confirmed via `checkProvenance`/`CLAUDE_SESSION_REF_PATTERN`), plus
  `confidence: INFERRED`. Returns `{ targetRel, payload }`.
- `ObserveCandidate`'s `rule-candidate` variant: added `title?: string` (the
  display/frontmatter title — `pattern` stays the untruncated
  dismissal/carry-forward matching key, fixing the double-duty that also
  truncated report headings mid-word) and `governedGlobs?: string[]`
  (the one field Core cannot infer, R-001 — supplied by the skill). Dropped
  `proposedTarget` entirely (Core now computes the target deterministically,
  same as `decision-candidate`, which never had a target field either —
  this keeps the two gated-candidate shapes symmetric).
- `validateObserveCandidate()`: rule-candidate now requires only `pattern`,
  `proposedText`, `sessionIds`; `title`/`governedGlobs` are shape-checked
  TOLERANTLY — malformed or absent values are dropped (fallback applies)
  rather than rejecting the whole candidate, so old/malformed proposals JSON
  never hard-fails.
- `candidateSectionText()`: the rule-candidate branch now builds via
  `ruleFilePayload()` and emits `**Proposed file:**` (was
  `**Proposed addition:**`) with the assembled frontmatter+body; the
  `**Pattern:**` field line is kept (still the carry-forward/dismissal
  matching key read by `pendingNorms`). Threaded `absRoot` and a
  batch-scoped `allocatedRuleIds: Set<string>` through from `applyObserve()`.

**Skill (`skills/cortex-loop-session-observe/SKILL.md`, byte-identical
`.claude/skills` mirror):** the proposals-JSON contract's `rule-candidate`
example now carries `title` and `governedGlobs` instead of `proposedTarget`
(dropped — Core computes it now); deleted the now-unnecessary step 6.5
hand-repair workaround (which re-derived this same frontmatter by hand at
review time) and renumbered the closing step.

**Tests:** `tests/atomic/insight/session-observe.test.ts` —
`ruleFilePayload` unit tests (frontmatter shape, `governs:` fallback,
on-disk `R-NNN` scanning); a new `rule-candidate in the typed pulse gate`
describe block mirroring `decision-candidate`'s, including the round-trip
the bug lacked: `cortex pulse-accept` against a project whose
`.cortex/compass/rules/` does not exist yet creates a schema-valid file that
passes `checkRules`/`checkProvenance`, two rule-candidates in one apply batch
land as distinct non-colliding `R-NNN` files, and an escaping target is still
refused. `tests/spec/insight/session-observe.spec.test.ts` — the "gated
convention" AC test updated for the new target/payload shape, plus the same
empty-`rules/`-dir round-trip and two-candidates-no-collision cases at the
spec layer. `validateObserveCandidate`'s tolerant title/governedGlobs
handling gets its own test. Full suite green (`pnpm test`, 1125 passed).
</content>
