# Cortex Schema — The Contract Between Core and Skills

**Schema version:** `3.4`
**Status:** v3.0 draft for review by Pedro. This file is the **living contract** and is revised in place at each version — the v2.0 text is preserved in git history. (Unlike the design documents, which are frozen records.)
**Depends on:** `cortex-design.md` (the v1 design doc, frozen), `cortex-v2-design.md` (the v2 design doc, frozen), and `cortex-v3-design.md` (the v3 design doc). Where design and schema disagree, this document wins on file formats, frontmatter, cross-references, and versioning — that is its job. Where the design docs are silent or vague, this document **makes the decision** (see §0) rather than deferring.

**3.0 is a MAJOR bump** (§10.2): `cerebrum/` renames to `compass/` (rule/bug ids and their content-keyed constellation node prefixes are unchanged — the rename is path-only); `anatomy/` is removed, its content absorbed into `insight/`; `archive/` is added as a new module for ingested source documents (mixed git policy per-artefact); `insight/` is rebuilt wholesale — a leveled (L1–L4), scoped, per-file understanding of the codebase itself replaces the v2.0 concept-map-over-curated-artefacts layout; `provenance:`/`derives_from:` frontmatter is added to compass rules, both spec trees, and atlas decisions; decisions gain a single home (`atlas/decisions/` only — the `cerebrum/decisions.md`/`compass/decisions.md` artefact no longer exists); and the loop/scheduled-task roster changes (anatomy-refresh and the v2.0 insight-refresh/gaps pair retire; three insight-refresh tiers plus `cortex-loop-session-observe` take their place). Folded in from `cortex-schema-v3-addendum.md` at build-order-v3 step 1 (design §10.2) — see git history for the addendum's drafting record and the fold-in commit.

**3.1 is a MINOR bump** (§10.2 — additive, backward-compatible: a new artefact kind): one addition — `insight/observations/`, the session-learned **project-context observation** surface (a directory of themed entry files, each carrying an importance signal derived from frequency and emphasis — revised in place from an earlier single-file draft, no project having shipped on it), written ungated by `cortex-loop-session-observe` under the same machine-owned-ungated allowance as its per-file enrichments (§4.10.11; layout §1; Decision 13), plus its validator check `check.insight-observations` (Appendix A). Nothing existing is removed, renamed, or made required; a `3.0` project validates clean under a `3.1` validator per §10.2, and no migration ships.

**3.3 is a MINOR bump** (§10.2 — additive, backward-compatible): the process-profile pair. `cortex.config.json` gains `profile` (§10.1), the process-profile selector, with its `check.config` enum validation; and the SessionStart pointer block gains a conditional **entry line** (§5) that re-arms the process gate, emitted only under the `specflow` profile with `specflow-entry` installed. One feature, two surfaces — revised in place while unreleased, the same allowance 3.1 took. The key is **optional with a default**, so a config predating it validates clean and behaves exactly as before. Nothing existing is removed, renamed, or made required, and no migration ships.

**3.3, second revision in place (unreleased).** Taking the same allowance again, 3.3 also gains two separately-budgeted SessionStart sections — the **coverage map** (≤1,800 tok), a generated table of contents for the project's knowledge layer, and the **rationalization table** (≤250 tok) — and the insight-injection stance is widened, once and narrowly, to permit insight **concept names** (names only, never bodies or per-file entries) inside that map. §5 carries the payload shape, the budgets, and the measurement that motivated the widening: `pulse.usage` over 55 sessions of this repo found 2 `cortex insight` invocations in total, 0 for `concept` and `element`, 76 searches into `.cortex/`, and one invocation of a verb that does not exist. Both sections are **omit-when-empty** and each is its own pool, so a project predating them renders exactly as before and a project with an empty `.cortex/` sees nothing added. Nothing is removed, renamed, or made required, and no migration ships. The CLAUDE.md block (§8) correspondingly **loses** its insight-query mandate, which the same measurement showed was followed twice in 55 sessions — a removal, so §8's acknowledged budget overage shrinks rather than grows. *(No version constants move: 3.3 is unreleased, so this revision lands inside it — the B-014 three-way version agreement stays green.)* **Both sections — and the §8 mandate removal that rode with them — were retired unbuilt at the 3.4 fourth revision** by atlas decision `2026-09-16-session-start-coverage-injection-retired`; this note is kept as the record of what was specified.

**3.3, third revision in place (unreleased; recall work, step 1).** Taking the same allowance a third time, 3.3 also gains the **session record and threads ledger** under `pulse/` (§4.5.3; layout §1): a `SessionEnd` hook (§5) that writes one deterministic `pulse/sessions/<session-id>.json` per session and opens or answers `pulse/threads/T-NNN-<slug>.md` entries from their own `state/thread-counter`, a tiny `Stop` companion hook that keeps the last assistant message in `pulse/state/sessions/<session-id>.last.json` because the transcript may lag at `SessionEnd`, scratchpad copies under `pulse/scratch/<session-id>/`, the `cortex thread` verbs, and hygiene's second sanctioned deletion (records, scratch and orphaned companion files older than 30 days; threads expire in place). Two validator deltas: a new `check.threads` and `check.hook-config` learning the `SessionEnd` and `Stop` rows (Appendix A). Both hooks **inject nothing**; nothing existing is removed, renamed, or made required; `cortex init` scaffolds none of the new directories (created on demand); and no migration ships — a project that never fires the hook is byte-identical to before. The `bears_on` field on threads is named here ahead of its formal §6 entry, which is the step-2 MINOR (3.4). *(No version constants move — same reasoning as the second revision.)*

**3.4 is a MINOR bump** (§10.2 — additive, backward-compatible; recall work, step 2). One idea, five surfaces: the citation graph gains its first **forward** edge, `bears_on` (§6) — from a conclusion (an atlas decision, an atlas evidence file, a pulse thread, an insight observation) to the subject it constrains (a compass rule, a spec, a domain term, an insight concept, a clause of this document, or a file) — whose inverse (`decided_by`, `evidenced_by`, `threads_on`) is **computed, never stored**, exactly as the provenance backward index is (§6, A6). Clauses of this document become **addressable** as `schema:§N[.M[.K]]` (§6.2). A new atlas artefact kind, **evidence** (`atlas/evidence/YYYY-MM-DD-<slug>.md`, §4.3), records a measurement, experiment or audit as gated, committed knowledge with typed findings, so a decision cites a durable record rather than a transient `pulse/` report; it is produced by the human verbs `cortex usage --record` and `cortex thread promote --to atlas/evidence`, and by loops only through the new `evidence-candidate` suggestion type (§4.5.1). A compiled, regenerable, gitignored **recall index** (`.cortex/recall-index.json`, §4.11; layout §1; Decision 1) materialises three entailment rules over `bears_on` so a later hook reads one JSON file instead of walking frontmatter. Validator deltas (Appendix A): new `check.evidence`, `check.bears-on`, `check.recall-index`; `check.atlas` gains two decision warnings; `check.pulse` learns the seventh type; `check.layout` and `check.insight-observations` learn one optional surface each. **Nothing existing is removed, renamed, or made required** — the only new required frontmatter is on the new evidence kind itself; a `3.3` project validates clean under a `3.4` validator per §10.2; `cortex init` gains one gitignore line and the empty `atlas/evidence/` directory on fresh projects, existing projects gain that directory on demand from its first producer; and no migration ships (§10.4). This bump moves the version constants (B-014's three-way agreement, `schema.version-2` Rule 8): step 2 was approved as a MINOR in its own right rather than a fourth in-place revision of 3.3, because it is the first revision that adds a required-frontmatter artefact kind and a §6 row — the kind of change §10.2 names a MINOR for.

**3.4, second revision in place (unreleased; recall work, step 3).** Taking the in-place allowance (atlas decision 2026-07-10) while 3.4 is unreleased, the index gains its **consumers** — four, all read-only, all reading `.cortex/recall-index.json` and never frontmatter (§4.11): a new `PreToolUse` hook on `Grep|Bash`, `cortex hook search-annotate`, that matches the search's target path and pattern tokens against the index and injects at most two **pointer lines** (§5 — the grammar is recorded there once: `Recall: …` and `Decided: …`, names, ids, dates and paths; never a body, never an imperative), ≤60 tokens, on a match only; the `PreToolUse` (Read) row amended with a one-line **recall marker** for reads of a spec, a compass rule, an atlas decision or evidence file, or this document (≤50 tokens, extending the PreRead budget to a combined ceiling rather than opening a new pool — RULES.md rule 11); the verbs `cortex why <ref>` and `cortex recall <query>`; and a **generated block** in `atlas/decisions/_index.md` and `atlas/evidence/_index.md` written by `cortex scan` and `cortex init` under a `recall` variant of §8's marker idiom (§7.1). One validator delta, no new check id: `check.hook-config` learns the `Grep|Bash` row (Appendix A). Nothing existing is removed, renamed, or made required; a project that never fires the hook or runs `scan` is byte-identical to before; no migration ships. *(No version constants move — same reasoning as the 3.3 in-place revisions.)*

**3.4, third revision in place (unreleased; recall work, step 4).** Taking the in-place allowance once more while 3.4 is unreleased, two additions and one carve-out. (1) A new `UserPromptSubmit` hook, `cortex hook prompt-route` (§5), that matches the human's prompt against **open threads only** (§4.5.3 — the ledger gains its first direct consumer; the recall index is not read, because it lacks a thread's kind and status) and injects at most two **`Open:` pointer lines** — the grammar block in §5 gains its third shape — on a session's first prompt (the previous interactive session's hanging question) or on a prompt that names a thread; ≤60 tokens, on a match only, sharing the search hook's per-session fired memory. (2) `cortex.config.json` gains `hooks.readDefer` (§10.1; boolean, default **false**; init writes it explicitly) and the `PreToolUse` (Read) row gains a **deferral mode** (§5 row (d)): when the flag is on, the *first* Read of a source file with an insight entry may be answered with `permissionDecision: deny` carrying the entry's Purpose and Connections (≤250 tokens) in place of the read; the second Read always proceeds; never for gated files or scheduled sessions; one deferral per session per file, 25 per session, fail-open — shipped **for measurement** (`pulse.usage` Rule 13, "Read deferrals", whose four counts join the usage evidence findings), not as policy. This is the **one carve-out** from the envelope rule below and from RULES.md rule 6, and it is default-off, so a project that never sets the flag sees exactly the 3.4 second-revision behaviour. Validator deltas, no new check id: `check.hook-config` learns the `UserPromptSubmit` row; `check.config` learns `hooks.readDefer` (type, and a warning when set with `hooks.preRead: false`) (Appendix A). Nothing existing is removed, renamed, or made required; no migration ships. *(No version constants move — same reasoning as the 3.3 in-place revisions.)*

**3.4, fourth revision in place (unreleased; a retirement).** The two SessionStart sections the 3.3 second revision specified — the **coverage map** (≤1,800 tok) and the **rationalization table** (≤250 tok) — and the concept-names widening of the insight-injection stance that rode inside the map are **removed from §5** (the SessionStart row, the payload shape, the budgets, and the two rationale paragraphs), by atlas decision `2026-09-16-session-start-coverage-injection-retired` (Pedro, 2026-09-16). Neither section was ever implemented, so no project rendered them and no project changes behaviour; the SessionStart payload is exactly its 3.1 shape — pointer block plus observations digest — and the insight-injection stance in §4.10 and §5 reverts to that one exception. Coverage is delivered instead by the 3.4 second- and third-revision consumers (the PreRead recall marker, the search-time pointer, the generated atlas index blocks, `cortex why`/`recall`, and the open-thread prompt router). The dev specs `scaffolding.coverage-map` and `scaffolding.rationalization-table` are retired in place with a banner; `hooks.session-start` Rules 10 and 11 become retired stubs. **Nothing is added, nothing is made required, no validator check changes, and no migration ships.** The idea is parked, not rejected — the decision's "Revisit when" section names the reopening conditions. *(No version constants move — same reasoning as the earlier in-place revisions.)*

**3.4, fifth revision in place (unreleased; wave follow-up B, 2026-09-17).** Taking the in-place allowance once more, from the parallel-wave brief (`.cortex/archive/documents/parallel-wave-brief-2026-09-14/`; asks A-06, A-08, A-11, A-12, A-14, A-15) — six additions, all optional or regenerable, nothing removed, renamed or made required. (1) The **compass layer joins the recall carriers** (§4.11): rules bear on the directories and files their `governs` globs name and on their `related_specs`; `open`/`triaged` bugs bear on their `affects` (a fourth entailment rule — resolved bugs contribute nothing); the four compass documents are keyword-only entries built from their headings and bold spans. Subjects gain `rules` and `bugs`; the `kind` enum gains `rule | compass-doc | bug`; the pointer grammar gains no shape — `Recall: <kind>` carries the new kinds and the PreRead marker gains a `Bugs:` part (`hooks.pre-read-writeback` Rule 6; §5's grammar block is amended by its owner). (2) **Bugs as the currently-true surface** (§4.2): optional `owner`, `fix_in_flight`, `found_at_commit`; `triaged` now means owned with a fix in flight; Core writers stamp `found_at_commit` from `.git/HEAD` by file I/O (`compass.bug-currency`). (3) An **id registry** (`compass/registry.md`, §4.1, §4.2, §10.4, `schema.id-registry`): every `R-NNN`/`B-NNN` is issued by appending one line, so parallel branches conflict in git instead of colliding silently; `cortex id next rule|bug`; `check.id-registry`; `cortex sync` creates it once from the files on disk. (4) **Visibility** (§10.1, `schema.visibility`): `visibility.repo` (`public|private|unknown`, default `unknown`) and `check.visibility`, a line-level warning for operational specifics in tracked compass and atlas files when the repo is public — RULES.md rule 20. (5) The **CLAUDE.md block** (§8) names dispatching, reviewing and planning sessions in its protocol, gains one generated placement paragraph, and loses the insight mandate the 3.3 second revision already recorded as removed. (6) `placement.localNotesDir` (§10.1, optional) feeds that paragraph. Validator deltas (Appendix A): new `check.id-registry`, `check.visibility`; `check.bug` learns three optional fields (shape only); `check.recall-index` learns two optional subject lists and three kinds; `check.config` learns `visibility` and `placement`. *(No version constants move — same reasoning as the earlier in-place revisions.)*

**3.2 is a MINOR bump** (§10.2 — additive, backward-compatible: a new artefact kind): one addition — `archive/intent-register.yaml`, the frozen-intent-anchor register (§4.4.3; Fork 2 of the 2026-08 superpowers-absorption round), plus its validator check `check.archive-intent-register` (Appendix A). The file is **optional**: a project without one validates clean. Nothing existing is removed, renamed, or made required; a `3.0` or `3.1` project validates clean under a `3.2` validator per §10.2, and no migration ships.

This is the load-bearing artefact named in design §3.2. **Cortex Core implements it; Skills consume it; both reference it by version** (recorded in `.cortex/cortex.config.json`, §10). It is precise enough that the schema validator (`.specflow/specs/schema/validator.spec.md`) can be implemented mechanically from it.

Conventions used in this document:

- **MUST / SHOULD / MAY** carry their usual normative force. A `MUST` violation is an `error`; a `SHOULD` violation is a `warning`.
- "Frontmatter" means a YAML block delimited by `---` at the very top of a markdown file.
- "Validated by" names the validator check that enforces a rule. The validator is the single mechanical enforcer; loops (`specflow-lint`, `specflow-verify`) layer additional non-schema checks on top.

---

## 0. Decisions made where the design doc was vague

These were underspecified or contradictory in `cortex-design.md`. Each was **locked** at schema v1.0 and carries forward unchanged into 2.0 and 3.0 (the v2.0 additions are in §0.1; the v3.0 additions are in §0.2). Override any of them and the dependent sections change.

1. **Git policy: §14 wins over §13.2.** Design §13 step 2 says "append `.cortex/` to `.gitignore`"; §14 says cerebrum and atlas (minus sources) are committable. These contradict. **Decision:** `cortex init` gitignores the specific regenerable/sensitive/transient paths only — `.cortex/anatomy/`, `.cortex/atlas/sources/`, `.cortex/pulse/`, and `.cortex/constellation.json` (compiled, regenerable — §4.9) — never the whole `.cortex/`. `.cortex/cortex.config.json`, `.cortex/cerebrum/`, and `.cortex/atlas/` (minus `sources/`) are committed. (§1, §10) **v2.0 amendment:** `.cortex/insight/` is committed in full — including the machine-regenerated `map/*.json` — adding the fourth git-policy quadrant: machine-owned *and* committed (v2 design §3.3; diff-noise mitigations in §4.10.2 (v2.0)). The gitignored set is unchanged. **v3.0 amendment:** `.cortex/anatomy/` no longer exists — the module is removed, its content absorbed into `insight/` (§4.10; the RULES.md gitignore note for it retires with anatomy deprecation, build-order-v3 step 7). `.cortex/cerebrum/` renames to `.cortex/compass/` — same committed git policy, path only (§4.1, §4.2). `.cortex/archive/` is added with a **fifth, mixed** git policy — committed and gitignored *within the same module*, per-artefact: `_index.md`, `register.md`, `documents/*/metadata.yaml`, `documents/*/extracted/`, and `types/` are committed; `documents/*/source.*` is gitignored (raw source may be sensitive — same treatment as `atlas/sources/`). (§4.4) **3.4 amendment:** `.cortex/recall-index.json` (compiled, regenerable — §4.11) joins the gitignored set, in the same quadrant as `constellation.json`; the committed set is unchanged, and the new `atlas/evidence/` directory is committed with the rest of atlas (§4.3).

2. **One global spec-ID namespace; no tree prefix.** Design §8.2 shows `covers: [business.auth.secure-account-access]` (a `business.` prefix) while the business-spec template uses bare `id: auth.secure-account-access`. **Decision:** all spec IDs — dev and business — live in **one global namespace, are bare (no `business.`/`dev.` prefix), and MUST be globally unique.** `depends_on:` and `covers:` reference bare IDs. The `business.` prefix from §8.2 is dropped. (§4.6, §4.7, §6)

3. **Schema version is project-level, not per-artefact.** Design implies artefacts might each declare a version. **Decision:** the version is declared **once**, in `.cortex/cortex.config.json` (`schemaVersion`). Individual artefacts do **not** carry a version field; they inherit the project version. The validator reads `cortex.config.json` to know which contract to enforce. (§10)

4. **`covers:` completeness is NOT a schema-validator concern.** The validator checks that every `covers:` entry *resolves*. The constraint "every business spec appears in ≥1 scenario's `covers:`" (§8.2) is a **verification-pass** check owned by `specflow-verify` (design §11.4), because it is a project-completeness assertion, not a per-file conformance rule. (§3, §6, and reflected back into `validator.spec.md`)

5. **`anatomy/files.md` is markdown frontmatter + a table.** Design never fixes the format. **Decision:** a YAML frontmatter header (anatomy-level metadata) followed by one markdown table row per file. List-valued cells (`spec_links`) are space-separated bare IDs. (§4.1, v1.0) **Superseded at v3.0:** `anatomy/` is removed; the per-file understanding this decision shaped now lives in `insight/`'s per-file entries (§4.10.2), which are markdown frontmatter + prose sections rather than a table — a materially richer format, not a renamed table. This decision is preserved for historical continuity; it governs nothing at v3.0.

6. **`loop.md` lives at the project root and is optional.** Design §11 names it for `/loop` integration but never specifies it. **Decision:** `cortex init` MAY write a root `loop.md` (off unless `cortex.config.json` `loop.enabled` is true). Format in §9. (§9)

7. **Confidence enum is `STATED | EXTRACTED | INFERRED`.** Design §9.2 shows `confidence: EXTRACTED` with no enum. **Decision:** those three values; optional on compass and atlas artefacts; absent means `STATED`. (§4.1, §4.3)

8. **ID prefixes and padding:** rules `R-NNN`, bugs `B-NNN`, pulse suggestions `S-NNN` — `-` plus a zero-padded integer, **minimum 3 digits**, monotonic per project, never reused. Atlas decisions are dated slugs (`YYYY-MM-DD-slug`), not `D-NNN`. (§4.1, §4.3)

9. **Timestamps are ISO-8601 UTC** with a trailing `Z` (e.g. `2026-06-30T14:00:00Z`). (everywhere)

10. **Two index kinds, named distinctly.** `_index.md` = an **active prompt** (every `.cortex/` directory, plus `.specflow/specs/_index.md` which is the dependency/build index). `_overview.md` = a **folder overview** (every directory in `specs/` and `specs-business/`). A directory never needs both except the `specs/` root, which has `_index.md` (engineering index) and its domains have `_overview.md`. (§2, §7)

11. **Every `*.spec.md` is treated as a leaf for the single-`implements:` rule.** The leaf-vs-aggregate distinction is not encoded in the path, so `check.dev-spec`/`check.xref-*` apply the "exactly one `implements:`" requirement to every dev spec file. Domain/capability aggregate specs that legitimately omit `implements:` are permitted per §4.6, but if `implements:` is present it MUST be single-valued. (surfaced from the validator build; enforced at §4.6, §6, Appendix A `check.dev-spec`)

12. **A MAJOR schema-version mismatch short-circuits all other checks.** When `cortex.config.json` declares a MAJOR above (or below) the validator's supported MAJOR, the validator emits the single `check.config` error (§10.3) and runs no further checks — it does not validate against the wrong contract. (surfaced from the validator build; enforced at §10.3, Appendix A `check.config`)

### 0.1 Decisions locked at v2.0

Where `cortex-v2-design.md` left an open question that this contract must commit on, the recommended disposition (approved with the design doc) is adopted and **marked** here.

13. **The loop-write invariant is restated: a loop never mutates gated content.** Compass, atlas, `RULES.md`, and both spec trees change only through the human gate (`pulse-accept`) or under direct human review; machine-owned ungated state (v2.0: anatomy, `insight/map/*.json`) is maintained directly by its designated owner loop; ungated observational content (v2.0: `insight/map/*.md`, plus the one file-list line in `insight/_index.md`) is written directly by its designated producer, with provenance. This supersedes v1's "writes only to `.cortex/pulse/`" phrasing and retires its growing exception list (test-runner and bug-triage keep their narrow, reported exceptions per their specs). (v2 design §4.4, flags F1/F6; §9) **v3.0 amendment:** anatomy no longer exists; the machine-owned-ungated allowance re-points wholly to `insight/` (§4.10) — the three insight-refresh loops maintain it directly, and `cortex-loop-session-observe` writes ungated per-file enrichments and project-context observations (`insight/observations/`, §4.10.11 — new at 3.1) directly while proposing any gated compass/atlas content through the pulse gate (never mutating gated content itself). (design §9; addendum A7.3)

14. **Cluster ids are label-slugs with carry-over matching (OQ1 disposition).** `cluster:<label-slug>`; a full rebuild reuses an existing cluster's id and label when member-set Jaccard ≥ `insight.clusterCarryOverJaccard` (default 0.5; highest match wins, ties broken by id order). (§4.10.2, v2.0) **v3.0 note:** the exact cluster-representation and carry-over nuances for the rebuilt v3.0 `clusters.json` (§4.10.6) are addendum-deferred to the insight storage-format spec (design §10.3, §11 Q1; addendum A4.6, A10.1) — this decision's Jaccard-carry-over *principle* is the starting point, not yet re-locked for the new shape.

15. **"Stabilized" — promotion eligibility — is mechanical (OQ3 disposition):** ≥ `insight.promotionMinAgeDays` (default 14) in insight AND ≥ `insight.promotionMinObservations` (default 2) independent session observations — or one distil repetition detection (v2 design §6) — AND no correction since the last observation. (§4.10.4, §10.1, v2.0) **v3.0 note:** the v2.0 `promotion` mechanism this decision tuned (insight prose "stabilizing" into a gated artefact, with a promoted-trailer marker) has no v3.0 equivalent — `insight/` is no longer human-promotable prose (§4.10 is rebuilt wholesale). The `promotion` pulse-suggestion type is retained per addendum A7.4 — not repurposed for insight, whose v3.0 producer is archive ingestion instead (design §8.2); see §4.5.1.

16. **Correction tracking is a bottom `## Corrections` log, and corrections rewrite prose in place (OQ6 + OQ7 dispositions).** The correcting writer rewrites the contradicted text in place and appends the log entry in the same write; frontmatter stays lean. (§4.10.1, v2.0) **v3.0 note:** v2.0's prose `insight/map/*.md` files (and their `## Corrections` log) no longer exist; `check.insight-prose` is removed (Appendix A). The v3.0 per-file entry (§4.10.2) has no equivalent correction log — a session-observed correction to an insight entry is simply a direct rewrite of the relevant section, with `claude-sessions/*` provenance (A6) on the entry, per `cortex-loop-session-observe` (§9; addendum A7.3).

17. **Inferred-edge confidence enum is `high | medium | low`** — deliberately not Decision 7's provenance enum: every inferred edge is INFERRED by definition; what varies is inference strength. (§4.10.2, v2.0) **Superseded at v3.0** by Decision 25 (§0.2): the rebuilt `graph.json` (§4.10.6) uses a 4-tier `structural | stated | inferred | ambiguous` enum tied to evidence *kind*, not inference *strength* (addendum A10-5). This decision is preserved for historical continuity; it governs nothing at v3.0.

18. **Suggestion sections are typed, and the pulse gate gains edit semantics.** `**Type:**` is required (absent → `rule-candidate` with a warning, v1-era tolerance); an **edit** payload shape (current content + replacement, match-byte-exact-or-refuse) joins append and create; `Target:` roots extend beyond compass and new-skill paths to `.cortex/atlas/`, `.cortex/insight/`, and `RULES.md`, constrained per type. (§4.5; resolves v2 design flag F3) **v3.0 amendment:** the typed enum gains `decision-candidate` (target root `.cortex/atlas/decisions/`, addendum A7.4) — see §4.5.1.

19. **The §10.4 migration is waived for 1.0→2.0 only.** No external users; the Cortex repo itself moves as part of the v2 build. The policy stands in full for every future MAJOR. (§10.4; v2 design flag F5) **v3.0 confirmation:** no waiver applies at 2.0→3.0 — the migration policy of §10.4 applies in full; mechanics are owned by the module-migration spec (build-order-v3 step 2), per addendum A10.0.

20. **Left open, with landing sites:** rationale-sidecar vs committed rationale text (OQ4 — v2.0 concern, moot at v3.0 now that `graph.json` edges carry `evidence`, not `rationale`, and are rebuilt wholesale, §4.10.6); gaps-loop window semantics, watermark vs wall-clock (OQ5 — v2.0's `insight-gaps` is retired at v3.0, replaced by `cortex-loop-session-observe`, §9; window semantics for the new loop are a spec-pass detail, addendum A7.1); root SpecFlow artefacts moving under `.specflow/` (OQ8 — a later MINOR/MAJOR; they stay at the project root at 3.0).

### 0.2 Decisions locked at v3.0

Where `cortex-v3-design.md` explicitly left a concrete shape open beyond what it directed the addendum to specify, the addendum's disposition is adopted and **marked** here (addendum §A10.1, flags A10-1 through A10-7).

21. **Archive document-type schema shape (A10-1).** `archive/types/*.yaml` declares `id` / `label` / `classification{extensions,hints,explicit}` / `extraction{strategy,outputs[{kind,path,item_pattern}]}` (§4.4.2) — design §6.1/§6.3 left this "sketched, not specified"; the addendum specifies it here.

22. **Insight staleness ledger storage shape (A10-2).** Stored as `insight/ledger.json`, complementing the per-entry `built_at_commit`/`source_sha256` frontmatter on each per-file entry (§4.10.2, §4.10.4) — design §5.8/§5.9 required a shape and deferred it to the addendum.

23. **Insight reverse-dependency index storage shape (A10-3).** Stored as `insight/reverse-index.json` — a `referenced_by` map from entity node id to every concept/edge citing it (§4.10.5) — design §5.9 required a shape and deferred it to the addendum.

24. **`edge_type` enumerated closed set (A10-4).** `imports | calls | semantically-similar-to | implements-concept | co-clustered` (§4.10.6) — design §5.11 named the primitives, not the enum; extending the set is a MINOR bump.

25. **`confidence` discrete 4-tier enum (A10-5).** `structural | stated | inferred | ambiguous`, each tied to a named evidence type (§4.10.6) — deliberately differs from v2.0's `high | medium | low` (Decision 17), which graded inference *strength* on edges that were all INFERRED by definition; v3.0's tiers grade *kind of evidence*.

26. **`tags.json` structured vocabulary (A10-6).** A typed vocabulary with `tag.kind` enum `concern | technology | pattern | layer | domain-term` (§4.10.6) — design §1.3/§5.11 named "structured tags as a first-class store"; the vocabulary schema is chosen here.

27. **Insight node-id grammar (A10-7).** `file:<relpath>` / `element:<relpath>#<name>` / `concept:<slug>` — path-derived, deliberately distinct from v2.0's constellation-borrowed grammar (§4.10.6) — design §5.11 required "deterministic path-derived IDs"; the exact prefixes are chosen here.

**Explicitly deferred (not decided at v3.0, per addendum A10.1):** cluster-representation carry-over/stability nuances for the rebuilt `clusters.json` → insight storage-format spec (design §10.3, §11 Q1); confidence-aging threshold N and significance-triage tuning → insight-refresh loop spec; 2.0→3.0 migration mechanics → module-migration spec (§10.4, build-order-v3 step 2); v3.0 `cortex.config.json` blocks for `insight`/`archive` → their respective specs (§10.1); whether a v3.0 insight constellation preset is added → open (design §11 Q2, §4.9).

---

## 1. The `.cortex/` directory layout

`cortex init` creates this skeleton. Every directory MUST contain an `_index.md` active prompt (§7). `[committed]` / `[gitignored]` marks the default git policy (Decision 1); `archive/` mixes both per-artefact within the module (Decision 1 v3.0 amendment, §4.4).

```
.cortex/
├── cortex.config.json          [committed]   project config + schemaVersion (§10)
├── constellation.json          [gitignored]  compiled citation graph for the renderer (§4.9)
├── recall-index.json           [gitignored]  compiled recall index — subjects → what was decided, measured, left open (§4.11; new at 3.4)
├── _index.md                   [committed]   root active prompt — names the five modules
├── compass/                    [committed]   rules, conventions, bug ledger (§4.1–4.2) — the renamed cerebrum
│   ├── _index.md
│   ├── preferences.md                        project conventions (stack, formatting)
│   ├── environment.md                        operational pointers — never secrets
│   ├── do-not-repeat.md                      index of recurring-mistake rules
│   ├── standing-authorities.md               default decisions Claude holds without asking
│   ├── registry.md                           append-only list of every issued R-NNN / B-NNN (3.4 fifth revision, §4.1, `schema.id-registry`)
│   ├── conventions/                          project conventions (design §3)
│   ├── bugs/                                  the unified bug ledger
│   │   ├── _index.md
│   │   └── B-001-<slug>.md
│   └── rules/                                one file per rule
│       ├── _index.md
│       └── R-001-<slug>.md
├── atlas/                      [committed]   project knowledge base (§4.3)
│   ├── _index.md
│   ├── stakeholders/
│   │   ├── _index.md
│   │   └── <slug>.md
│   ├── decisions/                             the SOLE home for decisions (no compass/decisions.md, §4.3)
│   │   ├── _index.md
│   │   └── YYYY-MM-DD-<slug>.md
│   ├── domain/
│   │   ├── _index.md
│   │   └── <term>.md
│   ├── evidence/                              measurements, experiments, audits — the durable record a decision cites (§4.3; new at 3.4)
│   │   ├── _index.md
│   │   └── YYYY-MM-DD-<slug>.md
│   └── sources/                [gitignored]  raw materials (may be sensitive)
│       ├── _index.md
│       └── <slug>.<ext>
├── archive/                    [mixed]*      ingested source documents + extractions (§4.4)
│   ├── _index.md               [committed]   active prompt (§7.1 shape)
│   ├── register.md             [committed]   human-readable index of all documents
│   ├── documents/
│   │   └── <slug>/
│   │       ├── source.<ext>    [gitignored]  verbatim source (*the mixed-policy exception)
│   │       ├── metadata.yaml   [committed]   per-document metadata (§4.4.1)
│   │       └── extracted/      [committed]   everything extracted from the source
│   └── types/                  [committed]   document-type schemas (§4.4.2)
├── insight/                    [committed]   inferred understanding of the codebase itself (§4.10) — anatomy absorbed
│   ├── _index.md                             active prompt (§7.4)
│   ├── scope-registry.yaml                   scope tree (scoped extractions only, §4.10.3)
│   ├── ledger.json                           staleness ledger (§4.10.4)
│   ├── reverse-index.json                    reverse-dependency index (§4.10.5)
│   ├── observations/                         session-learned project context — grain-of-salt, ungated, themed entry files (§4.10.11, new at 3.1; absent until the loop's first observation)
│   │   ├── _index.md
│   │   └── <theme>.md                        e.g. audience.md, scale.md, deployment.md, working-style.md, stated-intent.md
│   ├── scopes/                               present only for scoped extractions
│   │   └── <scope>/
│   │       ├── anatomy/                      per-file entries within the scope
│   │       ├── concepts/                     scope-local concepts
│   │       └── graph.json                    scope-local semantic graph
│   ├── anatomy/                               per-file entries (unscoped extractions, or not owned by any scope)
│   ├── concepts/                              concepts (global, or scope-local under scopes/<scope>/)
│   ├── graph.json                            cross-scope/cross-file semantic graph (§4.10.6)
│   ├── tags.json                              global structured tag vocabulary (§4.10.6)
│   └── clusters.json                          global cluster assignments (§4.10.6)
└── pulse/                      [gitignored]  transient loop outputs (§4.5) + insight extraction plan/progress (§4.10.10)
    ├── _index.md                             active prompt (the ONLY _index.md here; subdirs are exempt, §7.1)
    ├── suggestions.md                        the gate — S-NNN proposals (persists)
    ├── dismissed.md                          rejection memory (persists)
    ├── reports/                              one .md per loop, overwritten each run (§4.5)
    ├── state/                                machine working state — counters (suggestion-counter, thread-counter), worklists, reads/<session-id> ledgers, sessions/<session-id>.last.json Stop companions (§4.5)
    ├── sessions/                             one <session-id>.json session record per ended session (§4.5.3; created on demand by the SessionEnd hook)
    ├── threads/                              T-NNN-<slug>.md threads ledger (§4.5.3; created on demand)
    ├── scratch/                              <session-id>/<basename> copies of scratchpad artefacts (§4.5.3; created on demand)
    └── extraction/                           insight-extraction plan/progress/l1/fragments (§4.10.10)
```

`.cortex/anatomy/` and `.cortex/cerebrum/` no longer exist at v3.0. The five modules are atlas, compass, archive, insight, pulse (design §3). The two spec trees live under **`.specflow/`** at the project root (v2 design §9); the test tree stays directly at the project root. Neither lives under `.cortex/`: `.specflow/specs/`, `.specflow/specs-business/`, `tests/`. They are covered in §2 and §3.

**Validated by** `check.layout`: every directory listed above (when its module is present) exists and carries the required `_index.md`; `pulse/` (including its `reports/`, `state/`, `state/reads/`, `extraction/`, and `extraction/fragments/` subdirectories — machine-managed, `_index.md`-exempt per §7.1, resolving B-008) and `archive/documents/*/extracted/` contents beyond the fixed names are tolerated (transient/generated); `insight/`'s two layouts — scoped (with `scope-registry.yaml` + `scopes/`) and unscoped (flat `anatomy/`) — are both valid (§4.10.1). `atlas/evidence/` (new at 3.4) is **present-tolerant** like the module directories: `cortex init` scaffolds it on fresh projects, an existing project gains it (with its `_index.md`) on demand from the first producer, and its absence is never a finding — so a `3.3` project validates clean at `3.4`. Every new-module check (`check.archive-*`, `check.insight-*`) tolerates its module being entirely absent, so a project that has not yet run archive ingestion or insight extraction still validates clean at schema 3.0.

---

## 2. `.specflow/specs/` and `.specflow/specs-business/` conventions

From design §8.1; re-rooted under `.specflow/` at v2.0 (v2 design §9, §2.3 below). Both trees are three conceptual levels: **domain → capability → leaf**. Only **leaf** specs are implementable. `.specflow/` contains exactly the two trees — no wrapper docs of its own.

### 2.1 Layout

```
.specflow/specs/                    # developer specs (implementation contract)
├── _index.md                       # ACTIVE PROMPT + dependency graph & build order (§7.2)
├── _overview.md                     # folder overview of the whole dev tree
└── <domain>/
    ├── _overview.md
    ├── <capability>/
    │   ├── _overview.md
    │   └── <leaf>.spec.md
    └── <leaf>.spec.md              # a leaf MAY sit directly under a domain (e.g. schema.validator)

.specflow/specs-business/           # business specs (user-outcome layer)
├── _overview.md
└── <domain>/
    ├── _overview.md
    └── <persona-journey>.business.md
```

### 2.2 Rules

- Every directory in **both** trees MUST contain an `_overview.md` (design §6; folder-overview format in §7.3). **Validated by** `check.overview-present`.
- The `.specflow/specs/` root additionally MUST contain `_index.md` (§7.2). **Validated by** `check.index-present`.
- Domain dirs: lowercase, hyphenated. Capability dirs: lowercase, hyphenated.
- Dev leaf files: `<leaf>.spec.md`. Business files: `<persona-journey>.business.md`, the name starting with the persona doing the action (business-spec template).
- **IDs follow the path within the tree.** `.specflow/specs/auth/registration/email-signup.spec.md` → `auth.registration.email-signup` — the `.specflow/specs/` tree root is stripped before deriving the ID, so IDs are unchanged by the v2.0 re-rooting. A leaf directly under a domain → `<domain>.<leaf>` (e.g. `schema.validator`). **Validated by** `check.id-matches-path`.
- Capability folders with leaves are RECOMMENDED; a leaf directly under a domain is permitted when the domain has a single cohesive unit. No per-leaf subfolders.

### 2.3 The v2.0 re-rooting (what changed, what didn't)

Moved at 2.0: `specs/` → `.specflow/specs/`; `specs-business/` → `.specflow/specs-business/`. `tests/` deliberately stays at the project root — test runners, CI globs, and coverage tooling assume root-level test paths (v2 design §9.1). The root SpecFlow artefacts (`RULES.md`, `build-order.md`, `link-map.md`, `implicit-behaviors.md`, `dead-features.md`) also stay at the project root (Decision 20 / OQ8).

**Invariant under the move:** spec IDs (path-derived within the tree, §2.2); every ID-form cross-reference (`depends_on`, `covers`, `governed_by`, `related_specs`); the `implements:`/`implemented_by:` relative paths (both trees moved together, so the relative geometry between them is identical); and `governs:` globs (project-root-relative pointers at *source* files).

**Changed:** every project-root-relative reference *to* the trees — validator, compiler, and loop discovery roots; the CLAUDE.md template (§8); skill instruction text. The mechanical path-constants rewrite across the specflow skills ships **in the reorganization round** (v2 design §9.4, flag-F4 resolution); the insight-query skill enrichment remains a separate follow-up pass.

**Migration:** none ships for 1.0→2.0 (Decision 19; §10.4 waiver). For schema completeness: a re-rooting under the normal policy would ship a `cortex migrate` move plus deprecation markers at the old roots per §10.4.

---

## 3. `tests/` tree layout

From design §8.2. Four layers. Test files are TypeScript (`*.test.ts`, per the project stack).

```
tests/
├── _overview.md
├── setup/                          # harness, container/db setup, smoke tests
├── fixtures/                       # factories + seeds
├── atomic/<domain>/<capability>/<leaf>.test.ts      # 1 per Given/When/Then, mocked
├── spec/<domain>/<capability>/<leaf>.test.ts        # 1 per dev leaf spec, integrated slice
├── journey/<business-domain>/<outcome>.test.ts      # 1 per business spec, real infra
└── scenario/
    ├── specs/<name>.md             # scenario spec: frontmatter `covers:` (§4.8)
    └── <name>.test.ts              # full-sandbox cross-journey test
```

| Layer | Scope | Infra | Count | Verifies |
|---|---|---|---|---|
| Atomic | 1 criterion | Mocked | 1 per Given/When/Then | One behaviour in isolation |
| Spec | 1 dev spec | Integrated slice | 1 per dev leaf | Rule interactions, entity writes, completeness (not criteria replay) |
| Journey | 1 business spec | Real containers | 1 per business spec | End-to-end user journey |
| Scenario | Many business specs | Full sandbox | Enough to cover all | Cross-journey workflows |

- The **schema validator** checks: scenario specs carry a well-formed `covers:` whose entries resolve (§4.8). **Validated by** `check.covers-resolves`.
- The **coverage-completeness** constraint (every business spec appears in ≥1 scenario's `covers:`) is **out of schema scope** — owned by `specflow-verify` (Decision 4).
- `verification.md` is written to `.cortex/pulse/reports/`, **not** `tests/` (design §8.5).
- `tests/` remains at the **project root** — deliberately not moved under `.specflow/` (§2.3).

---

## 4. Frontmatter contracts per file type

All artefacts that carry frontmatter use a leading `---`-delimited YAML block. Unknown fields are a `warning` (forward-compat tolerance), missing required fields an `error`. Field types: `string`, `enum`, `list<T>`, `path` (relative path string), `id` (bare dot/dash ID), `glob`, `int`, `iso-datetime`, `sha256` (64 hex chars).

### 4.1 `compass/rules/R-NNN-<slug>.md`

**Required:** `id` (`R-NNN`), `title` (string), `source` (list<path> — atlas decisions, bug files, and/or [v2.0-legacy] insight prose files justifying the rule; the insight-prose form referenced the v2.0 `promotion` lineage, §4.5.1, which has no v3.0 insight equivalent — see §4.10 note), `governs` (list<glob> — project file paths the rule applies to). **Optional:** `related_specs` (list<id>), `confidence` (enum `STATED|EXTRACTED|INFERRED`, default `STATED`), `check` (the machine-checkable predicate, below), `status` (enum `active|retired`, default `active`), `provenance` (list<{derives_from: path}> — this rule's derivation from an archive document, an atlas decision, or a Claude Code session; optional, absence means "authored directly"; §6, addendum A6).

**`check` predicate** (optional; the testable subset of a rule):
```yaml
check:
  kind: regex | grep | ast | none      # default none
  applies_to: <glob>                    # files the check runs over (defaults to governs)
  pattern: <string>                     # regex / grep / tree-sitter query
  expect: absent | present              # whether pattern presence is a pass or a violation
```

```markdown
---
id: R-014
title: No camelCase database columns
source:
  - ../../atlas/decisions/2026-04-12-db-naming.md
  - ../bugs/B-031-camelcase-column.md
governs:
  - "src/db/**/*.ts"
related_specs:
  - core-cli.scan
confidence: EXTRACTED
check:
  kind: regex
  applies_to: "src/db/**/*.ts"
  pattern: "\\b[a-z]+[A-Z][a-zA-Z]*\\s*:\\s*(text|integer|boolean)"
  expect: absent
---

# R-014 — No camelCase database columns

Columns MUST be snake_case. … (body: rationale, examples, exceptions)
```

A rule MAY additionally carry `provenance:` (§6, addendum A6) when it derives from an archived source document or a Claude Code session — distinct from `source:` above, which cites the atlas decision/bug that motivates the rule's *content*. A rule deriving from a decision cites it via `provenance: - derives_from: atlas/decisions/<slug>.md` rather than restating it (§4.3).

**PreWrite consumption note.** The PreWrite hook (§5) consumes rules in two modes: a rule with an evaluable `check:` predicate (`regex`/`grep`) warns **only when the predicate fires** on the proposed content; a rule without one (`check` absent, or `kind: none`/`ast`) warns **on `governs` path match**. Authors: give a rule an evaluable predicate whenever the constraint is mechanically checkable — it eliminates path-match noise on conforming writes.

**Validated by** `check.rule`: `id` matches `R-NNN` and filename; `source` paths resolve (§6); `governs` globs well-formed; `related_specs` IDs resolve; if `check` present, `kind` in enum and (`pattern` required unless `kind: none`); if `provenance` present, each entry resolves per `check.provenance` (§6, addendum A6).

**Id allocation (3.4 fifth revision).** `R-NNN` is issued by appending one line `R-NNN <slug>` to the append-only registry **`compass/registry.md`** (committed; header text, then rules ascending, then bugs ascending; `schema.id-registry` Rule 1) — by `cortex id next rule`, by `cortex pulse-accept` landing a new rule file, or by hand. The registry exists so that two branches allocating the same next number conflict in git rather than pass `cortex validate` as two files with one id (B-019). **Validated by** `check.id-registry` (Appendix A): a rule file whose id is on no registry line → `error`; a registry line with no file → `warning`; the registry absent while rule or bug files exist → `warning` naming `cortex sync` (§10.4). A rule is also a **recall carrier** (§4.11): its subjects derive from `governs` and `related_specs`; it needs no `bears_on`.

### 4.2 `compass/bugs/B-NNN-<slug>.md`

The one-file-per-bug ledger (design §4.2, §2 seven-type taxonomy).

**Required:** `id` (`B-NNN`), `title` (string), `type` (enum, below), `severity` (enum `critical|high|medium|low`), `status` (enum `open|triaged|resolved`), `affects` (list — spec IDs, file paths, or rule IDs; resolution by shape, §6). **Optional:** `proposed_fix` (string), `opened` (iso-datetime), `resolved` (iso-datetime), `related_specs` (list<id>); **3.4 fifth revision (`compass.bug-currency`):** `owner` (string — who holds it), `fix_in_flight` (string — a branch, PR URL or commit where the fix lives while unmerged), `found_at_commit` (string, `/^[0-9a-f]{7,40}$/` — the commit the observation was made against; Core writers stamp it from `.git/HEAD` by file I/O, never by spawning `git`). Absent means unknown, never none. **`triaged` means owned with a fix in flight** — `owner` and `fix_in_flight` both set; classification alone is the `type` field and leaves a bug `open`. The three fields are the "what is known-broken right now, who owns it, is a fix in flight" surface the parallel-wave brief asked for (§3.2); the recall index carries `open`/`triaged` bugs to the files and specs they `affects` (§4.11) and `cortex why` prints the three fields.

**`type` enum (the seven types, design §2):**

| value | design type |
|---|---|
| `missing-criterion` | 1. dev spec exists but lacks an AC for this case |
| `incomplete-rule` | 2. a rule is stated but doesn't cover the behaviour |
| `wrong-rule` | 3. a rule is wrong as written |
| `missing-dev-spec` | 4. no dev spec covers this case |
| `missing-business-spec` | 5. no business spec captures the outcome |
| `layer-drift` | 6. dev/business specs contradict, or impl drifted from spec |
| `test-defect` | 7. spec is right; the test layer is the problem |

```markdown
---
id: B-031
title: camelCase column slipped into migrations
type: wrong-rule
severity: medium
status: triaged
affects:
  - R-014
  - src/db/schema.ts
proposed_fix: Tighten R-014 check to cover migration files.
opened: 2026-06-28T09:00:00Z
---

# B-031 — camelCase column slipped into migrations

(body: diagnostic evidence, reproduction, the chain that broke)
```

**Validated by** `check.bug`: `id` matches `B-NNN` and filename; `type`/`severity`/`status` in enum; every `affects` entry resolves by shape (R-ID → rule, path → file, else → spec ID); (3.4 fifth revision) `owner` and `fix_in_flight`, when present, are strings and `found_at_commit`, when present, matches its pattern — shape only, no cross-field rule. **Id allocation** is the registry's (`compass/registry.md`, §4.1, `schema.id-registry`): `cortex thread promote --to compass/bugs`, `cortex id next bug` and the specflow-bugs skill append `B-NNN <slug>` there; `check.id-registry` errors on a bug file whose id is on no line.

### 4.3 Atlas artefacts

All atlas leaf files carry minimal frontmatter. **Common optional:** `confidence` (enum, §4.1 of decisions), `related_specs` (list<id>), `sources` (list<path> into `atlas/sources/`).

- **`atlas/decisions/YYYY-MM-DD-<slug>.md`** — **the sole home for decisions** (`compass/decisions.md` does not exist, addendum A2.1). **Required:** `id` (`decision.<YYYY-MM-DD>-<slug>`), `title`, `date` (iso-datetime). **Optional:** `supersedes` (list<path>), `compass_rules` (list<id> — rules derived from this decision; the forward half of the citation, the rule's `provenance` being the backward half, addendum A2.2), `provenance` (list<{derives_from: path}> — this decision's own derivation from an archive document or a Claude Code session; optional), `bears_on` (list of mixed refs, 0..n — **new at 3.4**, §6: the subjects this decision constrains — rules, specs, domain terms, insight concepts, schema clauses, files; resolved by shape, the gated shapes at `error`), plus the common optionals. Body: the narrative ("on DATE we chose X because Y — see source Z"). A compass rule deriving from a decision does **not** restate it — it cites it via the rule's own `provenance` field (§4.1). Two decision **warnings** (new at 3.4, `check.atlas`): a decision with no `bears_on` — "decision bears on nothing; add bears_on" — because a decision nothing points forward from is a leaf nothing reaches (the 3.4 note's motivating measurement: `atlas/decisions/` was read 0 times in 41 sessions); and a decision whose `sources:` entry resolves under `.cortex/pulse/` — "cites a transient report; record it as evidence" — because pulse reports are overwritten every run and the citation will dangle.
- **`atlas/evidence/YYYY-MM-DD-<slug>.md`** — **new at 3.4**: the durable record of a measurement, experiment or audit, so that a number a session once computed (a usage figure, a follow rate, an audit count) is gated, committed, citable knowledge rather than a line in a transient report or a pruned transcript. **Required:** `id` (`evidence.<YYYY-MM-DD>-<slug>`, equal to the filename stem prefixed `evidence.`), `title`, `date` (iso-datetime), `kind` (enum `measurement | experiment | audit`), `instrument` (string — what produced the numbers, e.g. `pulse.usage`, `session`, `cortex validate`), `window` (map: `from` and `to` iso-dates or datetimes, optional `sessions` integer — the denominator), `findings` (non-empty list of `{ metric: string, value: number | string, unit?: string }`), `bears_on` (non-empty list of mixed refs, §6 — what the finding is about; typically a spec id and a schema clause). **Optional:** `supersedes` (list<path> to earlier evidence files — the re-measurement chain; the superseded file is dropped from the recall index's `evidence` in favour of its superseder, §4.11), `provenance` (as decisions), plus the common optionals. Body: the narrative — how it was measured, what to compare against. Decisions cite evidence through their `sources:` field (a relative path into `atlas/evidence/`), and the recall index carries that evidence forward to every subject the decision bears on (§4.11 Rule 3). **Producers:** `cortex usage --record` (human-invoked, writes the file directly — the same standing as `pulse-accept` and `thread promote`, `pulse.usage` Rule 12); `cortex thread promote T-NNN --to atlas/evidence` for a `finding` thread of kind measurement (§4.5.3; `atlas.evidence`); and, for loops, only the `evidence-candidate` suggestion type through the pulse gate (§4.5.1) — a loop never writes `atlas/evidence/` directly (RULES 7). Every producer creates `atlas/evidence/` and its `_index.md` from the shipped template when absent. Owned by `atlas.evidence`.
- **`atlas/stakeholders/<slug>.md`** — **Required:** `id` (`stakeholder.<slug>`), `name` (string), `role` (string). **Optional:** `org`, `contact_pointer` (a pointer, never a secret), common optionals.
- **`atlas/domain/<term>.md`** — **Required:** `id` (`domain.<term>`), `term` (string), `definition` (string). **Optional:** `aliases` (list<string>), `related_specs`.
- **`atlas/sources/<slug>.<ext>`** — raw material; **no frontmatter required** for non-markdown. A sibling `<slug>.meta.md` MAY carry `id` (`source.<slug>`), `kind` (enum `transcript|rfp|slack|pdf|design-doc|other`), `captured` (iso-datetime), `origin` (string). (v3.0 note: new ingestion through `archive/` — §4.4 — is the preferred path going forward for anything with a declared document type; `atlas/sources/` remains valid for ad hoc captures, addendum A9 build-order step 9 re-homes the atlas-only `cortex-ingest` skill into `archive/` later.)

**Validated by** `check.atlas`: `id` matches the per-kind pattern and the filename; `date`/`captured` ISO; `supersedes`/`sources` paths resolve; `compass_rules`/`related_specs` IDs resolve; if `provenance` present, each entry resolves per `check.provenance` (§6, addendum A6); (3.4) the two decision warnings above. **Validated by** `check.evidence` (new at 3.4, `error`): every file under `atlas/evidence/` other than `_index.md` carries the evidence frontmatter above — `id` shape and filename agreement, `date` iso, `kind` in enum, `instrument` a non-empty string, `window.from`/`window.to` iso, `window.sessions` a non-negative integer when present, `findings` a non-empty list whose every entry has a string `metric` and a number-or-string `value` (and a string `unit` when present), `bears_on` a non-empty list of strings, `supersedes` entries resolving to files under `atlas/evidence/`; the generic `check.atlas` pass (id present, `supersedes`/`sources` resolve) still runs over these files and is not repeated here. `bears_on` resolution on decisions and evidence is `check.bears-on`'s (§6). `_index.md` shape is `check.index-shape`'s; the directory being absent is tolerated (§1).

### 4.4 The `archive/` module (new at v3.0)

Design §6. Ingested source documents and the structured content extracted from them. Git policy is **mixed within the module** (Decision 1 v3.0 amendment): `_index.md`, `register.md`, `documents/*/metadata.yaml`, `documents/*/extracted/`, and `types/` are `[committed]`; `documents/*/source.*` is `[gitignored]` (raw source may be sensitive — same treatment as `atlas/sources/`, design §6.6).

Layout (full tree in §1):

```
.cortex/archive/
├── _index.md                              [committed]  active prompt (§7.1 shape)
├── register.md                            [committed]  human-readable index of all documents
├── documents/
│   └── <slug>/
│       ├── source.<ext>                   [gitignored] verbatim source (pdf/md/docx/txt/…)
│       ├── metadata.yaml                  [committed]  machine-readable per-document metadata (§4.4.1)
│       └── extracted/                     [committed]  everything extracted from the source
│           ├── <output-kind>/…                          per the document type's extraction contract (§4.4.2)
│           └── summary.md
└── types/                                 [committed]  document-type schemas (§4.4.2)
    ├── client-spec.yaml
    ├── contract.yaml
    ├── meeting-transcript.yaml
    └── …
```

Superseded document versions are **preserved, not deleted** — kept as sibling `documents/<slug>/` directories with `metadata.yaml` `status: superseded` (design §6.2, §6.5). `<slug>` is lowercased-hyphenated, unique within `documents/`. `register.md` is free markdown (no frontmatter contract beyond §4.5's general pulse-adjacent header conventions do not apply here — it is a committed, human-maintained index, not a transient loop report). `archive/_index.md` follows the general §7.1 active-prompt shape; no dedicated filled example is given here (mirrors how `atlas/` has none) — **validated by** `check.index-shape`.

**Validated by** `check.archive-layout`: every `documents/<slug>/` carries a `source.*`, a `metadata.yaml`, and an `extracted/` directory; `_index.md` and `register.md` present; `types/` present.

#### 4.4.1 `archive/documents/<slug>/metadata.yaml`

A standalone YAML file (not markdown frontmatter — it is machine-readable metadata, per design §6.2).

```yaml
id: archive.<slug>                 # required — archive.<slug>, matches the directory
kind: <type-id>                    # required — an id declared in archive/types/ (§4.4.2)
ingested_at: <iso-datetime>        # required
version: <string>                  # required — the document's own version label (e.g. "v2.0", "2026-01-08")
status: active | superseded        # required
supersedes:                        # optional — path(s) to prior versions under documents/
  - documents/<prior-slug>/
source_filename: <string>          # optional — the original filename of source.<ext>
origin: <string>                   # optional — provenance of the source (who sent it, where from)
```

**Validated by** `check.archive-metadata`: `id` matches `archive.<slug>` and the directory; `kind` resolves to a `types/<kind>.yaml`; `ingested_at` ISO; `version` and `status` present; `status` in enum; `supersedes` paths resolve.

#### 4.4.2 `archive/types/*.yaml`

Design §6.1/§6.3 left this sketched, not specified. This schema specifies a concrete minimal shape (Decision 21 / addendum A10-1): a type file declares a **type id**, **classification hints** the ingestion skill routes on, and the **extraction-output contract** the type produces. Adding a document type means adding a `types/<id>.yaml`, never editing the `cortex-archive-ingest` skill (design §6.1, extensibility invariant).

```yaml
id: client-spec                    # required — the type id; == filename stem; used as metadata.yaml `kind`
label: Client specification        # required — human label for register.md and prompts
classification:                    # required — how the skill routes to this type
  extensions: [.pdf, .docx, .md]   #   optional — candidate source extensions
  hints:                           #   optional — lexical/structural signals for content-inference
    - "requirement"
    - "the client shall"
  explicit: true                   #   optional — whether a user may declare this type by name (default true)
extraction:                        # required — the extraction-output contract this type declares
  strategy: <strategy-id>          #   required — the extraction routine the skill runs for this type
  outputs:                         #   required — one or more declared extraction outputs
    - kind: requirements           #     required — output kind (skill-defined vocabulary)
      path: extracted/requirements/  #   required — where under extracted/ it lands (dir or file)
      item_pattern: "GT-<SRC>-NNN-<slug>.md"  # optional — naming pattern for per-item extractions
    - kind: summary
      path: extracted/summary.md
```

**How the skill routes on it (design §6.3, §6.4 steps 2–4):** the ingestion skill reads all `types/*.yaml`; if the user declared a type, it selects that type's file directly; otherwise it infers the type by matching source content/extension against each type's `classification.hints`/`extensions`. The selected type's `extraction.strategy` chooses the extraction routine; the type's `extraction.outputs` are the **contract** for what lands under `documents/<slug>/extracted/` and where. The atlas-only extraction re-homed from `cortex-ingest` (design §6.6) is one such strategy (`strategy: atlas`, outputs: stakeholders / decisions / domain-terms), routed on the atlas-shaped types.

**Validated by** `check.archive-type`: valid YAML; `id` == filename stem; `label` present; `classification` present with at least one of `extensions`/`hints` (or `explicit: true`); `extraction.strategy` present; `extraction.outputs` non-empty; each output has `kind` and an `extracted/`-relative `path`.

#### 4.4.3 `archive/intent-register.yaml` (new at v3.2)

Plan `plans_and_handoffs/plans/2026-08-03.md` §0.5 / Phase 4.1 (Fork 2). Spec-derived tests remain the durable contract; a verbatim user statement ("the password needs one uppercase") is pinned by a **frozen intent-anchor test** that is *retired* once a spec-derived test demonstrably subsumes it. The register is where retired anchors go — a **thin changelog over the citation graph**: it records the words the user said, where that intent landed, and which spec test now covers it. It does **not** hold copies of tests, and it is never a second test suite.

A standalone YAML file (like `metadata.yaml`, §4.4.1 — machine-readable data, not prose), committed, sibling of `register.md`. `register.md` indexes ingested *documents*; this file indexes stated *intents*. The two are deliberately separate artefacts with separate names.

```yaml
entries:
  - id: IR-001                      # required — IR-NNN, unique within the file
    stated_intent: "..."            # required — the user's words, verbatim, never paraphrased
    date: 2026-08-04                # required — ISO date (YYYY-MM-DD) the intent was stated
    stakeholder: <string>           # optional — who stated it
    anchor_test: <string>           # required — the frozen anchor test, as `<path>::<test name>`
    status: pending | reconciled | flagged   # required
    landing: <string>               # required unless `pending` — where the intent landed:
                                    #   a dev-spec id, optionally `#<criterion-heading>`, or a
                                    #   compass rule id (`R-NNN`)
    covering_spec_test: <string>    # required when `reconciled` — the spec-derived test that
                                    #   subsumes the anchor, as `<path>` or `<path>::<test name>`
    flagged_bug: <string>           # required when `flagged` — the bug id (`B-NNN`) filed because
                                    #   the spec generalised the ask away
```

**The status machine.** `pending` → the anchor is written and RED, reconciliation has not run. `reconciled` → a spec-derived test subsumes the anchor; the anchor is retired (deleted from the suite, preserved here as words). `flagged` → no spec test covers the stated ask, so the spec generalised it away; a missing-criterion bug is filed and named here. `pending` is the only status that may lack a `landing`; the two terminal statuses each require their own evidence field, which is what makes the register auditable rather than decorative.

**Reconciliation is a Skill, not Core** (plan §0.5): deciding whether a spec test *subsumes* an anchor is semantic judgment, and Core makes no LLM calls (RULES 3). Core validates the shape and that the links resolve; `specflow-intent-reconcile` (§4.4.3 consumer, `specflow.intent-reconcile` dev spec) decides what the entries say.

**Validated by** `check.archive-intent-register` (§4.4.3, error): file absent → tolerated (the register is optional); valid YAML with an `entries` list; each `id` matches `IR-NNN` and is unique; `stated_intent`, `date` (ISO `YYYY-MM-DD`), `anchor_test`, and `status` present; `status` in enum; `landing` present unless `pending`, and resolving — a dev-spec id via the project index (with its `#<criterion-heading>` matching an `### ` heading in that spec when given), or a compass rule id resolving to `compass/rules/R-*.md`; `covering_spec_test` present when `reconciled` and its `<path>` existing on disk; `flagged_bug` present when `flagged` and resolving to `compass/bugs/B-*.md`.

### 4.5 `pulse/` artefacts

Transient; gitignored. `pulse/` is organised into three machine-managed subdirectories plus the two persistent gate files at its root:

```
pulse/
├── _index.md                    the only _index.md here — subdirs are exempt (§7.1, B-008)
├── suggestions.md               the gate — S-NNN proposals (persists across runs)
├── dismissed.md                 rejection memory (persists across runs)
├── reports/                     one .md per loop, overwritten each run
│   ├── hygiene.md  bug-triage.md  spec-drift.md  insight-refresh.md
│   ├── session-observe.md  rule-candidates.md  atlas-review.md
│   ├── scaffolding-review.md  lint.md  verification.md  test-failures.md
│   └── hook-errors.md           append-not-overwrite, capped at 100 (§4.5.2)
├── state/                       machine working state (dotfiles → dots dropped)
│   ├── suggestion-counter       the single authoritative S-NNN allocator
│   ├── thread-counter           the single authoritative T-NNN allocator (§4.5.3; its own namespace)
│   ├── distil-last-run  session-corpus.json  session-observe-state.json
│   ├── *-worklist.json          per-loop worklists (triage / session-observe / insight-refresh tiers)
│   ├── readback-applied
│   ├── reads/<session-id>       per-session read ledgers (hygiene deletes those >14 days old)
│   └── sessions/<session-id>.last.json   Stop-companion: last assistant message per live session (§4.5.3; consumed and deleted by SessionEnd; orphans deleted by hygiene >30 days)
├── sessions/<session-id>.json   session records, one per ended session (§4.5.3; hygiene deletes those >30 days old)
├── threads/T-NNN-<slug>.md      the threads ledger (§4.5.3; never deleted — expired in place)
├── scratch/<session-id>/        copies of scratchpad artefacts (§4.5.3; deleted with their record)
└── extraction/                  insight-extraction (§4.10.10)
    ├── plan.md  progress.md  l1.json
    └── fragments/<scope-id>.json
```

`suggestions.md` and `dismissed.md` stay at the pulse root; every loop report lands under `reports/`; all machine working state lands under `state/`; the insight-extraction artefacts land under `extraction/`; session records, threads and scratch copies (3.3 third revision, §4.5.3) land under `sessions/`, `threads/` and `scratch/`. The machine-managed subdirectories do NOT carry their own `_index.md` (§7.1 carve-out, resolving B-008 — only `pulse/` itself has one). `cortex init` scaffolds `reports/`, `state/`, `state/reads/`, and `extraction/` empty on day one so the organised layout exists before any loop runs — `sessions/`, `threads/` and `scratch/` are **not** scaffolded; the SessionEnd hook creates them on first use, so a project that never fires it is byte-identical to before; upgrading an existing flat `pulse/` renames the live artefacts into these subdirectories and **deletes** known orphans from retired loops (e.g. `.purpose-worklist.json` from the retired anatomy-refresh-deep loop) rather than moving them.

Each loop output is markdown with a minimal header. **Always-write convention:** every loop writes its output file on **every** run, overwriting, with a fresh `generated` timestamp — when there is nothing to report, the body carries an explicit "No candidates this cycle." (or loop-appropriate phrasing) rather than an empty or untouched file. The pulse directory is thereby self-documenting: any `pulse/reports/*.md` tells the reader when its loop last ran and what it found or didn't. **Required:** `kind` (string const, e.g. `pulse-hygiene-report`, `pulse-suggestions`, `pulse-rule-candidates`, …), `generated` (iso-datetime), `loop` (string — the skill that wrote it). Suggestion entries inside `suggestions.md` use `S-NNN` IDs.

`dismissed.md` **persists** (rejection memory, design §10.3): one entry per dismissed `S-NNN`, with `dismissed` (iso-datetime) and `expires` (iso-datetime, default +90 days). **Validated by** `check.pulse` (header present; loose otherwise — transient data is not held to artefact-grade rigor).

**Retention (`state/reads/`).** The per-session read ledgers under `pulse/state/reads/<session-id>` accumulate one file per session; the hygiene loop deletes any whose mtime is older than a retention window (default **14 days**) and reports the count deleted. The 14-day window is currently in-code (`READS_RETENTION_DAYS` in `src/pulse/hygiene.ts`) and flagged as a future `cortex.config.json` key (`pulse.readsRetentionDays`, §10.1) — not yet a config option. No other `state/`, `reports/`, or `extraction/` file is subject to age-based deletion; those are overwritten in place by their owning loop.

**Retention (`sessions/`, `scratch/`, `threads/` — 3.3 third revision, §4.5.3).** The hygiene loop's **second** sanctioned deletion (`pulse.hygiene` Rule 8): `pulse/sessions/<session-id>.json` records whose mtime is older than **30 days** (`SESSION_RECORD_RETENTION_DAYS`, in-code beside `READS_RETENTION_DAYS`) are deleted together with their `pulse/scratch/<session-id>/` directory, any scratch directory past the same window is deleted on its own, and so is any `pulse/state/sessions/<session-id>.last.json` Stop-companion file past the window (an orphan of a session that never reached `SessionEnd`); counts are reported. Threads are **never deleted**: an `open` thread whose `expires` has passed is edited in place to `status: expired`. Beyond these two paragraphs, nothing under `pulse/` is subject to age-based deletion.

**Suggestion entries — single S-namespace across all pulse artefacts.** `S-NNN` ids form **one global namespace** shared by every proposal-writing loop, allocated monotonically via the counter file `pulse/state/suggestion-counter` (a plain integer; persists like `dismissed.md`; ids are never reused). Proposal sections may appear in **any** `pulse/reports/*.md` loop report (and in `suggestions.md` at the pulse root) — the review CLI discovers them by scanning all of them; the id is a handle, not metadata, so users never need to know which loop proposed what. Each section carries provenance in its own field lines. A duplicate `S-NNN` across files is a hard error at review time.

**Suggestion section shape:** one `## S-NNN: <title>` section per suggestion. Required field lines inside each section:

- `**Type:**` — one of `rule-candidate | skill-proposal | promotion | gated-layer-update | user-directed-capture | decision-candidate | evidence-candidate` (§4.5.1; `evidence-candidate` new at 3.4). Absent → treated as `rule-candidate` with a `warning` (v1-era tolerance; v1 reports carried no type). **Validated by** `check.pulse`.
- `**Source:**` — provenance: the proposing loop plus its evidence pointer (session ids, or the report that motivated it). For `promotion`, MUST name the **originating artefact** being promoted, and it is one of exactly two kinds: an insight per-file entry path (`insight/anatomy/**` or `insight/scopes/<s>/anatomy/**` — the `pulse.distil` Rule 7 producer) **or** an archive extraction path under `.cortex/archive/documents/<id>/extracted/…` (the `cortex-archive-ingest` producer, §4.5.1's 3.0 row); nothing else. *(B-020, 2026-09-17: this sentence said "the insight file being promoted" since 2.0 while §4.5.1's 3.0 row already named archive ingestion as the producer — the contract contradicted itself and accept refused every archive promotion. §4.5.1 wins; `insight.promotion-mechanism` Rules 5–6 own the accept semantics per kind.)*
- `**Target:**` — a project-relative path whose permitted root depends on `**Type:**` (§4.5.1 table). Across all types the union of permitted roots is `.cortex/compass/`, `.cortex/atlas/` (including `.cortex/atlas/decisions/` for `decision-candidate` and `.cortex/atlas/evidence/` for `evidence-candidate`), `.cortex/insight/`, `RULES.md`, and — for `skill-proposal` only — a **new** `.claude/skills/<name>/SKILL.md` path. Existing skill files are never overwritable via accept.
- The **payload**, in one of three operation shapes (§4.5.2): `**Proposed addition:**` (append), `**Proposed edit:**` (replace an exact byte-range of the target), or `**Proposed file:**` (create a new file). Exactly one payload shape per section.

**Fence grammar (nested payloads — resolves B-003).** A payload containing code fences MUST be wrapped in an outer fence **strictly longer** than any fence it contains (CommonMark longer-fence rule: four-plus backticks around a payload with triple-backtick fences). Writers inspect the payload and choose the outer length automatically; the parser honours the opening fence's length and closes only on a fence of at least that length. Accept round-trips the payload **byte-exact**, fences included.

**Counter authority.** `pulse/state/suggestion-counter` is the single authoritative id allocator: every loop that emits proposal sections MUST acquire ids from it (via the shared allocator) — never allocate locally, never reuse. Optional: `**Status:** pending | accepted | rejected` (absent = `pending`); free evidence lines (pattern, occurrences, source sessions, confidence) are unconstrained. The review CLI parses exactly these fields; accept applies the payload per its operation shape (§4.5.2).

#### 4.5.1 Suggestion types (v3.0; seventh type at 3.4)

The seven types, their permitted `**Target:**` roots, their producers, and their accept semantics. A `**Target:**` outside the permitted root for its type is a `check.pulse` `error`.

| `**Type:**` | Producer(s) | Permitted target root | Payload shape | On accept |
|---|---|---|---|---|
| `rule-candidate` | distil, rule-decay | `.cortex/compass/` | append | append the block to the target (v1 behaviour, unchanged) |
| `skill-proposal` | skill-suggest | new `.claude/skills/<name>/SKILL.md` | create | write the new skill file (never overwrite an existing one) |
| `promotion` | v2.0: `insight-gaps` (retired); v3.0: **archive ingestion** — proposes new gated compass/atlas content drafted from an ingested document (design §8.2; the producer's exact trigger conditions are owned by the archive ingestion skill spec, design §10.3) | `.cortex/compass/`, `.cortex/atlas/`, `RULES.md` | append **or** create | apply the payload to the gated target, inject a `source:` back to the originating artefact; **the v2.0 "mark the insight original promoted" trailer (§4.10.4, v2.0) has no v3.0 equivalent** — a v3.0-derived promotion would cite its origin via `provenance:` (§6, A6) instead |
| `gated-layer-update` | v2.0: `insight-gaps` signal 4-gated (retired); v3.0: **archive ingestion** — edits an existing gated rule/decision when a superseded document's replacement changes it (design §8.2; producer's exact trigger conditions owned by the archive ingestion skill spec, design §10.3) | `.cortex/compass/`, `.cortex/atlas/`, `RULES.md` | **edit** | replace the named byte-range in the target (§4.5.2); a correction to existing gated content is an edit, not an append |
| `user-directed-capture` | any skill/loop capturing an explicit user directive (v2.0: `insight-gaps` signal 5) | `.cortex/compass/`, `.cortex/atlas/`, `.cortex/insight/`, `RULES.md` | append or create | apply to the target the user confirmed; the proposed `**Target:**` is the loop's best guess and is **human-editable before accept** (v2 design §5) |
| `decision-candidate` (new at v3.0) | `cortex-loop-session-observe` | `.cortex/atlas/decisions/` | append or create | parallel to `rule-candidate` in shape and fields (same typed pulse-gate payload, same `S-NNN` counter, same dismissed/suppression machinery); proposes a new decision drafted from an in-session observation (design §9; addendum A7.4) |
| `evidence-candidate` (new at 3.4) | any loop that measures — **none wired at 3.4**; the type exists so that the day a loop has a number worth keeping it proposes an evidence file instead of writing atlas (RULES 7). The human verbs `cortex usage --record` and `cortex thread promote --to atlas/evidence` write evidence directly and never use this type | `.cortex/atlas/evidence/` | **create** only | write the proposed evidence file (§4.3 frontmatter, `check.evidence`-valid as proposed) to its target; never overwrite; the decision-candidate machinery (same counter, same dismissal) applies unchanged. Accept creates `atlas/evidence/` and its `_index.md` from the shipped template when absent (the compass-core-file precedent in `pulse.review-cli`) |

Notes: `promotion` and `gated-layer-update` are retained per addendum A7.4 — not repurposed for insight (insight enrichment is now a direct, ungated write by the insight-refresh loops and `cortex-loop-session-observe`, §4.10, §9; addendum A7.3, not a proposal) — but they are not orphaned: design §8.2 names **archive ingestion** as their v3.0 producer, reusing this same salvaged gate for downstream change plans (`promotion`-shaped append/create for brand-new gated content; `gated-layer-update`-shaped edit when a superseded document changes existing content). Which document conditions trigger which type is a spec-pass detail owned by the archive ingestion skill spec (design §10.3), not yet specified by this schema. `user-directed-capture` remains the only type that MAY target `.cortex/insight/`, because an explicit "remember this" deserves explicit confirmation of *where* it landed even when the landing is ungated. `decision-candidate`'s permitted root is `atlas/decisions/` specifically (not all of `atlas/`), since it targets exactly the sole-home decisions directory (§4.3); `evidence-candidate`'s is `atlas/evidence/` for the same reason, and it is create-only because evidence is never appended to or edited — a re-measurement is a new file that `supersedes` the old one (§4.3).

#### 4.5.2 Payload operation shapes (v2.0/v3.0, unchanged)

Every suggestion carries exactly one of three payload shapes. All fenced blocks obey the longer-fence grammar above (byte-exact round-trip).

- **`**Proposed addition:**`** (append) — a fenced block appended to the target verbatim. The target file MUST already exist. This is the v1 shape; unchanged.
- **`**Proposed file:**`** (create) — a fenced block written as the full contents of a **new** file at `**Target:**`. Accept refuses if the target already exists (no clobber).
- **`**Proposed edit:**`** (edit — new at v2.0) — resolves flag F3's append-only limitation. The section carries two fenced blocks, labelled by their opening line:
  - a `current:` block — the exact text to be replaced, which accept locates in the target and which MUST match **byte-exact** (accept **refuses** and reports if it does not — the target drifted since the proposal was written);
  - a `replacement:` block — the text to substitute for it.
  Accept replaces the single located occurrence. A `current:` block that resolves to zero or >1 occurrences is a hard refusal (ambiguous or stale). The edit operation is what makes `gated-layer-update` (a correction to an existing rule/decision) expressible.

Accept is **transactional per suggestion**: a refusal (byte-mismatch, clobber, ambiguous edit) applies nothing and leaves the suggestion `pending`.

**`dismissed.md`** (`kind: pulse-dismissed`) holds one `## S-NNN` section per rejection with `**Dismissed:**` (iso-datetime) and `**Expires:**` (iso-datetime; default now + `pulse.dismissedWindowDays`, 90). `pulse-list` hides unexpired dismissed ids; expired ones may resurface.

`reports/hook-errors.md` (`kind: pulse-hook-errors`) is the hooks' degradation log (§5): hooks **append** one structured entry per internal error (hook name, file involved, failure, iso-datetime), capped at the most recent 100 entries. Unlike loop reports it is append-not-overwrite; like everything in `pulse/` it is transient and surfaced by hygiene.

#### 4.5.3 Session records and threads (3.3, third revision — recall work, step 1)

Two artefacts written by the `SessionEnd` hook (§5; `hooks.session-end`) and the threads ledger it feeds (`pulse.threads`). Both are transient, gitignored with `pulse/`, machine-owned, and were **consumed by nothing in the revision that introduced them** — no hook read them and nothing injected them. **Consumers since:** the recall index (§4.11, 3.4) compiles open threads into subjects; and (3.4 third revision) the `UserPromptSubmit` hook `cortex hook prompt-route` (§5) lists `pulse/threads/` directly — the index has no thread `kind` or `status` — and, on a session's first prompt, reads the newest `pulse/sessions/` record to surface the previous interactive session's still-open `question`/`offer` thread; it is read-only, never changes a thread's status, and the `Open:` line it injects is the pointer grammar in §5. Both are deterministic captures of what a session said and wrote, never judgments (R-001).

**The session record — `pulse/sessions/<session-id>.json`.** One JSON object per ended session, overwritten if the hook fires again for the same id. Fields (all present; `null` where absent):

| Field | Type | Meaning |
|---|---|---|
| `kind` | const `pulse-session-record` | the artefact kind |
| `session_id` | string | Claude Code's `session_id` (falls back to the transcript filename stem) |
| `session` | string | the `claude-sessions/<user>/<session-id>` citation (§6) |
| `title` | string \| null | `sessionTitle(entries)` — the last `custom-title` entry |
| `session_kind` | enum `scheduled \| interactive` | detected from the first user message exactly as `pulse.distil` Rule 11 |
| `ended` | iso-datetime | hook wall-clock |
| `reason` | string | Claude Code's `reason`, verbatim; `unknown` when absent |
| `partial` | boolean | `true` when the transcript was larger than the hook's 2 MiB message tail (message-level fields may be incomplete) or exceeded the 64 MiB prefix-scan cap |
| `open_question` | `{ kind: "question" \| "offer", text (≤600), timestamp, source: "stop" \| "transcript" }` \| null | the last assistant paragraph — from the Stop companion file when it is fresher than the parsed transcript tail, else from the transcript when no user message follows it — when it asks or offers (lexicon in the hook spec, Rule 7a) |
| `approvals` | list (≤20) of `{ approval (≤600), approved (≤600), timestamp }` | user messages matching the approval lexicon, paired with the preceding assistant paragraph (Rule 7b) |
| `findings` | list (≤20) of `{ kind: "measurement" \| "conclusion", text (≤300), bears_on: list<string>, timestamp, source: "tag" \| "lexicon" }` | `<cortex:finding kind="…" bears_on="a, b">…</cortex:finding>` tags (single line, ≤300 chars) plus lexicon-matched untagged measurements (Rule 7c) |
| `artefacts` | list (≤20) of `{ path, copied: boolean, first_heading: string \| null }` | Write/Edit targets under a `/scratchpad/` segment; text files ≤64 KiB are copied to `pulse/scratch/<session-id>/<basename>` (Rule 8) |
| `reads` | string \| null | the project-relative path of `pulse/state/reads/<session-id>` when it exists — recorded, never copied |
| `threads_opened` / `threads_answered` | list<`T-NNN`> | the ledger ids this session opened (deduped ids included) and answered |

**The Stop companion — `pulse/state/sessions/<session-id>.last.json`.** Claude Code writes the transcript asynchronously, so at `SessionEnd` its last lines may be missing; the documented remedy is the `Stop` event's `last_assistant_message`. `cortex hook stop` therefore writes, on every turn, `{ "text": <last assistant message, ≤2000 chars>, "at": <iso-datetime> }` to this path (overwrite, write-then-rename), and nothing else — no transcript read, no output, no decision. The SessionEnd hook prefers it for `open_question` when its `at` is later than every message timestamp in the parsed tail, and deletes it after writing the record; hygiene deletes orphans past the 30-day window. Not validated (transient state, like the worklists).

The `<cortex:finding>` tag is the session-side counterpart of `<cortex:purpose>` (§5): a one-line, deterministic-to-parse marker a session may emit to say "this number or conclusion is worth keeping". Tags that span lines or exceed 300 characters are skipped, never truncated. **Validated by** nothing in this revision (`check.pulse` ignores `sessions/*.json` — it globs markdown only); the record's shape is asserted by the hook spec's tests.

**The threads ledger — `pulse/threads/T-NNN-<slug>.md`.** One markdown file per thread. Frontmatter (**required** unless marked): `id` (`T-NNN`, equal to the filename prefix), `kind` (enum `question | offer | approval | finding | artefact`), `status` (enum `open | answered | dropped | expired`), `opened` (iso-datetime), `session` (the opening session's `claude-sessions/<user>/<id>` citation, §6 — cited-not-resolved), `sessions` (list of citations — the trail of every session that raised the same thread, opener first), `bears_on` (list of mixed refs the thread concerns — seeded from the session's read ledger and any finding tag's `bears_on`, capped at 12; **formalised in §6 at 3.4** as the forward edge; on threads it stays **shape-checked only** by `check.threads` because the ledger is ungated and its seeds are paths that may since have moved — the recall index (§4.11) resolves them and drops what no longer resolves), `expires` (iso-datetime, `opened` + 30 days), optional `answered` (iso-datetime) and `resolved_by` (project-relative path or `claude-sessions/…` citation) — both present iff `status: answered`. Body: the verbatim text — the question or offer paragraph; `**Approved:**`/`**By:**` lines for an approval; the finding text with its `**Kind:**`/`**Source:**`; `**Path:**`/`**Heading:**`/`**Copy:**` for an artefact.

```markdown
---
id: T-004
kind: question
status: open
opened: 2026-09-15T10:12:04.000Z
session: claude-sessions/pedropacheco1/9a121da9-c7a7-403c-bb80-1cb82cb1cf6f
sessions:
  - claude-sessions/pedropacheco1/9a121da9-c7a7-403c-bb80-1cb82cb1cf6f
bears_on:
  - .cortex/compass/rules/R-001-core-no-llm-calls.md
  - .specflow/specs/pulse/hygiene.spec.md
expires: 2026-10-15T10:12:04.000Z
---

Do you want the counter in state/ or at the pulse root?
```

**Ids and counter authority.** `pulse/state/thread-counter` is the single authoritative `T-NNN` allocator — a plain integer holding the last id ever allocated, missing = 0, monotonic, never reused (mirrors `suggestion-counter`, and is a **separate namespace**: `T-` ids never touch `suggestion-counter` and never collide with `S-` ids).

**Lifecycle.** `open → answered` (deterministic answered detection at the next session end — id mention, normalised-text mention, or a reply to the immediately preceding session's hanging question; or the human verbs `cortex thread close` / `cortex thread promote`), `open → dropped` (`cortex thread drop`), `open → expired` (hygiene, past `expires`, in place). Terminal states never revert. **Dedupe:** a new thread whose normalised key (`normaliseText` — lowercase, whitespace collapsed) equals an `open` thread's key is not opened; the session is appended to that thread's `sessions` trail instead. **Promote** (`cortex thread promote T-NNN --to atlas/decisions | compass/bugs | atlas/evidence`) is a human act with the standing of `pulse-accept`: it writes one **draft** gated file whose frontmatter conforms to §4.3 (decision: `id`, `title`, `date`, `confidence: INFERRED`, `provenance` from the trail, and — 3.4 — `bears_on` carried verbatim from the thread; evidence — 3.4, `finding` threads of kind measurement only: `id`, `title`, `date`, `kind: measurement`, `instrument: session`, `window` from the trail's sessions, `findings` from the required `--finding <metric>=<value>` flags, `bears_on` from the thread or `--bears-on`, `provenance` from the trail — `atlas.evidence`) or §4.2 (bug: `id` next after the highest on disk, `title`, `type` from a required `--type`, `severity: medium`, `status: open`, `opened`, `affects` from resolvable `bears_on` paths or `--affects`), body prefixed with a DRAFT line and carrying the thread body verbatim, and sets the thread `answered` with `resolved_by` = the new path. **Validated by** `check.threads` (Appendix A) at `warning` severity; `check.pulse` **skips** `threads/**` (its `kind`/`generated`/`loop` header rule does not apply to threads).

### 4.6 Developer specs — `.specflow/specs/**/*.spec.md`

From the dev-spec template. **Required (leaf):** `id` (matches path), `status` (enum `draft|implementing|implemented`), `implements` (exactly one `path` to a business spec). **Required (all):** `id`, `status`. **Optional:** `depends_on` (list<id> — dev-spec IDs), `governed_by` (list<id> — compass rule IDs, design §8.4), `governs` (list<glob> — project files this spec governs; v2.0 fed anatomy's `spec_links` column; anatomy is removed at v3.0 and this role moves to insight's **Connections** section instead, design §5.10, addendum A1.6. **Semantics are deliberately identical to the compass-rule `governs` field (§4.1)** — same glob syntax, project-root-relative resolution, 0 on-disk matches → `warning`. The only divergence is optionality: required on rules because a rule without governed files is meaningless, optional on dev specs because a draft spec may legitimately precede the files it governs), `provenance` (list<{derives_from: path}> — this spec's derivation from an archive document or a Claude Code session; optional, absence means "authored directly"; §6, addendum A6). **Domain/capability specs:** `implements` is optional; `depends_on` allowed on capability specs.

```yaml
---
id: schema.validator
status: draft
depends_on: []
implements: ../../specs-business/schema/contributor-trusts-project-knowledge.business.md
governed_by: []
---
```

Body sections (design §8.1): Intent, Entities (READS/WRITES/CREATES — references only, never schema definitions), Rules (numbered), Acceptance Criteria (Given/When/Then, concrete values), Notes (OPEN: items). **Validated by** `check.dev-spec`: `id` matches path; `status` in enum; on leaves, `implements` present, single-valued, resolves, and is symmetric (§6); `depends_on` IDs resolve and form no cycle; `governed_by` IDs resolve; `governs` globs well-formed (on-disk resolution: `check.dev-spec-governs-resolves`, warning); if `provenance` present, each entry resolves per `check.provenance` (§6, addendum A6).

### 4.7 Business specs — `.specflow/specs-business/**/*.business.md`

**Required:** `id` (`<domain>.<outcome-slug>`, bare, globally unique), `status` (enum `draft|implementing|implemented`), `implemented_by` (list<path> to dev specs). **Optional:** `depends_on` (list<id> — business-spec IDs), `provenance` (list<{derives_from: path}> — this spec's derivation from an archive document or a Claude Code session; optional, absence means "authored directly"; §6, addendum A6).

```yaml
---
id: schema.knowledge-stays-consistent
status: draft
implemented_by:
  - ../../specs/schema/validator.spec.md
---
```

Body sections: Outcome, Who This Is For, User Journey, Business Rules, Success Metrics, Out of Scope, Notes. **No schemas, APIs, or Given/When/Then** (business-spec template). **Status policy (Policy A, mechanical).** A business spec's `status` is `implemented` when **every** dev spec in its `implemented_by:` list has `status: implemented`; until then it stays `draft`/`implementing`. A business spec whose implementers are all implemented but whose own status lags is flagged by `check.business-status` (warning). *Policy B — "implemented when a passing journey test exists" — is the v1.1 target once the test-runner loop ships; Policy A is deliberately the weaker, mechanically-available stand-in until then.*

**Validated by** `check.business-spec`: `id` matches path and is globally unique; `implemented_by` paths resolve and are symmetric (§6); body contains no fenced code / HTTP-verb / `Given`-`When`-`Then` markers → `warning` (drift into dev territory); if `provenance` present, each entry resolves per `check.provenance` (§6, addendum A6).

### 4.8 Scenario test specs — `tests/scenario/specs/<name>.md`

**Required:** `name` (string, matches filename), `covers` (list<id> — business-spec IDs). **Optional:** `description`.

```yaml
---
name: new-player-first-booking
covers:
  - auth.secure-account-access
  - booking.reserve-and-pay
---
```

**Validated by** `check.covers-resolves`: `name` matches filename; every `covers` ID resolves to a business spec (§6). (Completeness is `specflow-verify`, Decision 4.)

### 4.9 `constellation.json` (compiler output)

The compiled citation graph the constellation renderer serves (design §12.8). Emitted by the constellation compiler (invoked by `cortex scan`). Regenerable; gitignored (Decision 1). Read-only for every consumer.

**Top-level shape (all fields required):**

```json
{
  "schemaVersion": "3.0",
  "generated": "2026-07-02T14:00:00Z",
  "groups": [
    { "id": "compass", "label": "Compass",
      "children": [{ "id": "compass:rules", "label": "rules" }, { "id": "compass:bugs", "label": "bugs" }] }
  ],
  "nodes": [
    { "id": "rule:R-014", "module": "rule", "label": "R-014",
      "group": "compass:rules", "ref": "R-014" }
  ],
  "edges": [
    { "from": "spec:schema.validator",
      "to": "business:schema.contributor-trusts-project-knowledge",
      "kind": "implements" }
  ],
  "counters": { "compass": 5, "atlas": 0, "specs": 10,
                "edges": 42, "droppedRefs": 0 }
}
```

**Groups** are the Level-1 constellations (design §12.3, re-rooted at v3.0): **`compass`, `atlas`, `specs`** — exactly three top groups (v2.0 had four, including `anatomy`; anatomy no longer emits nodes, having been removed and absorbed into `insight`, which stays out of `constellation.json` entirely per the curated/inferred split below), each with children by natural grouping — compass by category (`rules`, `bugs`, core files), atlas by subfolder, specs by domain folder (dev and business nodes share the domain child; `module` distinguishes them). *(v3.0 interpretive note: the addendum's explicit supersession of this section (A1.4, A4.6 note) covers the `cerebrum`→`compass` rename and the dropped insight preset; dropping `anatomy` as a group/node kind is this schema's own necessary consequence of `anatomy/`'s removal (addendum A7.3) — not a separately-numbered addendum clause. Flagged for review.)*

**Nodes:** `id` is module-prefixed and globally unique — `rule:R-NNN`, `bug:B-NNN`, `compass:<file>`, `atlas:<artefact-id>`, `spec:<dev-id>`, `business:<business-id>`. `module` is one of `rule | bug | compass | atlas | spec-dev | spec-business` (v2.0's `anatomy` module value is removed). `group` names a declared group/child id. `ref` is the underlying path or artefact id. When a node's source artefact has no schema-defined ID, its `ref` is the artefact's path relative to the project root — this applies to the compass core files (`preferences.md`, `environment.md`, `do-not-repeat.md`) and to any other artefact class that lacks IDs by design. `size` (optional) carries a token estimate on nodes where available (v2.0 used this only for anatomy nodes; v3.0 has none — reserved for future use, e.g. large spec files).

**Edges** come from the §6 citation graph only — never from `insight/graph.json`'s imports/semantic edges (design §12.7: the constellation is the *curated* citation graph, not raw code structure or inferred understanding). `kind` names the frontmatter field that produced the edge (`implements`, `depends_on`, `governs`, `governed_by`, `source`, `related_specs`, `covers`, `compass_rules`, `supersedes`, `sources`, `provenance`, and — new at 3.4 — `bears_on`). A `bears_on` edge runs from an atlas decision or evidence node to the node its ref names: `R-NNN` → `rule:`, `B-NNN` → `bug:`, `domain.<term>` → `atlas:`, a spec id → `spec:` or `business:`; the path, `concept:` and `schema:` ref shapes (§6) name things that are not nodes and, like `governs` globs, produce no edge and count as no dropped ref. Threads and observations are ungated and stay out of the constellation, so their `bears_on` emits nothing here (the recall index, §4.11, is where those edges live). The v2.0 `spec_links` (anatomy → dev specs) edge kind is removed with anatomy (§6). The symmetric `implements`/`implemented_by` pair dedupes to a single `implements` edge. A reference that does not resolve to an emitted node is **dropped and counted** in `counters.droppedRefs` — the compiler is tolerant; complaining about broken refs is the validator's job.

**Determinism:** groups, nodes, and edges are sorted (stable order); two compilations of identical input are byte-identical except `generated`.

**Insight preset (resolved at v3.0 build-order step 10; `constellation.insight-preset-v3`).** The v2.0 insight preset (a constellation overlay over `insight/map/graph.json`'s node/edge set) stays **dropped** — that node set no longer exists (`insight/` is rebuilt wholesale, §4.10, addendum A4.6 note). Design §11 Q2 ("whether v3 adds a new insight preset … or the constellation stays curated-only") is **resolved: yes** — a fourth preset, `?preset=insight`, composes the new code-understanding graph (`insight/graph.json`/`clusters.json`, §4.10.6) at **serve time only**, architecturally simpler than the dropped v2.0 design: it renders the insight graph as its own self-contained map rather than joining it onto the curated node set, and it never reads `constellation.json` at all (a missing curated map never blocks it, and vice versa). `constellation.json` stays **curated-only** regardless: its shape and byte-determinism contract are unchanged by this preset, and it never contains inferred edges or clusters. The minimal composition contract, at the schema layer: absent or empty insight data (no `.cortex/insight/`, or an empty `graph.json`) yields an empty result (200), never an error; every insight edge renders **dashed**, unconditionally, with `confidence` (§4.10.6's four-tier enum) driving only opacity/weight, never the dashed-vs-solid distinction itself; a node/edge may additionally surface anatomy `## Purpose` text (for `file` nodes) for the renderer's detail panel, read at request time from the same per-file entries §4.10.2 defines. The full contract (composition shape, per-kind detail fields, rendering rules) is specified by `constellation.insight-preset-v3`, not repeated here.

**Validated by** `check.constellation` (only when the file exists): valid JSON; all required top-level keys; node ids unique; every node `group` resolves to a declared group/child id; every edge endpoint resolves to an emitted node id; `module` in enum (`rule | bug | compass | atlas | spec-dev | spec-business`).

### 4.10 The `insight/` module (v3.0 — rebuilt wholesale)

Design §5, §5.8. **The entire v2.0 `insight/map/` contract (v2.0 §4.10 and its subsections) is superseded.** v3.0 insight is a leveled, scoped, per-file understanding of the *source code itself*, not a concept-map over the curated artefact set (design §8.3). It remains **ungated** (§4.10.0).

**The trust contract (carried forward, unchanged in substance).** Insight is inferred, not curated: **context, not authority.** Where insight conflicts with a compass rule or a spec, the gated layer wins. It never carries write-time enforcement authority (no PreWrite reads insight, §5) and, with one narrow exception, no hook injects it: the SessionStart observations digest (§4.10.11, new at 3.1) — a small, separately-budgeted, qualifying-entries-only surfacing of `insight/observations/`. That digest is the **only** SessionStart insight surface. The 3.3 second revision widened this once, to permit insight **concept names** inside a SessionStart coverage map; that map was never built and the widening was retired with it at the 3.4 fourth revision (atlas decision `2026-09-16-session-start-coverage-injection-retired`), so the stance reads as it did at 3.1. Insight otherwise reaches a session by pull (`cortex insight`, §4.10.8) and, for the thing being read, by the PreRead purpose summary (§5). The digest is not a general insight-injection precedent. Committed in full (Decision 1's fourth git-policy quadrant: machine-owned **and** committed).

#### 4.10.1 Two layouts — scoped and unscoped

Chosen by whether the extraction scoped. The query layer (§4.10.8) hides the difference.

**Scoped extraction (large codebases):** the layout under `insight/` shown in §1 — `_index.md`, `scope-registry.yaml`, `ledger.json`, `reverse-index.json`, `scopes/<scope>/{anatomy/, concepts/, graph.json}`, and top-level `anatomy/`, `concepts/`, `graph.json`, `tags.json`, `clusters.json` for content not owned by any scope, plus cross-scope aggregates.

**Unscoped extraction (small codebases):** the same, minus `scope-registry.yaml` and `scopes/`; all per-file entries live under top-level `anatomy/` (path mirrors source, e.g. `anatomy/src/auth/session.ts.md`).

The `anatomy/` **sub-directory name** preserves continuity with what v1's `.cortex/anatomy/` held (the file-level structural artefact), now living *inside* insight (design §5.8, §5.10). **Validated by** `check.layout` (the old `map/` layout and its `check.insight-ownership` are removed — insight's write-lane discipline in v3.0 is enforced per-loop, not by a single shared-directory rule, addendum A7.3).

#### 4.10.2 The per-file understanding entry

L3 produces a rich entry per centrality-important file; smaller/peripheral files get a **lighter L2-only entry** (Purpose + Connections). One entry per *source file* (design §5.11 LEAVE: not one file per node). Path mirrors the source under `anatomy/` (or `scopes/<scope>/anatomy/`).

**Frontmatter — required:** `path` (project-relative source path), `extracted_at` (iso-datetime), `extraction_level` (int `2 | 3`), `size_lines` (int), `size_tokens` (int), `centrality` (enum `high | medium | low`), `built_at_commit` (string — the commit at extraction; the per-entry half of the staleness ledger, §4.10.4), `source_sha256` (sha256 — hash of the *source file body*, not the entry frontmatter; §4.10.4, design §5.11 "hash-the-body-not-the-frontmatter").

```yaml
---
path: src/auth/session.ts
extracted_at: 2026-07-07T14:00:00Z
extraction_level: 3
size_lines: 620
size_tokens: 5400
centrality: high
built_at_commit: 9f2c1ab
source_sha256: a1b3…            # 64 hex, of the source file body
---
```

**Section contract (L3 entry):** `## Purpose`, `## Main players` (named atomic elements with line ranges and importance — the source the `element` query reads, §4.10.8; elements are a byproduct of L3, not a separate pass), `## Insights` (non-obvious observations, conventions, quirks), `## File map` (only above ~500 lines; line-range → section), `## Connections` (`Uses:` / `Used by:` / `Semantically related (not imports):`), `## Query pointers` (intent-scoped "if you need to X, also read Y"). An **L2 (lighter) entry** carries `## Purpose` and `## Connections` only, with `extraction_level: 2`.

`cortex-loop-session-observe` (§9) writes ungated observations directly into a per-file entry's `## Insights` and `## Query pointers` sections, carrying `claude-sessions/<user>/<id>` provenance (§6, addendum A6) — there is no separate corrections log at v3.0 (Decision 16 note): a correction is a direct in-place rewrite of the relevant section.

**Validated by** `check.insight-entry` (replaces v2.0's `check.insight-prose`): required frontmatter present and typed; `extraction_level` in `{2,3}`; `centrality` in enum; `source_sha256` 64-hex; an L3 entry (`extraction_level: 3`) carries `## Purpose`, `## Main players`, `## Connections` at minimum; an L2 entry carries `## Purpose` and `## Connections`. `## File map` absent below the size threshold is not an error.

#### 4.10.3 `scope-registry.yaml`

Present only for scoped extractions. The durable record of the scope tree (design §5.4).

```yaml
schemaVersion: "3.0"
built_at_commit: <string>
scopes:
  <scope-id>:
    path: <project-relative dir>          # required
    depends_on: [<scope-id>, …]           # required (may be empty) — shared scopes this one references
    shared_by: [<scope-id>, …]            # optional — parents that reference this shared scope
```

A scope with a non-empty `shared_by` is extracted **once** and referenced from each parent (dedup, design §5.4). **Validated by** `check.insight-scope-registry`: valid YAML; each `path` resolves to a directory; every `depends_on`/`shared_by` id is a declared scope; `depends_on` acyclic; `shared_by` is the inverse of `depends_on` (asymmetry → warning).

#### 4.10.4 The staleness ledger — `insight/ledger.json`

Design §5.8/§5.9 require a `built_at_commit` stamp + per-entry content hash and direct this schema to give the ledger a storage shape (Decision 22 / addendum A10-2): a module-level ledger complementing the per-entry `built_at_commit`/`source_sha256` frontmatter (§4.10.2).

```jsonc
{
  "schemaVersion": "3.0",
  "built_at_commit": "<sha>",                 // module-wide ground-truth commit of the last full pass
  "entries": {
    "<source-path>": {
      "source_sha256": "<64hex>",             // hash of the source body at extraction (mirrors §4.10.2)
      "built_at_commit": "<sha>",
      "extraction_level": 2                    // 2 | 3
    }
  }
}
```

The post-commit fast tier (§9) compares a changed file's current body hash against `entries[path].source_sha256` to flag drift **without** invoking an LLM (design §5.9, "code-only-skips-LLM"). **Validated by** `check.insight-ledger`: valid JSON; `built_at_commit` present; each `entries` value has `source_sha256` (64-hex), `built_at_commit`, `extraction_level ∈ {2,3}`.

#### 4.10.5 The reverse-dependency index — `insight/reverse-index.json`

Design §5.9 requires a reverse dependency index so a changed file invalidates not just its own entry but every concept/edge referencing an entity in it, and directs this schema to give it a storage shape (Decision 23 / addendum A10-3):

```jsonc
{
  "schemaVersion": "3.0",
  "built_at_commit": "<sha>",
  "referenced_by": {
    "<entity-node-id>": [ "<concept-id | edge-id>", … ]   // everything that cites this entity
  }
}
```

`<entity-node-id>` uses the §4.10.6 node-id grammar; each referencing id is a concept file id or an `edge-id` (§4.10.6). On a file change, the daily loop (§9) looks up every entity the file defines and re-verifies every referencing concept/edge. **Validated by** `check.insight-ledger` (the same check governs both index files): valid JSON; keys are well-formed node ids; list members are well-formed concept/edge ids.

#### 4.10.6 The JSON shapes — `graph.json`, `tags.json`, `clusters.json`

Node ids reuse a **path-derived grammar** (Decision 27 / addendum A10-7, design §5.11 "deterministic path-derived IDs"): `file:<project-relpath>`, `element:<project-relpath>#<name>`, `concept:<slug>`. (This deliberately **differs from v2.0's constellation-borrowed grammar** — v3.0's nodes are source-code entities, not curated artefacts, design §8.3.) Serialization is deterministic: nodes/edges/tags/clusters total-ordered; only `generated`/`built_at_commit` vary per run; the graph write **refuses to shrink an existing graph without `--force`** (design §5.8, crashed-refresh guard).

**`graph.json`** — the cross-file semantic graph (scope-local copies live at `scopes/<scope>/graph.json`):

```jsonc
{
  "schemaVersion": "3.0",
  "generated": "<iso-datetime>",
  "built_at_commit": "<sha>",
  "nodes": [ { "id": "<node-id>", "kind": "file" | "element" | "concept", "label": "<string>" } ],
  "edges": [
    {
      "id": "<edge-id>",                          // stable, derived from (source,target,edge_type)
      "source": "<node-id>",
      "target": "<node-id>",
      "edge_type": "imports" | "calls" | "semantically-similar-to"
                 | "implements-concept" | "co-clustered",
      "confidence": "structural" | "stated" | "inferred" | "ambiguous",
      "evidence": "<non-empty rationale string>",
      "confirmed_at_commit": "<sha>"              // last refresh that re-confirmed the edge (confidence-aging, §5.9)
    }
  ]
}
```

- **`edge_type` — enumerated closed set (Decision 24 / addendum A10-4):** `imports` (L1 structural module dependency); `calls` (caller→callee, within-language guard, design §5.11); `semantically-similar-to` (L4 — the **only** sanctioned similarity edge, tightened to non-obvious-and-cross-cutting, design §5.11); `implements-concept` (a file/element node → a `concept` node); `co-clustered` (cluster co-membership). Extending the set is a MINOR bump.
- **`confidence` — a discrete confidence-TIER enum, NOT a float (Decision 25 / addendum A10-5), each tier tied to a named evidence type (design §5.11 "discrete confidence rubric … each tied to a named evidence type"):**

  | tier | evidence type | meaning |
  |---|---|---|
  | `structural` | AST relation (L1, tree-sitter) | edge is a deterministic parse fact (import, export, in-language call) |
  | `stated` | EXTRACTED text (L2/L3) | edge asserted by explicit content the extractor read |
  | `inferred` | INFERRED reasoning (L4) | edge from cross-file semantic reasoning, no direct textual assertion |
  | `ambiguous` | AMBIGUOUS signal | weak/conflicting evidence; surfaced for re-verification, never silently trusted |

  This **deliberately differs from v2.0's inferred-edge enum** (`high | medium | low`, Decision 17), which graded *inference strength* on edges that were all INFERRED by definition. v3.0's tiers grade *kind of evidence*, mapping onto the EXTRACTED/INFERRED/AMBIGUOUS provenance vocabulary plus a `structural` tier below it (design §5.11).
- **Every edge MUST carry a non-empty `evidence` string** — explainability is a module invariant (design §1.3, "NO embeddings; each edge names its rationale"). An empty `evidence` is an `error`.
- **`confirmed_at_commit`** supports confidence-aging (design §5.9): an `inferred`/`ambiguous` edge not re-confirmed across N refreshes is surfaced to the loop for re-verification. N is a loop-config detail (this schema defers to the insight-refresh loop spec).

**`tags.json`** — a **structured tag vocabulary** (the embeddings replacement, design §1.3). v2.0 stored a bare label list; v3.0 adds a typed vocabulary (Decision 26 / addendum A10-6):

```jsonc
{
  "schemaVersion": "3.0",
  "generated": "<iso-datetime>",
  "built_at_commit": "<sha>",
  "vocabulary": [
    { "tag": "authentication", "kind": "concern" | "technology" | "pattern" | "layer" | "domain-term",
      "aliases": ["auth"] }                       // aliases optional
  ],
  "assignments": { "<node-id>": ["authentication", "jwt"] }   // every tag must appear in vocabulary
}
```

**`clusters.json`** — inferred domain clusters:

```jsonc
{
  "schemaVersion": "3.0",
  "generated": "<iso-datetime>",
  "built_at_commit": "<sha>",
  "clusters": [
    { "id": "cluster:<label-slug>", "label": "<string>", "members": ["<node-id>", …],
      "rationale": "<non-empty>", "scope": "<scope-id>" | "global" }
  ]
}
```

Cluster-id stability across rebuilds (v2.0's Jaccard carry-over, Decision 14) and the **exact cluster-representation nuances** are **deferred to the insight storage-format spec** (design §10.3, §11 Q1; Decision 14 v3.0 note) — this schema fixes only the field-level shape above (id form `cluster:<slug>`, `members`, non-empty `rationale`, `scope`).

**Validated by** `check.insight-graph` (redefined): each file valid JSON with `schemaVersion`, `generated`, `built_at_commit`; `graph.json` node ids unique, well-formed under this section's grammar; edge `source`/`target` present in the file's own `nodes` (absent → warning, tolerant); `edge_type` and `confidence` in their enums; every edge `evidence` non-empty; `tags.json` `assignments` reference only ids in `vocabulary`; `tag.kind` in enum; `clusters.json` cluster ids match `cluster:<slug>`, unique, `rationale` non-empty, `scope` a declared scope id or `global`.

#### 4.10.7 `insight/_index.md`

Follows the general §7.1 active-prompt shape with a module-specific requirement — the filled template and its rationale are given in §7.4 rather than repeated here (mirrors how v2.0 cross-referenced this same split). **Validated by** `check.insight-index` (redefined) + `check.index-shape`.

#### 4.10.8 Query surface — `cortex insight file/concept/element` (supersedes v2.0 §4.10.5's verbs)

All deterministic Core reading pre-extracted files — **no LLM at query time** (design §5.6; RULES 3). All support `--json`. **Supersedes** v2.0's `query | get | neighbors | list`:

| v3.0 command | Returns |
|---|---|
| `cortex insight file <path>` | the rich per-file entry (§4.10.2) for the source path |
| `cortex insight concept <name>` | which files touch the concept, how it's implemented, related concepts |
| `cortex insight element <query>` | an atomic element (function/class/constant) with description, connections, follow-up pointers; MAY return "no rich entry" for elements not identified as L3 main players — still discoverable via `file` |

There is **no `cortex insight ask`** in v3.0 (natural-language questions are answered by Claude in-session over these primitives; a subprocess `ask` is a named future addition, design §5.6, §11). The command payload *text* is asserted by the insight dev specs' tests, not the validator (carried from v2.0 §4.10.5).

#### 4.10.9 `cortex-extract-insight` skill I/O contract

A Claude Code **skill**, **no CLI wrapper** (design §5.3, §5.11; RULES 3 — extraction is agentic LLM work). Invoked from sessions and scheduled tasks. Contract:

- **Input:** a project with L1 available (or runs L1 in Core first — design §5.3 Phase 1).
- **Behaviour:** orchestrates L1 → planning → scoped parallel L2/L3 execution → cross-scope L4 unification (design §5.3); spawns one sub-agent per root scope (write-fragment-to-disk, disk-file-is-success-signal, missing-fragment-warns, >half-missing-aborts — design §5.3/§5.11); resumable/checkpointed per scope completion; validates outputs against this schema.
- **Outputs (durable):** the insight layout of §4.10.1 (`anatomy/` entries, `concepts/`, `graph.json`/`tags.json`/`clusters.json`, `scope-registry.yaml`, `ledger.json`, `reverse-index.json`).
- **Outputs (transient, pulse):** §4.10.10.

#### 4.10.10 Pulse artefact formats (insight extraction)

Both under `pulse/` (gitignored, transient; §4.5 header conventions apply — `kind`, `generated`, `loop`).

- **`.cortex/pulse/extraction/plan.md`** (`kind: insight-extraction-plan`) — the plan Claude drafts in Phase 2 for user review: root scopes (with size/depth and shared references), shared scopes, sub-scopes, estimated cost and peak parallelism (design §5.3 example). For codebases below the auto-run threshold the plan is written and executed without a wait; above it, execution waits for confirmation.
- **`.cortex/pulse/extraction/progress.md`** (`kind: insight-extraction-progress`) — progress reporting during Phase 3/4: per-scope status (pending / running / complete / failed), files done, checkpoints, warnings (missing fragments) (design §5.11). The per-scope L1 structural output (`extraction/l1.json`) and per-scope fragments (`extraction/fragments/<scope-id>.json`) share this directory.

**Validated by** `check.pulse` (header presence; loose otherwise — transient).

#### 4.10.11 Project-context observations — `insight/observations/` (new at 3.1; directory shape revised in place — see note below)

Design §9's session-observation role, extended (a MINOR addition per §10.2). Sessions teach more than per-file facts: scale expectations, audience, stated intent, working knowledge the user mentions in conversation and never files as a rule or a decision. Those observations previously had no home — the per-file entries (§4.10.2) are the wrong grain, and the pulse gate (§4.5) is the wrong weight for context that binds nothing. `insight/observations/` is that home: a directory of small, committed, **themed entry files** of project-level, session-learned observations, machine-owned ungated under the same Decision 13 allowance as the per-file enrichments, with `cortex-loop-session-observe` as its **sole writer**.

**Revision note.** 3.1 first drafted this surface as a single flat file (`observations.md`, one dated bullet per observation, no importance model). No project has shipped on 3.1 — this repo runs schema 3.0 (`.cortex/cortex.config.json` `schemaVersion`) and the validator's `supportedMajor`/`supportedMinor` are still pinned at `2`/`0` (§10.3 note) — so the surface is revised **in place**, still `new at 3.1`, rather than bumped to a further MINOR. The single-file shape is reversed: themed entries age better than a log. A correction to "the team is targeting ~1000 users" rewrites one `scale.md` entry; in the flat-file design it would have had to contradict a sibling bullet several lines up, leaving the reader to reconcile two truths. Per-entry importance and provenance (below) also need per-entry structure — a shared `updated` timestamp for the whole file could not tell two observations of different age apart.

**Layout:**

```
.cortex/insight/observations/
├── _index.md                  active prompt (§7.1 shape — see index note below)
├── audience.md                 e.g. who the project is for
├── scale.md                    e.g. expected load / user count
├── deployment.md                e.g. target environment
├── working-style.md             e.g. how the user likes to work
├── stated-intent.md             e.g. explicitly stated goals
└── <theme>.md                   any other theme the loop identifies
```

`<theme>` is a kebab-case slug chosen by the writing loop, not a closed enum — new themes appear as sessions teach new kinds of context. Each file is one themed entry: current-truth prose, not a log.

**Index carve-out (judgment call).** `insight/observations/` gets its own minimal `_index.md`, following the general §7.1 active-prompt shape, rather than being folded into the §7.1 pulse-subdirectory (B-008) carve-out. The carve-out exists for machine-bookkeeping directories nobody browses (`pulse/state/`, `pulse/reports/`); `observations/` is closer in kind to `atlas/decisions/` or `compass/bugs/` — a themed collection meant to be read — so it gets the same treatment as those, not the pulse exemption.

**Frontmatter — required (per entry file):** `kind` (string const `insight-observation`), `updated` (iso-datetime — last write to this entry), `salient` (bool — the emphasis flag, below), `sessions` (list<`claude-sessions/<user>/<session-id>`> — the frequency trail: every session that stated or re-confirmed this observation; §6, addendum A6 — cited-not-resolved, shape-checked only). **Optional (new at 3.4):** `bears_on` (list of mixed refs, §6 — the subjects this observation is about; supplied by the writing loop when the session named them, shape-checked only here because the surface is ungated; the recall index (§4.11) resolves it and lists the entry's theme under each resolving subject).

```yaml
---
kind: insight-observation
updated: 2026-07-14T09:00:00Z
salient: true
sessions:
  - claude-sessions/pedro/9f2c1ab-…
  - claude-sessions/pedro/a41e0cd-…
---

The project is meant for roughly 1000 concurrent users at launch — not
a hyperscale target. Pedro has said this more than once when reviewing
capacity-sensitive designs.
```

**Body:** the observation prose, current-truth only — no history log, no bullet-per-session. A re-encounter of a known observation appends the new session id to `sessions:` and bumps `updated`, refining the prose if the newer session sharpens it; a session contradicting an existing observation rewrites the body in place to the newer truth (newest session wins) and appends its session id — the `sessions:` trail is kept in both cases, because it **is** the evidence record (frequency, below, is read directly off it).

**Two-signal importance, derived not declared.** An entry's importance is the **max** of two signals, neither of which is itself stored as an importance value:
- **Frequency** — the count of distinct sessions in `sessions:`. Purely mechanical; no judgment involved.
- **Emphasis** — `salient: true`, set at capture time by an LLM judgment (the session-observe loop, never Core) when the user stated the observation forcefully: an "ALWAYS"/"never", an explicit imperative, or a forceful correction of a prior assumption. A single forceful session can outrank a dozen mild ones.

Nothing computes or stores a combined score; consumers (the digest, below) apply the qualification rule directly.

**Digest injection — the SessionStart hook (§5).** `insight/observations/` is no longer un-injected: the SessionStart payload carries a compact **observations digest** alongside the existing hygiene line. An entry **qualifies** for the digest when `salient: true` OR its `sessions:` count is ≥ 3 (a threshold, not yet a config key — a `pulse`-style future candidate per the §10.1 conventions, e.g. `insight.observationsDigestThreshold`). Qualifying entries render as compact one-liners (theme + gist, not full prose) inside a hard **≤150-token** budget — small next to the existing hygiene line, consistent with this document's existing per-hook budget discipline (§5, §7.1, §8) — plus a one-line pointer to `.cortex/insight/observations/` for the tail of non-qualifying entries. Absent `observations/`, or no qualifying entry, the digest line is omitted entirely (the zero-overhead convention used throughout §5). This directly amends the 3.1 draft's "No hook injects this file" clause — it was written for the single-file shape and undersells the digest's value once entries carry an importance signal worth surfacing at session start; SessionStart stays warn-never-block, pure file I/O, no network call.

**The trust contract, sharpened.** §4.10's trust contract applies in full — inferred, not curated; context, not authority — with one addition specific to this surface: an observation here is something **said or learned in a session and never re-confirmed through the gate**. It is taken with a grain of salt by construction; where it conflicts with a compass rule, an atlas decision, or a spec, the gated layer wins, always. An observation that hardens into something that should *bind* future work leaves this surface only as a typed pulse proposal (`rule-candidate`/`decision-candidate`, §4.5.1) — never by silent graduation. No hook *fabricates or elevates* this content — the digest above surfaces it verbatim, it never rewrites it into a stronger claim — and the surface carries no enforcement authority.

**Distil coordination.** The `sessions:` provenance trail on each entry is the shared evidence surface between session-observe and `cortex-pulse-distil` (§4.5.1's `rule-candidate` row already names distil as a producer). An observation recurring across enough sessions is exactly the repetition signal distil looks for; distil reads `insight/observations/` alongside its own session-corpus scan and, on a qualifying recurrence, proposes graduation through the existing `rule-candidate`/`decision-candidate` machinery (§4.5.1) — the same gate, not a second one. This resolves the previously-open question of a separate double-proposal mechanism: there isn't one — observations and distil share one evidence trail and one gate. The exact recurrence threshold distil applies (which may differ from the digest's display threshold above) is a spec-pass detail owned by `cortex-pulse-distil`'s own spec, not fixed here.

**Query surface — flagged, not specified.** The `cortex insight` CLI (§4.10.8) does not gain a verb at 3.1. Whether a fourth verb (e.g. `cortex insight observations`) is warranted is a **flagged spec-pass decision owned by `insight.cli`**; until it lands, entries are read directly — each is deliberately small, and the §7.4 index names the directory.

**Validated by** `check.insight-observations` (new at 3.1; revised for the directory shape): tolerant of `insight/observations/` being entirely absent (§1 convention — a project whose loop has observed nothing yet validates clean); when present, each entry file's frontmatter (`kind`, `updated`, `salient`, `sessions`) is present and typed, each `sessions` member is a well-formed `claude-sessions/<user>/<id>` reference (shape-checked only, per `check.provenance`), `bears_on` — when present — is a list of non-empty strings (3.4; shape only), and `insight/observations/_index.md` is present and well-formed per `check.index-shape`.

### 4.11 `recall-index.json` — the compiled recall index (new at 3.4)

The forward edge (§6) answers "what bears on X?" only if something walks every decision, evidence file, thread and observation and inverts their `bears_on` lists. Doing that in a hook, per search or per read, would spend the latency budget RULES 6 protects on frontmatter parsing. So the inversion is compiled once, deterministically, into `.cortex/recall-index.json` — regenerable, gitignored (Decision 1, same quadrant as `constellation.json`), read-only for every consumer, and **the only file a recall hook reads** (step 3 of the recall work): hooks never open frontmatter. Owned by `recall.recall-index`.

**Top-level shape (all fields required):**

```json
{
  "schemaVersion": "3.4",
  "generated": "2026-09-15T16:00:00.000Z",
  "subjects": {
    ".specflow/specs/pulse/hygiene.spec.md": { "decided": [], "evidence": [], "threads": ["T-004"], "observations": [] },
    "R-001": { "decided": ["decision.2026-07-07-five-module-architecture"], "evidence": [], "threads": [], "observations": ["working-style"], "rules": [], "bugs": ["B-020"] },
    "src/schema/checks/xref.ts": { "decided": [], "evidence": [], "threads": [], "observations": [], "rules": ["R-001"], "bugs": ["B-019"] },
    "schema:§5": { "decided": ["decision.2026-08-05-insight-pull-only-stance-reversed"], "evidence": ["evidence.2026-09-15-usage"], "threads": [], "observations": [] }
  },
  "entries": {
    "T-004": { "kind": "thread", "title": "Do you want the counter in state/ or at the pulse root?", "path": ".cortex/pulse/threads/T-004-do-you-want-the-counter-in-state-or-at-the-pulse-root.md", "date": "2026-09-15T10:12:04.000Z", "keywords": ["counter", "pulse", "root", "state", "want", ".specflow/specs/pulse/hygiene.spec.md"] },
    "evidence.2026-09-15-usage": { "kind": "evidence", "title": "Cortex usage over 41 sessions", "path": ".cortex/atlas/evidence/2026-09-15-usage.md", "date": "2026-09-15T15:58:00.000Z", "keywords": ["cortex", "sessions", "usage", "pulse.usage", "schema:§5"] }
  },
  "counters": { "subjects": 3, "entries": 2, "droppedRefs": 0 }
}
```

**Inputs** (each optional; an absent directory contributes nothing and is never an error): `atlas/decisions/*.md` (§4.3), `atlas/evidence/*.md` (§4.3), `pulse/threads/T-*.md` (§4.5.3), `insight/observations/*.md` (§4.10.11); **(3.4 fifth revision)** `compass/rules/R-*.md` (§4.1; `status: retired` skipped), `compass/bugs/B-*.md` (§4.2), and the four compass documents `compass/environment.md`, `preferences.md`, `do-not-repeat.md`, `standing-authorities.md`; `cortex-schema.md` and the project index for resolution (§6, §6.2). A file whose frontmatter does not parse is skipped, never fatal.

**Subjects.** Every `bears_on` ref that **resolves** per §6's shape rules becomes a subject key, written as the ref was written except that path refs are normalised to POSIX form with any leading `./` stripped. A ref that does not resolve produces no subject and increments `counters.droppedRefs` — the compiler is tolerant; complaining is `check.bears-on`'s job. Each subject carries four lists, each sorted and deduplicated: `decided` (decision ids), `evidence` (evidence ids), `threads` (thread ids, open only), `observations` (observation themes — the entry file's stem) — and, **3.4 fifth revision**, two more: `rules` (rule ids) and `bugs` (bug ids, `open`/`triaged` only). The compass carriers have no `bears_on`; their subjects are **derived** (`recall.recall-index` Rules 15–17): a rule's from each `governs` glob's literal directory prefix (when it exists as a directory), the files the glob matches (the first 20, sorted, per rule), and its resolving `related_specs`; a bug's from its `affects`, resolved by shape exactly as §6 resolves them. Compass documents contribute no subject at all — they are keyword-only entries.

**Entailment — the three rules, computed here and nowhere else:**

1. **Current decisions only.** `bears_on(D, X)` ⇒ `X.decided ∋ D.id` **iff** no other decision's `supersedes` resolves to `D`'s file. A superseded decision keeps its `entries` row (so a consumer can name it) but appears in no subject's `decided`.
2. **Open threads only.** `bears_on(T, X)` ⇒ `X.threads ∋ T.id` iff `T.status` is `open`. Answered, dropped and expired threads keep no subject.
3. **Evidence is inherited through the decision that cites it.** `E ∈ D.sources` (a `sources:` path resolving under `atlas/evidence/`) and `bears_on(D, X)` ⇒ `X.evidence ∋ E.id`; and directly, `bears_on(E, X)` ⇒ `X.evidence ∋ E.id`. An evidence file that another evidence file's `supersedes` resolves to is dropped from every `evidence` list in favour of its superseder (the re-measurement chain), but keeps its `entries` row.

4. **Open and triaged bugs only (3.4 fifth revision).** `affects(B, X)` ⇒ `X.bugs ∋ B.id` **iff** `B.status ∈ {open, triaged}`. A `resolved` bug keeps its `entries` row and appears in no subject's `bugs` — the list is the "currently broken" surface, and a fixed bug on it is the stale ticket the brief spent an evening disproving. Rules have no currency condition beyond `status: retired` (skipped entirely): `derived(R, X)` ⇒ `X.rules ∋ R.id`.

Observations follow the same shape without a currency condition: `bears_on(O, X)` ⇒ `X.observations ∋ theme(O)`. **Transitive closure over `depends_on` is deliberately out of scope**: a decision bearing on spec S does not thereby bear on every spec depending on S — no step-3 consumer asks that question, and answering it would multiply every subject's lists by the depth of the dependency graph, burying the direct edges the hook is meant to surface. It is a later MINOR if a consumer appears.

**Entries.** One row per scanned artefact whether or not it contributed a subject — `kind` (`decision | evidence | thread | observation`, and since the 3.4 fifth revision `rule | compass-doc | bug`), `title` (the frontmatter `title`; a thread's key text cut to 80 characters; an observation's theme; a compass document's first H1 or its stem), `path` (project-relative POSIX), `date` (`date`, `opened`, or `updated` respectively; a bug's `opened`; the **empty string** for a rule or a compass document, which sorts last and is omitted from a pointer line), `keywords` (the title's lowercase tokens of three or more characters, split on non-alphanumerics, plus every `bears_on` ref — or, for a rule or bug, every derived subject ref — verbatim; for a compass document the tokens of its **headings and bold spans only**, the first 40 distinct, never body prose — sorted, deduplicated; **never body text**, so the index carries no knowledge content, only names, which is the line §5's pointer grammar holds). Entry ids: `R-NNN`, `B-NNN`, `compass.<stem>`.

**Determinism.** `subjects` and `entries` keys sorted; every list sorted; two compilations of identical input are byte-identical except `generated`. **Builders:** `cortex scan` (after the constellation), `cortex init` (after its constellation compile), and the post-commit fast tier `cortex insight-refresh-fast` (which rebuilds it before its ledger gate, so a project with no insight extraction still gets a fresh index on every commit; a failure logs to `pulse/reports/hook-errors.md` and never fails the commit). Nothing else writes it. **Consumers:** none when 3.4 shipped — the bump shipped the index so step 3's hooks would have a file to read.

**Consumers (3.4 second revision).** Four, all read-only, all through one loader (`src/recall/query.ts`, owned by `hooks.search-annotate`) that caches the parsed file per process and treats a missing or malformed index as "no subjects", never as an error: (1) **`cortex hook search-annotate`** — `PreToolUse` on `Grep|Bash` (§5): the search's target path is expanded to candidate subject keys (the path, its parents up to the `.cortex/<module>` or `.specflow/<tree>` root, a spec id, a compass id, a domain term, a concept slug, and for this document every clause subject whose number or heading matches a pattern token) and its pattern tokens are matched against `entries[*].keywords`; at most two pointer lines. (2) **The PreRead recall marker** — the `PreToolUse` (Read) row (§5): one `Decided: … · Evidence: … · Open: …` line for reads of a spec, a compass rule, an atlas decision or evidence file, or this document (`hooks.pre-read-writeback` Rule 6). (3) **`cortex why <ref>` / `cortex recall <query>`** (`recall.why`): the subject block and its entries as a listing or `--json`; the keyword search over entries, top five. (4) **The generated index blocks** (`recall.index-blocks`, §7.1): `cortex scan` and `cortex init` render one line per decision and evidence entry — with the subjects it bears on, from inverting `subjects` — into the two atlas `_index.md` files. Every consumer emits **names, ids, dates and paths only** — the index carries nothing else, which is what makes the rule enforceable rather than promised. Nothing outside these four reads the file; no loop does. (The 3.4 third revision's `UserPromptSubmit` hook is deliberately **not** a fifth consumer: it needs a thread's `kind` and `status`, which this file does not carry, so it reads `pulse/threads/` directly — §4.5.3, §5.)

**Validated by** `check.recall-index` (new at 3.4; only when the file exists, like `check.constellation`): valid JSON; all required top-level keys; `schemaVersion` a `MAJOR.MINOR` string; every subject list an array of strings; every id in a subject list present in `entries`; every entry's `kind` in enum and `path` a non-empty string. Absence is never a finding — the file is regenerable. (3.4 fifth revision) `rules` and `bugs` are checked when present and tolerated when absent — an index written before this revision stays valid until the next `cortex scan` rewrites it; the `kind` enum is the seven-value one above. **Consumers of the new lists:** the search pointer emits `Recall: rule …`, `Recall: bug …`, `Recall: compass-doc …` in its existing shape (strength order open thread > bug > decision > rule > evidence > observation; `hooks.search-annotate` Rules 7–8); the PreRead marker gains a trailing ` · Bugs: <B-ids, max 2>` part and, for a **source file** whose subject has a non-empty `bugs` list, emits that part alone — the one narrow widening of the second revision's "source files are not marked" (`hooks.pre-read-writeback` Rule 6); `cortex why` lists `Bugs:` (with `owner`/`fix_in_flight`/`found_at_commit` read from the bug file, the second bounded frontmatter read) and `Rules:` (`recall.why` Rule 4); `pulse.usage` Rule 11 counts the `Bugs:` prefix. The generated atlas index blocks are unchanged (decisions and evidence only).

---

## 5. Hook payload contracts

From design §5, §6.3, §9.3. All hooks are pure Node file I/O, **warn-never-block** — they inject text into Claude's context and never abort the tool call — with the single, default-off, measured exception of the PreRead row's deferral mode (d) below (3.4 third revision; RULES.md rule 6). Budgets are hard targets the validator does not enforce at runtime but that the hook implementations MUST respect (design §6.3).

| Hook | Trigger | Injects | Budget |
|---|---|---|---|
| `SessionStart` | new session | Pointer block (below, incl. the 3.3 **entry line** under the `specflow` profile), plus a qualifying-entries **observations digest** (§4.10.11) when `insight/observations/` has one. *(The 3.3 second revision's coverage map and rationalization table were retired unbuilt at the 3.4 fourth revision — §0.)* | <100 tok pointer block; the digest separately budgeted at ≤150 tok. Two pools, never folded into one another — the digest is omitted entirely rather than trimmed at the block's expense |
| `PreToolUse` (Write/Edit) | before a write | One warning per matching rule (below), read from `compass/rules/` (re-rooted from `cerebrum/rules/`, addendum A1.5) | ~0 avg |
| `PostToolUse` (Write/Edit) | after a write | **Nothing (v3.0).** The v2.0 anatomy writeback (`tokens`/`sha256`/`last_seen`/`needs_purpose_refresh` on an `anatomy/files.md` row) is removed — `anatomy/` no longer exists (addendum A7.3). Schema 3.0 specifies **no replacement side-effect** (resolved at build-order-v3 step 7): intra-commit change tracking is owned by the post-commit fast tier (`cortex insight-refresh-fast`, §9); the hook stays registered and is a pure no-op. | n/a |
| `PreToolUse` (Read) | before a read | **Insight per-file entry summary (resolved at build-order-v3 step 7, design §5.10).** Data source: the target path's insight entry (§4.10.2), resolved scoped-or-flat by the query layer. (a) The payload's `{{PURPOSE}}` is the **first line of the entry's `## Purpose` section**; `{{TOKENS}}` is the entry's `size_tokens`; `{{APPLICABLE_RULE_IDS}}` stays compass-derived (`governs` glob match — unchanged); the legacy `{{SPEC_LINKS}}` field is **dropped** (its role lives in the entry's Connections section, read via `cortex insight file`, not injected — §5's no-insight-hook trust rationale caps this hook at the one-line purpose summary). (b) When the target path has **no insight entry**, the hook injects **nothing** — graceful absence, never fabrication: extraction owns entry creation. Template below. (c) **Recall marker (3.4 second revision).** When the target is a spec file, a compass rule, an atlas decision or evidence file, or this document, and `recall-index.json` (§4.11) holds a subject for it (the path, the spec id, `R-NNN`, or — for this document — every `schema:§…` subject aggregated), one line is appended, or stands alone when there is no insight entry: `Decided: <ids, max 3> · Evidence: <ids, max 2> · Open: <T-ids, max 2>` (empty parts omitted; ` · more: cortex why <key>` when cut). Source files are not marked in this revision. No subject or no index → no line, nothing logged. Owned by `hooks.pre-read-writeback` Rule 6. (d) **Read-deferral mode (3.4 third revision; `hooks.readDefer`, default off — the one carve-out from warn-never-block, RULES.md rule 6).** When `cortex.config.json` `hooks.readDefer` is `true`, the session is interactive (the transcript's first user line is not a scheduled preamble), the target is a source file — not a (c) kind, not under `.cortex/` or `.specflow/`, not `RULES.md`/`CLAUDE.md`/this document/an `_index.md`/`_overview.md` — with an insight entry of `size_lines ≥ 40`, the path is in neither the session's read-memory nor its deferral ledger `pulse/state/read-deferred/<session-id>`, and that ledger holds fewer than 25 lines: the hook appends the path to the deferral ledger **then** emits `{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": …}}`, exit 0. The reason is four pinned lines — `Deferred: <path> (~<tokens> tok, <lines> lines). <Purpose first line>` / `Connections: <up to six "<path>: <symbols>" from the entry's Uses/Used-by bullets, or ->` / `Rules: <ids or ->.` / `Reading this path again proceeds without this notice.` — trimmed by dropping Connections items then the purpose, never the first or last line. The second Read of the path always gets the ordinary (a)–(c) payload (no duplicate-read note — nothing was read). A ledger that cannot be written, an unknown session kind, or any exception → the ordinary payload, never a deny. Owned by `hooks.pre-read-writeback` Rule 7; measured by `pulse.usage` Rule 13. (e) **Stale marker (2026-09-17).** When the entry's `source_sha256` no longer equals the sha256 of the target's current body — the §4.10.4 comparison, made in-process, never by git — the (a) summary line ends with ` (stale: built at <built_at_commit, first 7 chars>)` and the (d) reason's first line carries the same marker after the purpose; the marker counts toward the existing budgets and is never trimmed (the purpose is), and an unreadable target means no marker. Owned by `hooks.pre-read-writeback` Rule 8; its pull-time twin is the header line of `cortex insight file` (§4.10.8, `insight.cli` Rule 9). | summary <50 tok (RULES 11); <75 tok with the writeback invitation (the v2.0 two-budget precedent); the recall marker adds ≤50 — **combined ceiling 100, or 125 with the invitation** (one extended figure, RULES 11); the (d) deny reason **≤250 tok**, a separate pool because it replaces a read rather than riding on one, emitted at most once per file per session and at most 25 times per session |
| `PreToolUse` (Grep/Bash) (3.4 second revision) | before a search — `Grep` tool calls, and `Bash` commands whose segments are real searches per `pulse.usage` Rule 8 (`grep`/`egrep`/`fgrep`/`rg`/`find` with a path operand; a pipe filter never fires) | **Recall pointer lines, from `recall-index.json` only (§4.11).** The target path's candidate subject keys and the pattern's tokens (lowercase, ≥3 chars, split on non-alphanumerics, a fixed stop-list removed; ref-shaped spans verbatim) are matched against `subjects` and `entries[*].keywords`; a subject match beats a keyword match, an entry needs two distinct token hits or one ref-shaped hit, and within a subject an open thread beats a current decision beats evidence beats an observation. Emits the fewest lines that carry the strongest match, in the pointer grammar below; the same subject or entry is not pointed at twice in one session (`pulse/state/recall-fired/<session-id>`). Reads no frontmatter, no rule, no decision — only the index (and, for a search of this document, its heading lines). Owned by `hooks.search-annotate`. | ≤60 tok, at most 2 lines, **on a match only**; otherwise empty stdout. Target latency 50 ms |
| `UserPromptSubmit` (3.4 third revision) | the human submits a prompt (no matcher — the event supports none) | **Open-thread routing, from `pulse/threads/` only (§4.5.3) — never the recall index.** Silent for harness-shaped prompts (`hooks.session-end` Rule 7's markers, teammate messages, system reminders, the scheduled-task preamble). Two deterministic modes: **resumption** — on the session's first prompt (no `pulse/state/recall-fired/<session-id>` and no Stop companion yet), the newest `pulse/sessions/` record, if interactive and ended within 7 days, has its still-open `question`/`offer` threads surfaced regardless of vocabulary; **mention** — a prompt that names an open thread's `T-NNN` id, or shares two or more distinct tokens (the Grep/Bash row's tokeniser) with an open `question`/`offer`/`approval` thread's key text, surfaces it. `finding` and `artefact` threads never. At most two `Open:` lines in the grammar below, newest first, ` · more: cortex thread list` when more qualified; the same thread is never pointed at twice in a session (the shared `recall-fired` memory, so a thread the search hook already named is not repeated here, or vice versa). Envelope `{"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": …}}`; **never exit 2** (which would erase the prompt), never a `decision`. Owned by `hooks.prompt-route`. | ≤60 tok, at most 2 lines, **on a match only**; otherwise empty stdout. Target latency 50 ms (one listing of `threads/`, one of `sessions/` on a first prompt, no transcript or index read) |
| `PostToolUse` (Read) | after a read | **Nothing injected; read-time capture into insight (resolved at build-order-v3 step 7, design §5.10).** Sweeps the transcript tail for `<cortex:purpose>` tags (the v2.0 mechanic) and applies a valid tag to the target's **existing** insight entry: the `## Purpose` section's content is replaced with the corrected one-liner plus the read-time provenance trailer `*(read-time, claude-sessions/<user>/<id>)*` (§6 citation form) — frontmatter (extraction metadata) untouched. A tag whose file has **no entry is dropped-and-remembered** (extraction owns creation). PreRead suppresses its invitation while the marker is present. | n/a (empty stdout) |
| `SessionEnd` (3.3 third revision) | session ends (every `reason` — registered with no matcher, `timeout: 10`) | **Nothing injected; the session record (§4.5.3).** Reads the transcript in two bounded passes — the last **2 MiB** fully parsed for message-level fields, the whole file scanned only for cheap trigger substrings (title, tool uses, finding tags, open thread ids) with a 64 MiB cap — and writes `pulse/sessions/<session-id>.json` plus the threads it opens or answers in `pulse/threads/` and any scratchpad copies under `pulse/scratch/<session-id>/`; takes the final assistant text from the Stop companion file when the transcript lagged, then deletes that file. Stdin fields (`hook_event_name`, `session_id`, `transcript_path`, `cwd`, `reason`, optional `prompt_id`, `scratchpad_dir`, `permission_mode`) are Claude Code's convention — read as optional strings, never branched on, degrade when absent. Claude Code ignores this hook's exit code and output. Writes pulse only; never compass/atlas/insight/specs. Owned by `hooks.session-end`. | none injected; wall-clock <100 ms typical (transcript ≤4 MiB) inside the explicit 10 s timeout; no work proportional to `pulse/` size |
| `Stop` (3.3 third revision) | assistant turn ends | **Nothing injected, no decision; one state file.** Writes `pulse/state/sessions/<session-id>.last.json` = `{ text: last_assistant_message (≤2000 chars), at }` (§4.5.3) and nothing else; missing input → no write, no log. Never emits `decision`/`continue`/any JSON. Owned by `hooks.session-end` Rule 11. | none injected; <5 ms |

**SessionStart payload:**
```
Cortex is active (schema {{SCHEMA_VERSION}}). See .cortex/_index.md.
Modules: {{PRESENT_MODULES}}.
{{#if specflow profile AND specflow-entry installed}}Entry: run `specflow-entry` first — classify the request, then run the skill it routes to.{{/if}}
{{#if fresh hygiene-report}}Hygiene: {{ONE_LINE_SUMMARY}} (.cortex/pulse/reports/hygiene.md).{{/if}}
{{#if qualifying observations}}Observations: {{OBSERVATIONS_DIGEST}} (more: .cortex/insight/observations/).{{/if}}
```
The **entry line** (new at 3.3) re-arms the process gate each session: it is included only when the project's `profile` is `specflow` (§10.1) **and** `.claude/skills/specflow-entry/` is present, so a `superpowers` project — or one that never installed the bundle — sees nothing. It is a pointer, not an instruction the hook enforces: hooks are warn-never-block (RULES 6), and this one only reminds. It rides inside the same <100-token pointer budget as the two lines above it, and is the first line trimmed if the budget is tight.

The hygiene line is included only if `.cortex/pulse/reports/hygiene.md` exists and its `generated` is within `cortex.config.json` `pulse.hygieneFreshnessHours` (default 48). The hook **reads** the report; it never re-runs hygiene (design §10.4). The observations line is included only if `insight/observations/` has at least one qualifying entry (§4.10.11 — `salient: true` or `sessions:` count ≥ 3); `{{OBSERVATIONS_DIGEST}}` renders every qualifying entry as a compact one-liner within its own **≤150-token** budget, separate from and additional to the pointer block's <100-token figure above — the two never share a pool. Absent `insight/observations/`, or zero qualifying entries, the line is omitted entirely, same convention as the hygiene line.

**PreToolUse (Write/Edit) warning** — emitted once per compass rule whose `governs` glob matches the target path OR whose `check.pattern` matches the proposed content:
```
⚠ Cortex {{RULE_ID}} may apply to {{PATH}}: {{RULE_TITLE}}.
  Source: {{SOURCE_PATHS}}. {{ONE_LINE_GUIDANCE}}
```
No matching rule → no output (the zero-overhead common case).

**PreToolUse (Read) payload (v3.0, resolved at build-order-v3 step 7 — supersedes the v2.0 anatomy-row template):**
```
{{PATH}}: {{PURPOSE}} (~{{TOKENS}} tok). Rules: {{APPLICABLE_RULE_IDS}}.
If this purpose is wrong or stale after reading, emit: <cortex:purpose file="{{PATH}}">corrected one-line purpose</cortex:purpose>
```
`{{PURPOSE}}` = first line of the insight entry's `## Purpose` (§4.10.2); `{{TOKENS}}` = the entry's `size_tokens`; empty rule list renders `-`. **No entry → no output** (the zero-overhead common case, like PreWrite's no-matching-rule case). The invitation line is suppressed when the Purpose section already carries the read-time provenance marker (a witnessed correction is not re-litigated) and never trimmed — budget enforcement trims the purpose text only. A third line `(already read this session)` MAY ride along on duplicate reads (implementation-carried from v2.0).

**PostToolUse (Read) capture (v3.0, resolved at build-order-v3 step 7).** The tag sweep is the v2.0 mechanic; the write target changes: a valid tag (non-empty, single-line, ≤120 chars) whose file has an existing insight entry rewrites ONLY that entry's `## Purpose` section to the corrected purpose + `*(read-time, claude-sessions/<user>/<id>)*`. Invalid tags and tags for entry-less files are logged to `pulse/reports/hook-errors.md` and remembered (never retried); nothing is ever created. This is read-time purpose capture integrated into insight, tagged `read-time` (design §5.10) — the entry's extraction frontmatter is never touched by the hook.

**Recall pointer lines (3.4 second revision; third shape at the third revision) — the grammar, recorded once.** Three line shapes: the first two emitted by the `PreToolUse` (Grep/Bash) hook and, the second shape only, by the PreRead recall marker; the third by the `UserPromptSubmit` hook. `pulse.usage` Rule 11 counts fired and followed pointers by the line prefixes `Recall:`, `Decided:`, `Evidence:`, `Open:` and — 3.4 fifth revision — `Bugs:` (the PreRead marker begins with `Evidence:` or `Open:` when its `Decided:` part is empty, and with `Bugs:` on a source-file read whose only recall is an open bug):
```
Recall: {{KIND}} {{YYYY-MM-DD}} {{TITLE cut to 60}} ({{PATH}})
Decided: {{DECISION_ID}} · Open: {{T-ID}} {{THREAD KEY TEXT cut to 40}}
Open: {{T-ID}} ({{YYYY-MM-DD opened}}) {{THREAD KEY TEXT cut to 80}} ({{PATH}})
```
`{{KIND}}` is `decision | evidence | thread | observation` and, 3.4 fifth revision, `rule | compass-doc | bug` (§4.11 — for an entry whose `date` is empty the date field is omitted, and for `rule` and `bug` the id precedes the title: `Recall: rule R-014 <title> (<path>)`); `{{PATH}}` is the entry's project-relative path from the index (for the `Open:` shape, the thread file's path from the ledger); the PreRead marker's `Decided:` form carries lists — `Decided: <ids, max 3> · Evidence: <ids, max 2> · Open: <T-ids, max 2> · Bugs: <B-ids, max 2>` (the `Bugs:` part is the fifth revision's, cut last; `hooks.pre-read-writeback` Rule 6) — with empty parts omitted. The last line MAY end with ` · more: cortex why {{REF}}` when the subject holds more than was shown, or — the `Open:` shape — ` · more: cortex thread list` when more threads qualified than were shown; under budget pressure the `Open:` key text is cut to 40 then 20 before the second line is dropped, and ids, dates and paths are never cut. Every token is a name, an id, a date or a path taken from `recall-index.json`; **no line ever carries body text** (the index has none, §4.11) and **no line is an imperative** — no "read", "consult", "check", no second person: Claude Code injects its own autonomy text, and a Cortex line that instructs is a line that gets learned as ignorable (the 2026-09-02 Fable 5.1 adaptation audit). Titles are cut on a word boundary with a trailing `…`; ids are never cut. Owned by `hooks.search-annotate` Rule 7.

**Envelope (pinned to the Claude Code hooks API, verified 2026-07-02).** All Cortex hooks communicate via **exit 0 + stdout JSON**: SessionStart emits `{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": …}}`; the PreWrite warning, the PreRead summary and — 3.4 second revision — the Grep/Bash pointer emit `{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "allow", "additionalContext": …}}` (the pointer hook emits it on a match only, empty stdout otherwise); the `UserPromptSubmit` router (3.4 third revision) emits `{"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": …}}` on a match only; PostWrite, PostRead, SessionEnd and Stop emit nothing (empty stdout). No Cortex hook ever exits 2, exits non-zero, or emits `ask`, the Stop hook never emits a `decision`, and no hook emits `deny` **except** the PreRead row's (d) deferral mode (3.4 third revision) — `hooks.readDefer`, default off, one `deny` per file per session with the retry always proceeding, RULES.md rule 6's single measured exception — so warn-never-block is enforced by the envelope itself everywhere but that one flagged, counted path. Hook-internal errors degrade (operation proceeds) and append to `pulse/reports/hook-errors.md` (§4.5). Registration entries use the command signature `cortex hook <name>` — that prefix is the **ownership marker** (the JSON transposition of §8's CLAUDE.md marker idiom); tooling manages only entries carrying it.

**No insight hook, save one narrow exception (v2.0 stance, carved out at 3.1).** The insight module adds no hook of its own and, PreRead/PostRead aside, no field to any *other* existing hook payload. Insight is pull-first via the CLI (§4.10.8) for everything except one thing: the SessionStart row carries the qualifying-entries **observations digest** (§4.10.11, new at 3.1). Injecting unreviewed inferred *assertions* at SessionStart or PreRead beyond this would spend the trust budget on the layer with the weakest trust warrant, and the enforcement channel (PreWrite) reads compass precisely because compass is gated (v2 design §7.4; addendum A1.5, A4.0). *History:* the 3.3 second revision widened this once, to permit insight **concept names** inside a SessionStart coverage map, on the measured finding that pull alone was not reached for (atlas decision 2026-08-05, whose finding stands); the map was never built and the widening was retired with it at the 3.4 fourth revision (atlas decision 2026-09-16) — what is decided, measured and open about a subject now reaches a session through the recall pointer lines below, at the moment of the read, search or prompt, and never at session start.

**Validated by** `check.hook-config`: the hook entries `cortex init` (or `cortex sync`, refreshing an existing project's registration) writes to `.claude/settings.json` match the registered hooks; the Read-pair entries (PreRead + PostRead, together) are present iff `cortex.config.json` `hooks.preRead` is true — which is the default; and (3.3 third revision) the `SessionEnd` entry `cortex hook session-end` and the `Stop` entry `cortex hook stop` are both present whenever the settings file carries **any** `cortex hook ` entry (a project whose hooks Cortex manages must carry the whole set — the remedy the violation names is `cortex sync`; a settings file with no Cortex-owned entry at all is not implicated, as before); and (3.4 second revision) the `PreToolUse` entry `cortex hook search-annotate` with matcher `Grep|Bash` is required under the same whole-set condition — it is not behind `hooks.preRead`, which is the Read pair's flag alone; and (3.4 third revision) so is the `UserPromptSubmit` entry `cortex hook prompt-route` (no matcher). `hooks.readDefer` registers nothing — it is a mode of the existing `cortex hook pre-read` entry. The payload *text* is the hooks' contract with Claude, asserted by the hook specs' tests, not by the validator.

---

## 6. Cross-reference conventions (the citation graph)

The frontmatter cross-references form the citation graph Claude walks (design §9.2). Two reference forms:

- **Paths** — relative to the **directory of the referring file**. Used to cross **trees** or point at non-spec artefacts.
- **IDs** — bare, resolved against a **project-global index** the validator builds in one pass. Used within a homogeneous set (dependency graph, coverage, rule/spec links).

| Field | On | Targets | Form | Validation |
|---|---|---|---|---|
| `implements` | dev leaf | one business spec | path | exactly 1; resolves; symmetric with target's `implemented_by` |
| `implemented_by` | business spec | dev specs | list<path> | each resolves; symmetric with each source's `implements` |
| `depends_on` | dev spec | dev specs | list<id> | each resolves; **no cycles** |
| `depends_on` | business spec | business specs | list<id> | each resolves; no cycles |
| `covers` | scenario spec | business specs | list<id> | each resolves |
| `governed_by` | dev spec | rules | list<id> | each resolves |
| `source` | rule | atlas decisions / bugs / [v2.0-legacy] insight prose | list<path> | each resolves; paths re-root into `compass/` (addendum A1.6) |
| `governs` | rule | files | list<glob> | well-formed; 0 on-disk matches → `warning` |
| `governs` | dev spec | files | list<glob> | identical to rule `governs` (intentional, §4.1); 0 on-disk matches → `warning` |
| `related_specs` | rule / atlas | dev or business specs | list<id> | each resolves |
| `affects` | bug | rule / file / spec | mixed list | resolve by shape: `R-*`→rule, path-like→file, else→spec ID |
| `compass_rules` | atlas decision | rules | list<id> | each resolves (renamed from `cerebrum_rules`, addendum A2.2) |
| `supersedes` | atlas decision | atlas decisions | list<path> | each resolves |
| `sources` | atlas leaf | atlas sources | list<path> | each resolves |
| `provenance.derives_from` | compass rule, dev spec, business spec, atlas decision | archive document / atlas decision / Claude session | path or `claude-sessions/<user>/<id>` | archive-path and `atlas/decisions/` references **MUST resolve**; `claude-sessions/<user>/<id>` references are **cited-not-resolved** (shape-checked only); the field's *presence* is optional — absence means "authored directly," not "unknown origin" (§6, addendum A6) |
| `bears_on` (new at 3.4) | atlas decision, atlas evidence, pulse thread (§4.5.3), insight observation (§4.10.11) | rule / bug / spec / domain term / insight concept / schema clause / file | mixed list, 0..n (evidence: 1..n), **resolved by shape**: `R-NNN` → rule; `B-NNN` → bug; `domain.<term>` → atlas domain term; `concept:<slug>` → `insight/concepts/<slug>.md` (or any `insight/scopes/*/concepts/<slug>.md`); `schema:§N[.M[.K]]` → a heading of `cortex-schema.md` (§6.2); a string containing `/` or starting with `.` → a project-relative file; anything else → a bare id in the global index (a dev or business spec, or any other indexed id) | the **only forward edge** in this table — it points from a conclusion to the subject it constrains, where every other row points backward to a source. On decisions and evidence (`check.bears-on`): a gated target (rule, bug, domain term, spec or other indexed id) that does not resolve → `error`; a concept, clause or file that does not resolve → `warning` (concepts are ungated and may not be extracted yet; a file may have moved; a clause may have been renumbered — see §6.2). On threads and observations: shape-checked only (ungated surfaces; their producers seed paths mechanically). The inverse — `decided_by`, `evidenced_by`, `threads_on` — is **computed, never stored**: no artefact carries a backward `bears_on` field, exactly as no artefact carries a `derived_by` (the provenance-index pattern, A6); the materialised inverse is the recall index (§4.11) |

**The v2.0 `spec_links` row (anatomy row → dev specs) is removed** — anatomy no longer exists; its role moves to insight's Connections section (§4.10.2, design §5.10, addendum A1.6).

**Global validation rules:**

1. **ID uniqueness** — every `id` across `.specflow/specs/`, `.specflow/specs-business/`, `compass/rules/`, `compass/bugs/`, and atlas is unique within its kind, and spec IDs (dev+business) are unique across **both** trees combined. Duplicate → `error`. (Insight node ids are *not* in this namespace — they use their own path-derived grammar, §4.10.6, and carry no uniqueness obligation of their own beyond within `graph.json`.)
2. **`implements` is single-valued** — zero or >1 on a leaf → `error` (design §8.1: many-to-one is a decomposition smell).
3. **Bidirectional symmetry** — `implements`↔`implemented_by` MUST agree in both directions. Asymmetry → `error` naming both files.
4. **Resolution** — every path resolves to an existing file (relative to the referrer); every ID resolves in the global index. Unresolved → `error`.
5. **Acyclicity** — `depends_on` graphs (dev and business, separately) MUST be acyclic. Cycle → `error` listing the cycle.
6. **Forward edges are seeded, never demanded** (3.4). `bears_on` is optional everywhere except on evidence, and Core seeds it wherever it drafts: a thread from the session's read ledger (§4.5.3), a promoted decision from its thread, a session-observe decision candidate from the originating session's read ledger (`insight.session-observe` Rule 6), a recorded usage measurement from its own instrument. A human adds or corrects; nothing waits on a human to fill it in — the measurement that motivated 3.4 (fields humans must fill go unfilled) is why.

### 6.1 `ValidationReport` (the validator's output contract)

The validator produces a `ValidationReport` — the structured result `validator.spec.md` references. Schema:

```json
{
  "schemaVersion": "3.0",
  "target": ".specflow/specs/",
  "conformant": false,
  "violations": [
    {
      "severity": "error",
      "check": "check.dev-spec",
      "clause": "§4.6",
      "location": { "path": ".specflow/specs/schema/validator.spec.md", "key": "implements" },
      "message": "implements must name exactly one business spec; found 2."
    }
  ],
  "counts": { "error": 1, "warning": 0 }
}
```

- `severity`: `error | warning`. `conformant` is `true` iff `counts.error === 0`.
- `location.key` (frontmatter key) and `location.line` are optional.
- `clause` cites the section of this document the check enforces.
- CLI rendering: a human-readable table for terminals; `--json` emits this object verbatim. Non-conformant → CLI exit `1`.

### 6.2 Addressable schema clauses — `schema:§N[.M[.K]]` (new at 3.4)

Every `ValidationReport.clause` already names a section of this document (`§4.6`, `§4.10.11`, `§6`), so the grammar exists; 3.4 makes it a **reference form** a `bears_on` list can carry: `schema:` followed by `§` and one to three dot-separated integers. A ref resolves when this document — `cortex-schema.md` at the project root — has a heading whose number is exactly that: `## N.`, `### N.M`, or `#### N.M.K`, matched on the heading line's leading number (the title text after it is not part of the ref, so a retitled section still resolves). Resolution is deterministic and **cached per validate run** (the document is read once, its headings indexed once); an unresolvable ref is a `warning` naming the ref and the file, never an error — the document is revised in place (atlas decision 2026-07-10) and a renumbering is a real risk, which is exactly why a stale clause ref must surface as a warning that names itself rather than fail the tree. Appendix headings (`Appendix A`) and the unnumbered `§0` decisions list are not addressable; a ref to them does not resolve. Owned by `schema.schema-clauses`.

**Renumbering.** Sections are never renumbered within a MAJOR: new material is appended as the next subsection number (this section is `6.2` because `6.1` existed), and a removed section leaves its number vacant. A MAJOR that renumbers must list the old→new map in its §0 note so refs can be rewritten by `cortex migrate` (§10.4).

---

## 7. `_index.md` and `_overview.md` formats

### 7.1 `_index.md` — the active-prompt format (every `.cortex/` directory)

An `_index.md` is **a prompt disguised as documentation** (design §6.2): it tells Claude *when* and *how* to read into the module, not what the module abstractly is. Hard budget **<300 tokens** (design §6.3).

Required shape:

```markdown
# <Module/Dir> — index

**Read this when:** <the trigger conditions, 1–2 lines>

**What's here:**
- `<file-or-subdir>` — <what it holds and when to open it>

**How to navigate:** <how to walk the citation graph from here — which frontmatter
fields to follow, what resolves to what>
```

Filled example (`compass/_index.md`, renamed from `cerebrum/_index.md`, addendum A1.7):
```markdown
# Compass — index

**Read this when:** the user asks "why" about a convention or decision, before you
propose a write that touches governed files, or when triaging a bug.

**What's here:**
- `rules/` — one file per rule (R-NNN). Match a write's path against each rule's `governs`.
- `bugs/` — the bug ledger (B-NNN), classified by the seven-type taxonomy.
- `conventions/`, `preferences.md`, `environment.md` — project conventions and operational pointers.

**How to navigate:** from a rule, follow `provenance: derives_from:` to the atlas decision
(or archive document) that justifies it — decisions live only in `atlas/decisions/`, cited
not copied. Follow `governs:` to the files it constrains; `related_specs:` to the specs it
touches.
```

**Pulse subdirectory carve-out (resolves B-008).** Directories nested **below** `.cortex/pulse/` — `reports/`, `state/`, `state/reads/`, `extraction/`, `extraction/fragments/`, and any future machine-managed pulse subdirectory — are **exempt** from the `_index.md` requirement: they are machine-managed working directories, not human-navigable modules, and an `_index.md` in each would be transient noise the loops must maintain. `pulse/` itself still requires its `_index.md` (the active prompt that describes the whole subtree). `check.index-present`'s exemption for these paths is implemented in `src/schema/checks/layout.ts`; this section is the contract it enforces.

**Generated recall block in the two atlas indexes (3.4 second revision; `recall.index-blocks`).** `atlas/decisions/_index.md` and `atlas/evidence/_index.md` MAY carry one managed block delimited by `<!-- cortex:recall:start v{{SCHEMA_VERSION}} -->` and `<!-- cortex:recall:end -->` on their own lines — the §8 marker idiom with a `recall` discriminator so CLAUDE.md tooling never matches it. `cortex scan` and `cortex init` (never the post-commit tier, never a hook, never `cortex validate`) render it from the compiled recall index (§4.11): a heading line, then `- <YYYY-MM-DD> <id> — <title> · bears on: <subjects, max 4>` per decision or evidence entry, newest first, collapsing the tail to `- … and N more (\`cortex recall --kind <kind>\`)` so the **whole file** stays within this section's 300-token budget by the validator's own estimator. Text outside the markers is preserved byte-for-byte; a file whose entries are empty carries no block; an unchanged block is not rewritten; `cortex sync` compares the file to its template with the block removed (`core-cli.sync` Rule 4). The block lists names, ids, dates and subjects — never a decision's reasoning or a finding's value.

**Validated by** `check.index-shape`: `_index.md` present in every `.cortex/` directory (except the pulse subdirectories carved out above); contains the `Read this when:` and `What's here:` headings; soft token-budget check → `warning` over 300 — the generated recall block counts toward that budget and is sized to it, so a clean file stays clean after `scan`.

### 7.2 `.specflow/specs/_index.md` — the engineering index

The dev-tree root `_index.md` is BOTH an active prompt AND the dependency/build index. Required sections: a short `Read this when:` prompt, `## Domains` (list with one line each), `## Dependency Graph` (textual edges or a note), `## Build Order` (topological phases; see design §16.2). **Validated by** `check.specs-index`: present; has the three section headings.

### 7.3 `_overview.md` — folder overview (every dir in both spec trees)

Format from the folder-overview template: `## What this is`, `## What it covers`, `## Why it's grouped this way`, optional `## Related groups`. Dev-tree tone may use IDs/paths; business-tree prose MUST NOT contain file paths or IDs except under `## Related groups`. **Validated by** `check.overview-shape`: the three required headings present; business-tree body path/ID scan → `warning`.

### 7.4 `insight/_index.md` — the ungated-module active prompt (v3.0, supersedes the §7.4 v2.0 template)

`insight/_index.md` follows the §7.1 active-prompt shape (validated the same way by `check.index-shape`) with one module-specific requirement: because insight is the sole **ungated** module, its index MUST state the trust model — a `Read this when:` or navigation line that names insight as unreviewed and points at the CLI as the query surface. This is where Claude learns *how much to trust* what it finds, not just the file list. Locked as template text (design §5.13; RULES 11 `_index.md` budget <300 tokens):

```markdown
# Insight — inferred codebase understanding (ungated)

This module holds Cortex's inferred understanding of THIS codebase:
per-file entries (purpose, main players, insights, file map,
connections), concepts, and the semantic graph. Inferred, not
curated — context, not authority. Where insight conflicts with a
compass rule or a spec, the gated layer wins.

Query it; don't read these files directly:
- cortex insight file <path>     — the rich per-file entry
- cortex insight concept <name>  — how a concept lives in the code
- cortex insight element <query> — a function / class / constant

Before substantive work on a file, query its insight entry; before
cross-file or concept-touching changes, query the concept
(see the "Cortex Insight" block in CLAUDE.md).

Layout: per-file entries under anatomy/ (or scopes/<scope>/anatomy/
when scoped); concepts under concepts/; the semantic graph in
graph.json / tags.json / clusters.json; the scope tree in
scope-registry.yaml; session-learned context (grain of salt) under
observations/. Kept current by the insight-refresh loops (fast /
daily / full) and enriched by cortex-loop-session-observe.
```

**Validated by** `check.insight-index` (redefined) + `check.index-shape`: body names insight as ungated/unreviewed and references `cortex insight` (`warning` if the trust-model line is absent).

---

## 8. CLAUDE.md Cortex section template

`cortex init` injects this block into the project's CLAUDE.md (design §6.1). Hard budget **<400 tokens** for the whole Cortex section (both H2 blocks below combined; RULES 11). Substitution points in `{{…}}`.

**Acknowledged overage.** By this document's chars/4 estimate the filled block below runs to roughly **590 tokens** — already over the stated <400 budget before the one-line `insight/observations/` addition below (which itself was trimmed as tight as it will bear), and over by a wide enough margin (~190 tokens) that this predates the 3.1 work entirely. This schema does not silently widen the stated budget to match: **<400 remains the target**, and this block needs its own RULES-11 trim pass, independent of and not owned by this amendment — flagged here rather than quietly tolerated.

```markdown
<!-- cortex:start v{{SCHEMA_VERSION}} -->
## Cortex

Cortex is active on **{{PROJECT_NAME}}**. The knowledge layer lives in `.cortex/`:

- `compass/` — rules, conventions, and the bug ledger. The "why" and the "must".
- `atlas/` — stakeholders, decisions (narrative), domain terms, source materials.
- `archive/` — ingested source documents (client specs, transcripts, contracts) and their structured extractions.
- `insight/` — inferred understanding of the codebase itself. See "Cortex Insight" below.

**Protocol:** before working a task, read the relevant `_index.md` first — they are
prompts that tell you what to read and when. This applies more, not less, to sessions
that dispatch, review or plan rather than edit: everything reaches them as a claim, and
`compass/` is where claims are checked. For "why" questions, grep `compass/` and
`atlas/`. For unfamiliar terms, check `atlas/domain/`. Follow frontmatter
cross-references (the citation graph) to trace any claim to its source.

**Placement:** durable knowledge lives in `.cortex/` (tracked, except `atlas/sources/`,
`pulse/` and archived raw sources).{{PLACEMENT_TAIL}}

Specs are the source of truth: `.specflow/specs-business/` (outcomes) and
`.specflow/specs/` (implementation), linked by `implements:`/`implemented_by:`. Don't
let the trees drift.

Modules present: {{PRESENT_MODULES}}. Schema: {{SCHEMA_VERSION}}.

## Cortex Insight

This project has a Cortex insight layer at .cortex/insight/ that
contains rich per-file understanding, concept extraction, and
semantic connections across the codebase. It is queryable via
the `cortex insight` CLI.

Read the file itself when you're going to modify it, need exact
syntax, or the change requires knowing every line. Query insight
instead when you're trying to understand what a file does, whether
it's relevant, how it relates, or what its main pieces are — a
richer resume than reading 500 lines and remembering fragments.
Consult insight first; read the file when you need exactness.

- cortex insight file <path>      — rich per-file understanding
- cortex insight concept <name>   — how a concept lives in the code
- cortex insight element <query>  — atomic element (may return
  "no rich entry"; still discoverable via the file entry)

Also check `insight/observations/` for session-learned context
(audience, scale, intent) the code alone can't show.

Insight is inferred, not curated. Where it conflicts with a compass
rule or a spec, the gated layer wins — context, not authority.
<!-- cortex:end -->
```

**3.4 fifth revision (wave follow-up B; `core-cli.init` Rule 10, `core-cli.sync` Rule 3).** Three template changes. (a) The protocol paragraph's second sentence — pinned verbatim above — names the **non-implementer roles**: the parallel-wave brief's coordinator followed "do not read source" into never opening `compass/` in sixteen hours, and no wording anticipated it (brief §1.1; `scaffolding.assistant-reaches-for-cortex-instead-of-guessing` business rule 3). (b) One **placement paragraph**, generated from `cortex.config.json`, replaces any split guidance about where prose lives (brief §5): `{{PLACEMENT_TAIL}}` is ` \`<placement.localNotesDir>\` is local and untracked: notes there do not travel — promote them into \`.cortex/\` instead of tracking the directory.` when `placement.localNotesDir` is set (§10.1), followed by ` This repository is public: compass and atlas carry pointers, never hosts, ports or account ids (RULES.md rule 20).` when `visibility.repo` is `public`, or ` Repository visibility is unknown — set \`visibility.repo\` in \`cortex.config.json\`.` when it is `unknown`; nothing when `private` and no notes directory. `cortex sync` re-renders it from the config as it stands. (c) The two-sentence insight mandate ("Before substantive work on any file, query its insight entry… This is not optional.") is **gone from the template**: the 3.3 second-revision note recorded its removal on the measured finding (followed twice in 55 sessions) and the template never followed; (a) and (b) together cost more than what (c) removes — measured at implementation: the default-config block grew from 2,345 to 2,564 characters (+219, about 55 tokens; the mandate removed 157, the role sentence, placement paragraph and unknown-visibility tail added 376), so the acknowledged overage above grows by that amount, accepted because both additions were approved on their content and the block is still rendered once per session. `check.claude-md` is unchanged — markers and version only; the paragraph text is pinned by the init spec's tests.

The `<!-- cortex:start … -->`/`<!-- cortex:end -->` markers delimit the managed block so `cortex init` (on a fresh project) or `cortex sync` (repairing/upgrading an existing one) can update it idempotently without touching the rest of CLAUDE.md — both write the same block by the same marker contract; `cortex sync`'s own scope and behaviour are specified by its dev spec, not here. *(v3.0 interpretive note: the addendum (A1.8, A4.8) specifies the `## Cortex` bullet re-root and the `## Cortex Insight` block verbatim; the one-line `archive/` bullet above is this schema's own necessary addition for a module the addendum introduces but didn't separately spec a CLAUDE.md bullet for. Reviewed at v3.0 fold-in cleanup: the wording (one-clause description plus a parenthetical example list) matches the voice and detail level of the `compass/`/`atlas/`/`insight/` bullets above it — no change needed.)* **Validated by** `check.claude-md`: if CLAUDE.md exists, the managed block is well-formed and its `v…` matches `cortex.config.json`. **The same marker idiom, with a discriminator, delimits the generated recall block in `atlas/decisions/_index.md` and `atlas/evidence/_index.md`** (`<!-- cortex:recall:start v… -->` … `<!-- cortex:recall:end -->`, §7.1, 3.4 second revision); `check.claude-md` matches only the undecorated `cortex:start` form in CLAUDE.md and is not implicated by the recall block.

---

## 9. `loop.md` template (Decision 6)

Optional root file giving an autonomous `/loop` session its standing context (design §11). Written only when `cortex.config.json` `loop.enabled` is true.

```markdown
# Loop context

You are running as an autonomous loop on {{PROJECT_NAME}}. Cortex is your memory.

**Before acting:** read `.cortex/_index.md` and the `_index.md` of any module you'll
touch. You start cold every run — Cortex is how you recover what prior runs learned.

**Never mutate gated content.** Compass, atlas, `RULES.md`, and both spec trees change
only through the human gate — write proposals to `.cortex/pulse/` and the user applies
them via `cortex pulse-accept <id>`. You MAY maintain machine-owned ungated state directly
only if you are its designated owner loop (insight, in full — the three insight-refresh
loops and `cortex-loop-session-observe`'s ungated per-file enrichments and project-context
observations, §4.10, §4.10.11; addendum A7.3). Everything else is a proposal. (The narrow, spec-governed exceptions are the
test-runner's writer/verifier code path and bug-triage's fill-only classification.)

**Conform to the schema.** Every artefact you write carries schema-valid frontmatter
(schema {{SCHEMA_VERSION}}). Run the validator on anything you produce.

**Stop condition:** {{GOAL}}.
```

**Validated by** `check.loop-md` (only if present): contains the never-mutate-gated-content clause and a `Stop condition:` line.

### 9.1 Desktop scheduled-task naming (project scoping)

`~/.claude/scheduled-tasks/` is one global namespace per user, so every Cortex-managed task name MUST be project-scoped. The default form is plain:

```
<project-slug>-<canonical-task-name>
```

with a **hash6 collision fallback** applied only when the plain name is already owned by a *different* project:

```
<project-slug>-<short-hash>-<canonical-task-name>
```

- **`project-slug`** — the project root's folder name, slugged: lowercased; every character outside `[a-z0-9-]` replaced with `-`; consecutive `-` collapsed; leading/trailing `-` trimmed; empty result → `project`.
- **`canonical-task-name`** — the bundle's identity, applying to every Cortex-managed task. At v3.0, the former fourteen individual scheduled tasks are consolidated (owner-approved) into **five scheduled-task bundles**. Each bundle runs its **member loops sequentially, each member failure-isolated** — one member loop failing never aborts the others in the bundle:

  | Canonical | Cron | Model | Member loops (run sequentially, failure-isolated) |
  |---|---|---|---|
  | `daily` | `0 2 * * *` | `claude-sonnet-5` | pulse-hygiene, bug-triage, spec-drift, insight-refresh-daily, session-observe |
  | `weekly-curation` | `0 4 * * 6` | `claude-opus-4-8` | pulse-distil (now also carrying the retired skill-suggest's workflow-mining lens), rule-decay |
  | `weekly-quality` | `0 4 * * 0` | `claude-sonnet-5` | specflow-lint, specflow-verify, insight-refresh-full |
  | `test-runner` | `0 6 * * 0` | `claude-sonnet-5` | test-runner alone (the only code-writing loop, kept isolated by design) |
  | `monthly-review` | `0 6 1 * *` | `claude-sonnet-5` | atlas-staleness, onboarding-drift |

  The git-hook loop `cortex-loop-insight-refresh-fast` remains the **git post-commit hook** (replacing `anatomy-refresh-fast`), not a scheduled task. `skill-suggest` is **retired entirely** as a standalone task (owner decision): its one workflow-mining judgment folds into `pulse-distil` as an extra lens (see `pulse.distil`), not its own task or a distinct bundle member.
- **`short-hash`** — collision-fallback component only: the first 6 hex chars of SHA256 of the project root's absolute path (resolved, no trailing slash). Because the Desktop app derives the *displayed* task name from the id (dash→space, capitalize the first letter — e.g. `cortex-daily` displays as "Cortex daily"), the plain `<slug>-<canonical>` id doubles as the human-readable name; the hash is injected only on a proven collision so the common case stays scannable.
- **Ownership marker.** Every payload SKILL.md Cortex writes at a plain name carries a deterministic ownership marker — an HTML comment `<!-- cortex-project-root: <resolved-root> -->` stamped in the body (deliberately not a frontmatter key: the Desktop app parses the frontmatter, and an unknown key risks rejection). Collision resolution requires a **positive mismatch**: the plain dir must already exist *and* carry a marker naming a **different** project root before the hash fallback engages; an unmarked plain dir is claimed as ours. Recognition of "this project's own tasks" (for preserve / overwrite / clean-up) matches the plain or hash-fallback name plus, for a plain match, a marker that is absent or names this root.
- **Model pinning per bundle.** Each bundle's registry entry pins a `model` (the app's entry schema carries an optional `model` field): `claude-opus-4-8` for `weekly-curation` (the heavier curation/distillation judgment), `claude-sonnet-5` for the other four. Core owns the canonical→model assignment (the cadence/model table in `core-cli.tasks-register`); the skill never hardcodes it.

Example: a project at `/Users/me/dev/api` names its tasks `api-daily`, `api-weekly-curation`, `api-weekly-quality`, `api-test-runner`, `api-monthly-review`; a second, same-named project colliding on a plain name falls back to `api-a3f2b1-daily`, ….

**Payload vs. registration (B-009 correction; final mechanism).** A `~/.claude/scheduled-tasks/<scoped-name>/SKILL.md` directory is a prompt **payload** only — writing it registers nothing, because the Desktop app never scans that directory. **Registration** is an entry in the app's own registry, a `scheduled-tasks.json` under `~/Library/Application Support/Claude/claude-code-sessions/<uuid>/<uuid>/` (shape `{"scheduledTasks": [...], "recordedSkips": {...}}`; entries carry `id` = the scoped name, `cronExpression`, `enabled`, `filePath` = the absolute payload SKILL.md path, `createdAt` epoch ms, `cwd`, `useWorktree`, `permissionMode`) — a registry the app holds **in memory**, loaded once per launch and rewritten wholesale on every task event. The mechanism therefore has three parts: `cortex init` writes the payloads and prints the registration instructions on a fresh project — `cortex sync` refreshes those same payloads (and re-prints the instructions) on an existing one, e.g. after a bundle's member roster changes, without touching registration state itself; **registration itself happens in a Claude Desktop session via the `cortex-register-tasks` skill**, which reads `cortex tasks plan --json` (Core's authoritative plan) and drives the app's own internal `mcp__scheduled-tasks__*` MCP tools; `cortex tasks verify` detects silent loss. `cortex tasks register` — the direct registry write, upserting only the fields Cortex owns and preserving foreign entries and unknown fields verbatim — remains a **guarded fallback** that refuses to run while the Desktop app is running (in-memory clobber/wipe hazard; spec `core-cli.tasks-register`).

**The task name is registration identity only** — the SKILL.md frontmatter `name:` carries the scoped bundle name, but the prompt body invokes each member's *underlying skill* by its real name, one after another. Since spec `loops.cortex-loop-bundle` the eleven per-loop bundles are one callable-only `cortex-loop` skill, so a loop member is named as that skill plus its reference file (`cortex-loop` → `references/hygiene.md`); members with a skill of their own (`specflow-lint`, `specflow-bugs`, `specflow-tests`, `cortex-extract-insight`) are still named directly. Tooling recognises its own project's tasks by the plain `<slug>-<canonical>` name (disambiguated by the ownership marker) or the `<slug>-<hash>-` fallback prefix plus a canonical suffix, and ignores every other project's.

---

## 10. Schema versioning policy

### 10.1 Where the version lives

`.cortex/cortex.config.json` (committed). Minimum shape:

```json
{
  "schemaVersion": "3.0",
  "profile": "specflow",
  "hooks": { "preRead": true, "readDefer": false },
  "pulse": { "distilThresholdN": 3, "dismissedWindowDays": 90, "hygieneFreshnessHours": 48 },
  "harness": { "maxIterations": 3 },
  "loop": { "enabled": false }
}
```

**Required:** `schemaVersion` (string `MAJOR.MINOR`). All other keys optional with the defaults shown. **v3.3 addition:** `profile` (string, enum `specflow | superpowers`, default **`specflow`**) records the project's **process profile** — which build process the project runs, chosen at `cortex init` (`core-cli.init-profile`). Core stays process-agnostic (it is recorded, never enforced): the field's only consumer is scheduled-task writing, which scopes Bucket-3 spec-loop members out when the profile is not `specflow`. Bucket-1 knowledge loops are scheduled under every profile. Absent → `specflow`; an unknown value → `error`. `hooks.preRead` governs the **Read pair** (PreRead + PostRead) as one opt-out flag; `cortex init` writes it explicitly on fresh projects so the config self-documents. **3.4 third revision:** `hooks.readDefer` (boolean, default **`false`**) switches on the PreRead row's read-deferral mode (§5 row (d); `hooks.pre-read-writeback` Rule 7 — RULES.md rule 6's one measured exception). It registers no hook and changes nothing while `false`; `cortex init` writes it explicitly as `false` on fresh projects for the same self-documenting reason (`cortex sync` does not add it to an existing config — Rule 2 there touches `schemaVersion` only; absent means `false`). A non-boolean value is an `error`; `true` alongside `hooks.preRead: false` is a `warning` (the mode lives inside the Read pair's entry, so it cannot fire). **3.4 fifth revision:** `visibility` (object, optional) — `{ "repo": "public" | "private" | "unknown", "allow": [<glob>…] }`, `repo` default **`unknown`**, `allow` default `[]` (picomatch globs, project-relative, the `governs` grammar). It declares the repository's visibility, which Core cannot detect; `check.visibility` (`schema.visibility`, Appendix A) runs only when `repo` is `public` and warns, line by line, on operational specifics (IPv4 addresses, hostnames in an infrastructure context, host:port, `ssh user@host`, account identifiers) in tracked `compass/` and `atlas/` files, skipping files an `allow` glob matches — RULES.md rule 20. `cortex init` writes `"visibility": { "repo": "unknown", "allow": [] }` explicitly on fresh projects so the question is visible; `cortex sync` does not add it (absent means `unknown`). `placement` (object, optional) — `{ "localNotesDir": "<project-relative path>" }`, no default: the untracked prose directory, if the project keeps one, which the generated CLAUDE.md placement paragraph (§8) names as local and untracked. `check.config`: `visibility.repo` outside the enum, `visibility.allow` not a list of strings, or `placement.localNotesDir` not a string → `error`; either key absent → nothing. **v3.0 change (addendum A10.0):** the v2.0 `anatomy` block (`exclude`, `enhancement`) is removed with the anatomy module. The v2.0 `insight` block (`clusterCarryOverJaccard`, `promotionMinAgeDays`, `promotionMinObservations`) is **superseded** — those keys tuned v2.0 mechanics (prose cluster carry-over, promotion eligibility) that no longer exist; v3.0's insight config keys (auto-run threshold, significance-triage tuning, confidence-aging N) are **deferred to the insight-refresh loop spec** (design §10.3) and are not yet part of this contract. The `pulse` block MAY gain a `readsRetentionDays` key (default **14**) in a future MINOR — the age threshold for deleting `pulse/state/reads/<session-id>` ledgers (§4.5); it is **not yet a config option** (currently hardcoded as `READS_RETENTION_DAYS` in `src/pulse/hygiene.ts`). Config MAY also gain an `archive` block in a future MINOR; its keys are deferred to the archive ingestion spec. This addendum fixes only `schemaVersion`. **Validated by** `check.config`: valid JSON; `schemaVersion` present and parseable; unknown keys → `warning`.

### 10.2 Version semantics (semver-lite, MAJOR.MINOR)

- **MINOR bump** = backward-compatible: new optional fields, new artefact kinds, relaxed rules (3.4 is the canonical example: one new artefact kind, one new optional field, one new regenerable file, and nothing existing changed). A validator for `1.x` MUST accept any `1.y` project where `y ≤ x` cleanly, and SHOULD accept `y > x` treating unknown optional fields as `warning` (forward tolerance).
- **MAJOR bump** = breaking: a field removed/renamed, an optional field made required, a value's meaning changed, a directory moved. 3.0 is a MAJOR bump per this definition: `cerebrum` renamed to `compass` (directory moved); `anatomy` removed (module removed); `archive` added (new committed module); new required per-file-entry frontmatter (`built_at_commit`, `source_sha256`, §4.10.2); and `cerebrum/decisions.md` removed outright (addendum A10.0).

### 10.3 Validator behaviour on mismatch (replaces the design's per-artefact idea, Decision 3)

The validator declares a `supportedMajor` and `supportedMinor`. Reading `cortex.config.json` `schemaVersion`:

- **MAJOR > supported** → single `error` (`check.config`, clause §10.3): refuse to validate further against the wrong contract; tell the user to upgrade Cortex.
- **MAJOR < supported** → single `error` recommending `cortex migrate` (below).
- **MAJOR ==, MINOR > supported** → one `warning`; proceed with forward tolerance.
- **Equal** → proceed normally.

*(v3.0 note: this schema document declaring `3.0` does not, by itself, change the validator's `supportedMajor`/`supportedMinor` constants in `src/schema/version.ts` — those remain at `2`/`0` as of this fold-in and are bumped in build-order-v3 step 2, coupled with the `cerebrum`→`compass` rename, per that build order's own sequencing rationale. Until step 2 lands, a project declaring `schemaVersion: "3.0"` will trip the `MAJOR > supported` branch above.)*

### 10.4 Migration

A MAJOR bump ships a migration that `cortex migrate` (or `cortex init` on an existing project) applies. Moved/renamed paths leave a **deprecation marker** at the old location pointing at the new one (design §8.5), retained until the next MAJOR. Migrations are deterministic Core operations — no LLM. `cortex sync` — the standalone scaffolding-repair/upgrade command (§8, §9.1, §5) — is not a migration path: on a MAJOR schema lag it defers to this policy (refusing, or handing off to `cortex migrate`) rather than attempting a scaffolding refresh against a contract it doesn't recognize; its own deferral behaviour is specified by its dev spec.

**1.0→2.0 waiver (Decision 19 / v2 design flag F5).** This requirement is explicitly **waived for the 1.0→2.0 transition only**: there are no external users, and the Cortex repository itself moves `specs/`→`.specflow/specs/` (etc.) and gains `insight/` as part of the v2 build. No `cortex migrate` for 2.0 ships and no deprecation markers are left at the old `specs/` roots. The policy holds in full for every **future** MAJOR, once external users exist. (`cortex init` on a pre-2.0 project without the migration would treat the old trees as absent — acceptable because no such external project exists.)

**2.0→3.0 migration (Decision 19 v3.0 confirmation; addendum A10.0).** No blanket waiver applies at 3.0 — the policy above applies in full. `cerebrum`→`compass` (a directory rename) and the deletion of the now-duplicate `cerebrum/decisions.md` are deterministic Core moves; the `anatomy`→`insight` content absorption is **more than a rename** — it is a fresh re-extraction, not a path rewrite, since `anatomy/files.md`'s flat per-file table has no structural equivalent to move, only content to re-derive at a richer level. Whether `cortex migrate` ships for 3.0 and its exact mechanics are owned by the **module-migration spec** (design §10.3), sequenced as build-order-v3 step 2 — this schema records only that the policy applies and why the two halves (rename vs. re-extraction) differ in mechanism; it does not specify the migration tool itself.

**3.3→3.4 (MINOR; no migration).** `cortex sync` is the upgrade path, as for every MINOR: it rewrites `schemaVersion` and refreshes scaffolding, and nothing else is required. A `3.3` project validates clean at `3.4` untouched (§1: `atlas/evidence/` is present-tolerant; §4.11: the recall index is regenerable and absent-tolerant; §6: `bears_on` is optional). The first `cortex scan`, `cortex init --force`, or post-commit after upgrade writes `recall-index.json`; the first evidence producer creates `atlas/evidence/`. No skill bundle changes at 3.4, so the `SKILL_MIGRATIONS`/`SKILL_ADDITIONS` chains (`core-cli.sync` Rules 5–6) gain no entry.

**3.4 fifth revision (in place; wave follow-up B; still no migration).** `cortex sync` stays the upgrade path and gains one deterministic step (`core-cli.sync` Rule 15; `schema.id-registry` Rule 6): when `compass/registry.md` is absent it is **created once** from the `R-*.md` and `B-*.md` files present — the ids they already carry, in registry order — and never modified when present. Until sync runs, `check.id-registry` emits one warning naming it (never an error, since the files predate the registry). Everything else is present-tolerant: the three optional bug fields (§4.2), `visibility` and `placement` in the config (§10.1), the two new subject lists in the regenerable index (§4.11) and the CLAUDE.md block (§8, refreshed by sync as ever). A `3.4` project validates clean under the fifth-revision validator with at most that one warning. Skill text changes only (`specflow-bugs`, `specflow-spec-editor`, `specflow-entry`, `cortex-archive-ingest` wording); the chains gain no entry.

---

## Appendix A — Validator check catalogue

The mechanical check set (one row ⇒ one implementable check). Grouped by the design §3.2 facet. Merged at v3.0 per addendum §A8 (and its §A0.3 change ledger, which additionally lists `check.atlas` among the re-rooted checks even though the A8 delta table omits it — both are honoured here; see the note after the table).

| Check | Enforces | Clause | Severity on fail |
|---|---|---|---|
| `check.layout` | `.cortex/` directory layout: `compass/`, `atlas/`, `archive/`, rebuilt `insight/`; `cerebrum/` and `anatomy/` gone; `.specflow/`-rooted trees; (3.4) `atlas/evidence/` present-tolerant, its `_index.md` required when the directory exists | §1 | error |
| `check.index-present` / `check.index-shape` | every `.cortex/` dir (incl. `archive/`, `insight/`) has a well-formed `_index.md` | §7.1 | error / warning |
| `check.index-completeness` (new 2026-09-17) | `compass/rules/_index.md` and `compass/bugs/_index.md` reference every `R-NNN` / `B-NNN` file on disk — a literal id or a same-prefix range (`B-001–B-003`) counts; an index carrying `… and N more` or a generated block counts as complete; one warning per index, `index lists N of M` | §7.1 | warning |
| `check.insight-index` | `insight/_index.md` states the ungated trust model + names the CLI (redefined for v3.0 verbs) | §7.4 | warning |
| `check.specs-index` | `.specflow/specs/_index.md` shape | §7.2 | error |
| `check.overview-present` / `check.overview-shape` | every spec-tree dir has a well-formed `_overview.md` | §2.2, §7.3 | error / warning |
| `check.id-matches-path` | spec ID equals its path (tree root stripped, §2.2) | §2.2 | error |
| `check.rule` | compass rule frontmatter + `check` predicate; path re-rooted to `compass/rules/`; tolerates optional `provenance` | §4.1 | error |
| `check.bug` | compass bug frontmatter + taxonomy; path re-rooted to `compass/bugs/`; (3.4 fifth revision) optional `owner`/`fix_in_flight` strings and `found_at_commit` matching `/^[0-9a-f]{7,40}$/` — shape only | §4.2 | error |
| `check.compass-heading` (new 2026-09-17) | a compass rule's or bug's first H1, when it begins with an `R-NNN` / `B-NNN` token, agrees with `id:` (filename ↔ `id:` stays `check.rule` / `check.bug`'s error) | §4.1, §4.2 | warning |
| `check.atlas` | atlas artefact frontmatter; `cerebrum_rules`→`compass_rules`; tolerates optional `provenance` on decisions; (3.4) a decision with no `bears_on` → warning; a decision `sources:` entry under `.cortex/pulse/` → warning | §4.3 | error (frontmatter) / warning (the two 3.4 decision clauses) |
| `check.evidence` (new at 3.4) | `atlas/evidence/*.md` frontmatter: `id` shape + filename, `date`, `kind` enum, `instrument`, `window`, non-empty typed `findings`, non-empty `bears_on`, `supersedes` → evidence files; tolerates the directory being absent | §4.3 | error |
| `check.bears-on` (new at 3.4) | every `bears_on` ref on an atlas decision or evidence file resolves by shape (§6): rule / bug / domain term / spec / indexed id → error on miss; concept / schema clause / file → warning on miss; the clause resolver is §6.2 (cached per run) | §6, §6.2 | error / warning |
| `check.archive-layout` (new) | `archive/` layout: `documents/<slug>/` has `source.*` + `metadata.yaml` + `extracted/`; `_index.md`, `register.md`, `types/` present | §4.4 | error |
| `check.archive-metadata` (new) | `metadata.yaml` frontmatter (`id`, `kind`→resolves, `ingested_at`, `version`, `status`) | §4.4.1 | error |
| `check.archive-type` (new) | `types/*.yaml` shape (`id`==stem, `label`, `classification`, `extraction.strategy`, non-empty `outputs`) | §4.4.2 | error |
| `check.pulse` | pulse header presence; suggestion `**Type:**` present + in enum (incl. `decision-candidate`, and `evidence-candidate` at 3.4 — permitted root `.cortex/atlas/evidence/`, create payload only); `**Target:**` root permitted for its type; exactly one payload shape; **skips `threads/**`** (3.3 third revision — threads have their own check) | §4.5, §4.5.1, §4.5.2 | warning (header) / error (type/target/payload) |
| `check.threads` (new at 3.3, third revision) | `pulse/threads/T-NNN-*.md` frontmatter: `id` matches `T-\d{3,}` and the filename prefix; `kind` and `status` in enum; `opened` and `expires` iso-datetimes; `answered` and `resolved_by` present iff `status: answered`; `session` well-formed `claude-sessions/<user>/<id>`; `sessions` non-empty list of the same; `bears_on` a list of strings (shape only); ids unique across the directory; tolerates the directory being absent | §4.5.3 | warning |
| `check.provenance` (new) | `provenance` entries resolve (archive/atlas MUST; `claude-sessions` shape-only); maintains the backward-traversal index | §6, addendum A6 | error |
| `check.dev-spec` | dev-spec frontmatter + links; tolerates optional `provenance` | §4.6 | error |
| `check.rule-governs-resolves` | every glob in a compass rule's `governs` matches ≥1 real file | §4.1, §6 | warning |
| `check.dev-spec-governs-resolves` | every glob in a dev spec's `governs` matches ≥1 real file | §4.6, §6 | warning |
| `check.business-spec` | business-spec frontmatter + no-dev-content; tolerates optional `provenance` | §4.7 | error (frontmatter) / warning (content) |
| `check.business-status` | business status lags its all-implemented `implemented_by` (Policy A) | §4.7 | warning |
| `check.covers-resolves` | scenario `covers:` resolves | §4.8 | error |
| `check.insight-entry` (new; replaces `check.insight-prose`) | per-file entry frontmatter + section contract | §4.10.2 | error |
| `check.insight-scope-registry` (new) | `scope-registry.yaml` shape, path resolution, `depends_on` acyclicity | §4.10.3 | error |
| `check.insight-ledger` (new) | `ledger.json` + `reverse-index.json` shapes and node-id well-formedness | §4.10.4, §4.10.5 | error |
| `check.insight-graph` | `graph.json`/`tags.json`/`clusters.json` shapes (redefined: new node-id grammar, `edge_type`/`confidence` enums, non-empty `evidence`) | §4.10.6 | error (edge endpoint absent from `nodes` → warning) |
| `check.insight-observations` (new at 3.1; directory shape) | `insight/observations/` per-entry frontmatter (`kind`, `updated`, `salient`, `sessions`) + well-formed `claude-sessions/<user>/<id>` refs in `sessions`; (3.4) optional `bears_on` a list of non-empty strings, shape only; entry-directory `_index.md` present; tolerates the whole directory being absent | §4.10.11 | error |
| `check.xref-resolve` | all paths/IDs resolve | §6 | error |
| `check.xref-symmetry` | `implements`↔`implemented_by` | §6 | error |
| `check.xref-unique` | global ID uniqueness **within kind over every id the project index scans** — both spec trees combined, compass rules, compass bugs, atlas, scenario specs — read from the index's `id → files[]`, one error per duplicated id naming every file; a duplicated id resolves to nothing (2026-09-17, B-019) | §6 | error |
| `check.xref-acyclic` | `depends_on` acyclicity | §6 | error |
| `check.hook-config` | registered hooks match config; the Read pair iff `hooks.preRead`; (3.3 third revision) `SessionEnd` and `Stop` present whenever any Cortex-owned entry is; (3.4 second revision) the `PreToolUse` `Grep\|Bash` entry `cortex hook search-annotate` present under the same whole-set condition; (3.4 third revision) the `UserPromptSubmit` entry `cortex hook prompt-route` present under the same condition; `hooks.readDefer` implies no entry | §5 | error |
| `check.claude-md` | managed CLAUDE.md block (re-rooted: compass; anatomy bullet removed; insight block replaced) | §8 | error |
| `check.loop-md` | `loop.md` clauses (if present; re-pointed: compass, insight) | §9 | warning |
| `check.config` | `cortex.config.json` + version; `profile` enum (3.3); (3.4 third revision) `hooks.readDefer` boolean when present → non-boolean is an error, `true` with `hooks.preRead: false` a warning; (3.4 fifth revision) `visibility.repo` in `public\|private\|unknown`, `visibility.allow` a list of strings, `placement.localNotesDir` a string — each only when present | §10 | error (warning for the readDefer/preRead pairing and unknown keys) |
| `check.constellation` | `constellation.json` shape, id uniqueness, group/edge resolution (module enum `cerebrum`→`compass`; `anatomy` dropped; stays curated-only) | §4.9 | error |
| `check.recall-index` (new at 3.4) | `recall-index.json` shape (only when the file exists): required keys, `schemaVersion` string, subject lists are string arrays whose ids exist in `entries`, entry `kind` in enum, `path` non-empty; (3.4 fifth revision) `rules` and `bugs` lists checked when present, tolerated when absent; `kind` enum gains `rule \| compass-doc \| bug` | §4.11 | error |
| `check.id-registry` (new at 3.4, fifth revision) | `compass/registry.md` against `compass/rules/` and `compass/bugs/`: absent while rule or bug files exist → warning naming `cortex sync`; a malformed or duplicate-id line → error; a rule or bug file whose id is on no line → error naming `cortex id next <kind>`; a line with no file, or out of order → warning | §4.1, §4.2, §10.4 | error / warning |
| `check.visibility` (new at 3.4, fifth revision) | only when `cortex.config.json` `visibility.repo` is `public`: every tracked (not gitignored) `.md`/`.yaml` under `compass/` and `atlas/` scanned line by line for the five pinned families (IPv4, hostname in an infrastructure context, host:port, `ssh user@host`, account identifiers); files matched by `visibility.allow` skipped; at most 20 lines per file then a count | §10.1 | warning |

**REMOVED at v3.0 (5):** `check.anatomy-files`, `check.anatomy-graph`, `check.anatomy-purpose-source` (anatomy module removed, addendum A7.3); `check.insight-prose` (replaced by `check.insight-entry`); `check.insight-ownership` (the `map/` write-lane rule is obsolete under the new layout, §4.10.1).

**Reconciliation note (RULES 19).** Design §10.1 directs "rename `check.cerebrum-*` → `check.compass-*`." No check was ever literally named `check.cerebrum-*` in v2.0 — the cerebrum-reading checks were `check.rule`, `check.bug`, `check.layout`, `check.index-shape`, `check.rule-governs-resolves`. Their **IDs stay stable** (content-role-keyed, exactly as rule/bug node prefixes are content-keyed and survive the directory rename); only the **paths they read** re-root to `compass/`. This fold-in applies the design's *intent* (re-root every cerebrum-reading check) and records that the literal rename has no target (addendum A0.3). Separately: the addendum's own §A8 delta table omits `check.atlas` from its "re-rooted/redefined" list, while its §A0.3 change ledger explicitly includes `check.atlas` among the 11 re-rooted checks (`cerebrum_rules`→`compass_rules`) — an internal inconsistency in the addendum. This schema resolves it by including `check.atlas`'s re-root here (per A0.3 and per A2.2, which explicitly names `check.atlas` as the enforcer of the `compass_rules` rename) — flagged for Pedro's awareness, not silently reconciled.

**Check count.** The addendum's own tally (A0.3, A8) states "28 at v2.0 → 32 at v3.0 (added 7, removed 5)" — that arithmetic does not reconcile (28 + 7 − 5 = 30, not 32), and it does not match a plain enumeration of the v2.0 Appendix A table's distinct check IDs either (33, not 28) — both are **pre-existing inconsistencies inherited from the source documents**, not introduced by this fold-in, and are flagged here rather than silently "corrected" with an invented number. The authoritative source of truth is the enumerated table above, not any running total. By the same enumeration method used for v2.0 (33 distinct IDs), applying addendum A0.3's stated delta (+7 added, −5 removed, IDs otherwise stable) yields **35** distinct check IDs at v3.0 — confirmed by direct enumeration of the table above (33 rows at 3.0, two of which each name two check IDs joined by `/`: `check.index-present`/`check.index-shape` and `check.overview-present`/`check.overview-shape`, for 35 distinct IDs total). The 3.1 MINOR adds exactly one check — `check.insight-observations` (§4.10.11) — for **36** distinct check IDs at 3.1. The 3.2 MINOR adds `check.archive-intent-register` (§4.4.3), and the 3.3 third revision adds `check.threads` (§4.5.3) — one distinct id each. The 3.4 MINOR adds three — `check.evidence` (§4.3), `check.bears-on` (§6), `check.recall-index` (§4.11) — and amends four in place without new ids (`check.atlas`, `check.pulse`, `check.layout`, `check.insight-observations`). The 3.4 second revision adds **no** check id and amends one in place — `check.hook-config` learns the `Grep|Bash` row (§5); the generated recall block (§7.1) is covered by the existing `check.index-shape` budget warning, not by a new check. The 3.4 third revision likewise adds **no** check id and amends two in place — `check.hook-config` learns the `UserPromptSubmit` row (§5) and `check.config` learns `hooks.readDefer` (§10.1); the deferral ledger under `pulse/state/` is transient state no check reads. The 2026-09-17 wave follow-up A adds **two** check ids — `check.compass-heading` (§4.1, §4.2) and `check.index-completeness` (§7.1) — and amends `check.xref-unique` in place to read the index's `id → files[]` over every kind it scans (§6, B-019). The 3.4 fifth revision (wave follow-up B, same day) adds **two** more — `check.id-registry` (§4.1, §4.2, §10.4) and `check.visibility` (§10.1) — and amends three in place without new ids: `check.bug` (three optional fields), `check.recall-index` (two optional subject lists, three kinds), `check.config` (`visibility`, `placement`). The table above remains the authoritative enumeration.

---

**End of schema v3.1.** 3.1 is a MINOR addition over 3.0 (§10.2): `insight/observations/` — ungated, session-learned project-context observations, themed one-entry-per-file with a two-signal (frequency/emphasis) importance model and a SessionStart digest, written by `cortex-loop-session-observe` — plus its validator check `check.insight-observations` (§4.10.11, §1, Appendix A); nothing removed, renamed, or made required. (The directory shape above revises 3.1's original single-file draft in place — no project shipped on the earlier shape.) The 3.0 fold-in record follows. Folded in from `cortex-schema-v3-addendum.md` (build-order-v3 step 1; see git history for the addendum's drafting record and the fold-in commit). Changes from 2.0: `cerebrum/` renamed `compass/` (rule/bug ids unchanged); `anatomy/` removed, absorbed into `insight/`; `archive/` added (ingested documents + extractions, mixed git policy); `insight/` rebuilt wholesale (leveled L1–L4 per-file entries, scoped/unscoped layouts, new JSON shapes with a discrete confidence-tier enum and a path-derived node-id grammar, a staleness ledger, and a reverse-dependency index); the `cortex insight file/concept/element` query CLI (supersedes `query/get/neighbors/list`); the `cortex-extract-insight` skill I/O contract; `provenance:`/`derives_from:` frontmatter on compass rules, both spec trees, and atlas decisions, with a backward-traversal index; decisions single-homed to `atlas/decisions/` (`compass/decisions.md` does not exist); the pulse typed-suggestion enum gains `decision-candidate`; the scheduled-task/loop roster changes (anatomy-refresh and the v2.0 insight-refresh/gaps pair retire; three insight-refresh tiers plus `cortex-loop-session-observe` take their place); the CLAUDE.md template and `loop.md` re-rooted; and the version-gate wiring (`schemaVersion: "3.0"`; validator `supportedMajor`/`supportedMinor` activation is deferred to build-order-v3 step 2, coupled with the rename). Next: build-order-v3 step 2 (module migration + version-gate activation).
