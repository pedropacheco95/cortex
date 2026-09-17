---
id: B-020
title: Every archive-ingestion `promotion` is refused at `pulse-accept` — the accept path still enforces the v2.0 "Source must name an insight file" rule that schema 3.0 retired for this type
type: wrong-rule
severity: high
status: resolved
affects:
  - insight.promotion-mechanism
  - archive.ingest-skill
  - pulse.review-cli
  - src/pulse/promote.ts
  - src/pulse/review.ts
  - cortex-schema.md §4.5 (Source field clause) vs §4.5.1 (promotion row)
  - skills/cortex-archive-ingest/SKILL.md
proposed_fix: >-
  Resolve the schema's own contradiction first (needs Pedro - RULES 4): §4.5's
  Source clause ("For promotion, MUST include the insight file being promoted",
  unchanged since 2.0) must follow §4.5.1's 3.0 row, which names archive ingestion
  as the producer, the originating artefact as the source, `provenance:` as the
  lineage, and says the insight trailer "has no v3.0 equivalent". Then correct
  insight.promotion-mechanism Rule 5 and Rule 6 (which govern src/pulse/promote.ts)
  to the same effect: a promotion's Source names the artefact it derives from - an
  archive `extracted/` file (the 3.0 producer) or, while pulse.distil Rule 7 still
  graduates insight entries, an insight anatomy entry; accept lands the payload and
  the `source:`/`provenance:` back-reference to whichever it is, stamps the promoted
  trailer only when the source is an insight entry, and refuses transactionally only
  when the named source path does not exist. Replace AC "A promotion lands the gated
  write, the lineage, and the promoted marker" with two ACs (insight-sourced with
  trailer; archive-sourced without), keep the missing-source AC, and add the
  archive-sourced accept to archive.ingest-skill's criteria so the producer and the
  gate are tested end to end. Then fix the code: in promote.ts extend
  extractInsightSource into a source resolver that also matches
  `(\.cortex/)?archive/documents/<slug>/...\.md` and returns which kind it found;
  planPromotion makes insightAbs/nextInsight optional; review.ts writes the insight
  file only when present. Retire the v2.0 `.cortex/insight/map/` wording from the
  refusal message. Also retire the v2.0 producer note in the spec's Notes
  ("insight.gaps-loop") and re-point the spec's business parent, since
  insight.corrections-and-memory-reach-persistence promises insight-prose
  graduation, which 3.0 removed (schema §4.10 note). Rule-19 report must list:
  the accept path's Source check, the refusal message, the trailer side-effect
  condition, and any check.pulse change if the validator gains a Source-shape check.
found_at_commit: 2b217df
opened: 2026-09-17T11:30:00Z
resolved: 2026-09-17T15:30:00Z
---

# B-020 — archive-ingestion promotions are refused by the v2.0 insight-source rule

## Evidence

Reported by the orchestrator 2026-09-17: `cortex pulse-accept S-029` (and S-030,
S-031, all written by `cortex-archive-ingest` into
`.cortex/pulse/reports/archive-ingestion.md` with `**Type:** promotion` and
`**Source:** cortex-archive-ingest — archive/documents/parallel-wave-brief-2026-09-14/extracted/…`)
exited 1 with:

```
Refusing promotion S-029: **Source:** must name the insight file being promoted (.cortex/insight/map/<topic>.md or an anatomy entry .md).
```

Workaround applied the same day: the three sections were retyped by hand to
`user-directed-capture` and accepted. That is why the report now shows them as
`user-directed-capture`, `accepted`.

Reproduced twice against the installed binary (pnpm shim → this repo's `dist/`,
schema 3.4, commit 2b217df):

1. **At the component boundary.** `planPromotion` from `dist/pulse/promote.js`,
   called with S-029's exact Source string and target, and with S-031's (a create
   into `atlas/stakeholders/`), returns `ok: false` with the message above for both.
   The wrong value first appears here: `extractInsightSource` (promote.ts:40-50)
   matches only `insight/(map|anatomy|scopes/<s>/anatomy)/…\.md`, returns `null`
   for an `archive/documents/…` path, and `planPromotion` (promote.ts:96-102) turns
   that `null` into the refusal before any other check runs.
2. **End to end.** Fresh `HOME=<tmp> cortex init --no-llm --yes` project under the
   session scratchpad (`promo-repro/`, deleted afterwards), one promotion section
   with `**Source:** cortex-archive-ingest — archive/documents/doc-a/extracted/evidence.md`
   and `**Target:** .cortex/atlas/stakeholders/someone.md`, `**Proposed file:**`
   carrying `provenance: - derives_from: …`. `cortex pulse-list` shows it as a
   well-formed pending proposal. `cortex pulse-accept S-001` prints the same
   refusal, exit 1, creates nothing, leaves the section `pending`. `cortex validate`
   raises **no** `check.pulse` finding on the section (its two errors are the
   deliberately incomplete archive fixture).

So the validator accepts what the accept path refuses: the proposal is conformant
to §4.5.1 (type, target root, payload shape) and unacceptable to `pulse-accept`.

Reviewed for recency: `src/pulse/promote.ts` last changed at `32e3bd4`
(session-observe, added the anatomy alternation) and was written at `94a5bc0` (the
2.0 promotion mechanism). The schema clause it implements — §4.5 "For `promotion`,
MUST include the insight file being promoted" (line 513) — dates from `1ccdbd5`
(schema 2.0) and has not been touched since. The §4.5.1 row that redefines the type
(line 529: "v2.0: `insight-gaps` (retired); v3.0: **archive ingestion** — proposes
new gated compass/atlas content drafted from an ingested document … inject a
`source:` back to the originating artefact; the v2.0 'mark the insight original
promoted' trailer has no v3.0 equivalent — a v3.0-derived promotion would cite its
origin via `provenance:`") landed at `8aecc36` (schema 3.0 cleanup). Nothing this
week caused it; the code has been wrong for this producer since the producer was
declared.

## The chain that broke

1. Schema 3.0 (`8aecc36`) rewrote §4.5.1's `promotion` row: producer = archive
   ingestion, source = the originating artefact, lineage = `provenance:`, no insight
   trailer. It left §4.5's field-line clause (line 513) at its 2.0 wording. The
   contract now contradicts itself on what a promotion's Source is.
2. `insight.promotion-mechanism` (governs `src/pulse/promote.ts` and
   `src/pulse/review.ts`) was written at 2.0 (`94a5bc0`) and never revised for 3.0
   beyond the pulse-directory move (`577ff08`). Its Rule 5 still says "The
   `**Source:**` of a `promotion` MUST name the insight file being promoted (schema
   §4.5)", Rule 6 makes a missing insight source a transactional refusal, AC S-055
   asserts the trailer, and the Notes still name the retired `insight.gaps-loop` as
   the producer.
3. `promote.ts` implements Rule 5 faithfully: `extractInsightSource` recognises
   only insight paths; the refusal text even still advertises
   `.cortex/insight/map/<topic>.md`, a directory the 3.x layout no longer has.
   `review.ts:637-651` calls it for every `promotion` and returns 1 on refusal.
4. `archive.ingest-skill` (spec) and `skills/cortex-archive-ingest/SKILL.md`
   (steps 3-4, lines 155-235) follow §4.5.1: they instruct `**Type:** promotion`
   with `**Source:** cortex-archive-ingest — archive/documents/<slug>/extracted/<file>`
   and `provenance:` in the payload, and explicitly forbid `rule-candidate` and
   `decision-candidate` for this purpose. Neither the spec nor the skill says what
   accept will do with that Source, and neither has a criterion that exercises
   accept.
5. `check.pulse` (`src/schema/checks/pulse.ts`) validates type, target root and
   payload shape only — it has no Source-shape check — so the split between
   producer and gate surfaces only when a human runs `pulse-accept`.
6. `pulse.distil` Rule 7 (`src/pulse/distil.ts:438-561`, `insightFileCovering`)
   still emits insight-sourced promotions from `insight/anatomy/**` entries, which
   the current accept path serves. It is the reason the fix cannot simply swap one
   source shape for the other: two producers, two source kinds.

## Why `wrong-rule` and not `incomplete-rule` or `layer-drift`

Diagnostic tree, node 1: a dev spec governs — `insight.promotion-mechanism`
declares `governs: src/pulse/review.ts, src/pulse/promote.ts`, and its Rules 5-6 are
exactly the behaviour observed. Node 2: does the spec have a rule covering this
case? **Yes** — Rule 5 applies to every `promotion`, and it is the rule that
produces the refusal. Node 3: is the rule correct? **No.** It pins a source shape
that the contract's newer, more specific clause (§4.5.1 at 3.0) replaced: at 3.x a
promotion is archive-derived, its lineage is `provenance:`, and the insight trailer
"has no v3.0 equivalent". The rule is not silent on the case (Type 2) — it actively
rejects the input the contract now prescribes. That is a wrong rule (Type 3).

Not `layer-drift` (Type 6): the business parent
`insight.corrections-and-memory-reach-persistence` (journey step 4, business rules
4-5) and the dev spec agree with each other and with the code — all three describe
2.0 insight-prose graduation. The drift is between the whole spec column and the
schema, not between the two spec trees. It is worth naming, though, that the
business promise itself was retired by schema 3.0's §4.10 note ("`insight/` is no
longer human-promotable prose"), so the fix round must re-home this dev spec under
a business spec that still holds (the archive module's), not just edit Rule 5.

Not `test-defect` (Type 7): `tests/spec/pulse/promotion-mechanism.spec.test.ts`
(S-055, S-056) correctly encodes Rule 5 as written.

**Type 3 needs a human call.** Two readings are possible and Pedro must pick one,
because either way a schema clause changes (RULES 4; specs and schema need
approval):

- **(a) §4.5.1 is right, the §4.5 clause and Rule 5 are stale.** A promotion's
  Source is the artefact it derives from; accept takes archive sources; the trailer
  applies only to insight sources while distil still produces them. This is the
  reading the archive skill, the ingest spec and the 3.0 design (§8.2) already act
  on. Recommended.
- **(b) the §4.5 clause is right, the §4.5.1 row is aspirational.** Then archive
  ingestion may not emit `promotion` at all, and `archive.ingest-skill` plus the
  skill must be corrected to a type whose accept semantics exist. This contradicts
  the row's "not orphaned" language and leaves archive ingestion with no create
  path (only `user-directed-capture`, which misstates provenance and widens the
  permitted roots to `insight/`).

**Severity high, not critical.** Nothing is destroyed, and the retype workaround
lands the content in minutes. But the archive module's entire yes-path — its reason
to exist — cannot pass the gate as specified, the validator says the proposals are
conformant while the gate says they are not, and the workaround edits a proposal's
type by hand, which defeats "what was shown is what lands" (review-cli Rule 3) and
records a false provenance ("user-directed"). Same family and calibration as B-010
(a proposal type that could never be accepted): high.

## Drift check

`insight.corrections-and-memory-reach-persistence` ↔ `insight.promotion-mechanism`:
no drift between them; both are 2.0 and both lag the 3.0 contract (above).
`archive.documents-are-captured-and-authoritative` (the business parent of
`archive.ingest-skill`) is not contradicted by the dev spec; it is
under-delivered because the gate refuses the spec's output. No business spec needs
changing to file this bug; the fix round re-homes `insight.promotion-mechanism`.

## Reproduction

```
mkdir -p /tmp/p && cd /tmp/p && HOME=/tmp/ph cortex init --no-llm --yes >/dev/null
mkdir -p .cortex/pulse/reports .cortex/pulse/state .cortex/archive/documents/d/extracted
echo '# ev' > .cortex/archive/documents/d/extracted/evidence.md; echo 1 > .cortex/pulse/state/suggestion-counter
printf -- '---\nkind: pulse-archive-ingestion\ngenerated: 2026-09-17T10:00:00Z\nloop: cortex-archive-ingest\n---\n\n## S-001: T\n\n**Type:** promotion\n**Source:** cortex-archive-ingest — archive/documents/d/extracted/evidence.md\n**Target:** .cortex/atlas/stakeholders/x.md\n**Proposed file:**\n\n```\n---\nid: stakeholder.x\nname: X\nrole: r\n---\n\n# X\n```\n' > .cortex/pulse/reports/archive-ingestion.md
HOME=/tmp/ph cortex pulse-accept S-001; echo exit=$?     # Refusing promotion S-001: **Source:** must name the insight file … exit=1
```

Clean up `/tmp/p` and `/tmp/ph` afterwards.

### Change Plan

**Spec to modify:** `.specflow/specs/insight/promotion-mechanism.spec.md`
(Rules 5-6, AC "A promotion lands the gated write, the lineage, and the promoted
marker", AC "A promotion with a missing insight source refuses transactionally",
Notes, `implements:`), plus `.specflow/specs/archive/ingest-skill.spec.md` (one AC)
**Change type:** Correct existing rule + update criteria (Type 3), preceded by a
schema clause correction (Pedro's approval)

**Schema first (§4.5, line 513) — change from:**
"For `promotion`, MUST include the insight file being promoted."
**To:**
"For `promotion`, MUST name the artefact being promoted: an archive
`extracted/` file (`archive/documents/<slug>/extracted/<file>`, the 3.0 producer)
or an insight entry (`insight/anatomy/**`, `insight/scopes/<s>/anatomy/**`, the
distil graduation path, §4.5.1 note)."

**Change Rule 5 from:**
"… (b) inject a `source:` reference in the landed content pointing back at the
insight file it graduated from … (c) stamp the insight original with the promoted
trailer … The `**Source:**` of a `promotion` MUST name the insight file being
promoted (schema §4.5)."
**To:**
"… (b) inject a `source:` reference in the landed content pointing back at the
artefact named in `**Source:**` — an archive `extracted/` file (archive ingestion,
§4.5.1) or an insight entry (distil Rule 7); an archive-derived payload already
carries `provenance:` and the injected `source:` is the same path; (c) **only when
the source is an insight entry**, stamp it with the promoted trailer
`_(promoted <iso-date> → <gated-target-path> via S-NNN)_` — marking, never
deleting. A `**Source:**` naming neither kind is a refusal."

**Change Rule 6:** "… or a promotion whose named source file does not exist …".

**Update these criteria:**
- Replace "A promotion lands the gated write, the lineage, and the promoted marker"
  with two: *insight-sourced* (existing S-055 text, unchanged) and
  *archive-sourced*: **Given** `S-060 **Type:** promotion` with `**Source:**`
  naming `.cortex/archive/documents/brief/extracted/summary.md` (exists) and
  `**Target:** .cortex/atlas/stakeholders/coordinator.md` (create) **When**
  accepted **Then** the file is created carrying `source:` to that extracted file,
  no insight file is touched, exit 0.
- "A promotion with a missing insight source refuses transactionally" → "… with a
  missing source …", and add a sibling: a Source naming neither an archive nor an
  insight path is refused, exit 1, nothing written.
- `archive.ingest-skill`: add **Given** a promotion section written as the skill's
  step 4 template **When** `cortex pulse-accept` runs **Then** it lands (the
  producer's output is acceptable by the gate it targets).

**Cross-layer check:**
- Business spec `insight.corrections-and-memory-reach-persistence`: its promotion
  journey (step 4, rules 4-5) is 2.0 and no longer true at 3.x. Either re-point
  `implements:` of the dev spec to the archive business spec and trim the insight
  one, or record the retirement there. Pedro decides in the same round.

**Then:**
1. Coherence: Rule 5 must not reopen `.cortex/insight/` as a promotion *target*
   (S-057 stays); `user-directed-capture` remains the only insight-targeting type.
2. Regenerate atomic/spec tests for the changed criteria in
   `tests/spec/pulse/promotion-mechanism.spec.test.ts`; the archive-sourced one
   must fail today with the refusal above.
3. Fix `src/pulse/promote.ts`: rename/extend `extractInsightSource` to a source
   resolver returning `{ kind: 'insight' | 'archive', rel }`; `planPromotion`
   returns `insightAbs`/`nextInsight` as `null` for archive kind; update the refusal
   message (drop `insight/map/`). Fix `src/pulse/review.ts:637-651` to skip the
   insight write when null and print "promoted to <target>" without "marked the
   insight original".
4. Update `skills/cortex-archive-ingest/SKILL.md` step 5 to say the accept succeeds
   as written (and mirror to `.claude/skills/`).
5. Rule-19 report: enumerate the Source check, the refusal text, the trailer
   condition, the review.ts message, and any `check.pulse` addition.
6. `pnpm test:atomic` and `pnpm test:spec` for `pulse` and `archive`.

**Adjacent, not filed here:** `pulse.distil` Rule 7 (insight graduation → promotion)
exists in code (`distil.ts:438-561`) but the distil spec has no promotion rule; and
`check.pulse` could validate the Source shape per type so this class of split is
caught by `cortex validate` rather than at accept.

### Related

- B-010 (rule-candidate proposals from session-observe could never be accepted):
  the earlier instance of a producer and the gate disagreeing on a proposal's shape.
- B-014 (schema-version declaration lag): the same pattern of a 2.0 clause
  surviving a 3.0 rewrite.

### Resolution

Resolved 2026-09-17 in wave follow-up B (plan `plans/2026-09-17-wave-b.md`, Task 2.5), under
reading (a): schema §4.5.1 wins. Pedro approved the contract change in the same wave.

- **Schema:** §4.5's Source clause now names the artefact being promoted — an archive
  `extracted/` file or an insight anatomy entry (3.4 fifth revision, commit `85b7eb0`).
- **Spec:** `insight.promotion-mechanism` Rules 5–6 corrected; the single promotion AC split
  into insight-sourced (S-055, trailer stamped) and archive-sourced (S-060, no insight file
  touched); missing-source and neither-kind refusals kept (S-056, S-061). `archive.ingest-skill`
  gained the end-to-end criterion "an emitted promotion is acceptable by the gate it targets".
- **Code:** `src/pulse/promote.ts` — `extractInsightSource` replaced by
  `extractPromotionSource` returning `{ kind: 'insight' | 'archive', rel }`; `planPromotion`
  yields `insightAbs`/`nextInsight` as `null` for the archive kind and refuses an archive-sourced
  promotion whose target is outside `compass/` or `atlas/`; the refusal text no longer mentions
  `insight/map/`; `injectSourceFrontmatter` leaves a payload that already declares a top-level
  `source:` byte-identical (the skill's rule template carries one — the old injection produced a
  duplicate YAML key). `src/pulse/review.ts` writes the insight trailer only when present and
  prints `promoted to <target>` for the archive kind.
- **Tests:** `tests/atomic/pulse/promote.test.ts` (18), the promotion-mechanism spec slice
  (S-060 watched red with exactly the refusal above, then green), and
  `tests/spec/archive/ingest-skill.spec.test.ts` (the skill's step 4 template accepts end to end,
  registry gains the rule id, validate clean).
- **Not done here:** the business re-home of `insight.promotion-mechanism` (its parent still
  promises 2.0 insight-prose graduation) stays open for Pedro; `check.pulse` gained no
  Source-shape check (adjacent item above, unfiled).
