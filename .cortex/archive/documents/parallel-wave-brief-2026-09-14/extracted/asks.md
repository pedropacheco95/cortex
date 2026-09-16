# Asks

Every suggestion in the brief, in the author's own priority order ("Suggested order of
work"), with the claim it rests on (`claims.md`), our status at schema 3.4 on 2026-09-16, and
the route. Routes: **pulse** = a `promotion` proposal in
`.cortex/pulse/reports/archive-ingestion.md` awaiting `cortex pulse-accept`; **spec** = a
spec-shaped change for `specflow-ingest` / `specflow-spec-editor`, outside the pulse gate
(`.specflow/` is not a permitted pulse target, schema §4.5.1); **none** = no action.

| # | Ask (brief §) | Rests on | Status | Route |
|---|---|---|---|---|
| A-01 | `cortex validate` fails on a duplicate id within a module (§2.1) | C-05, C-07 | **verified-defect** — `checkXrefUnique` scans `.specflow/` only; §6 global rule 1 names `compass/rules/` and `compass/bugs/` too | filed as **B-019** on 2026-09-16 (its change plan adds `schema.validator` Rule 12 + three ACs); pulse S-029 appends this brief as its external evidence |
| A-02 | Fail when a rule's number disagrees across filename / `id:` / H1 (§2.1) | C-05, C-07 | **partially-addressed** — filename ↔ `id` is checked (`check.rule`); H1 is not | spec: extend `check.rule` (and `check.bug`) to compare the H1 prefix |
| A-03 | Report index completeness — entries vs rules — even as a warning (§2.1) | C-06 | **new** | spec: `check.index-shape` or a new `check.index-coverage` warning |
| A-04 | Validate that the citation graph resolves (§2.1) | C-08 | **does not hold at 3.4** — dangling `source:` is already an error (X-01) | none; note back to the author |
| A-05 | `generated_at_commit` on insight entries, surfaced in `cortex insight` output (§3.1) | C-10, C-11 | **partially-addressed** — stored as `built_at_commit` / `source_sha256` (§4.10.2); not printed | spec: print the stamp in the `cortex insight file` header line |
| A-06 | The same commit stamp on bug-ledger entries (§3.1) | C-11 | **new** — §4.2 carries `opened`/`resolved` only | spec: schema §4.2 optional `observed_at_commit` (or similar); needs Pedro's approval (contract) |
| A-07 | A capture ritual at task end: "did you lose time to something the next person will too?" → one line (§4.1) | C-14, C-15 | **partially-addressed** — `hooks.session-end` records findings/approvals/questions; `<cortex:finding>`; `cortex thread promote --to compass/bugs`. No prompt asks the question | spec: a `Stop`/`SessionEnd`-side nudge or a `finding kind="trap"` route into `do-not-repeat.md` |
| A-08 | Name non-implementer roles in Cortex's own guidance; the read-the-index protocol applies to them more (§1.1) | C-01, C-02 | **new** | pulse S-030 (preferences, repo practice) + spec: generated CLAUDE.md Cortex section / `_index.md` wording |
| A-09 | Treat `environment.md` as load-at-start, or surface it on first tool use (§1.2) | C-01, C-03 | **new** — the session-start coverage map was retired 2026-09-16; a pointer-grammar line at first tool use would fit `hooks.search-annotate` / `hooks.prompt-route` precedent | spec: `hooks.session-start` or `hooks.prompt-route` first-prompt pointer, under RULES 11 budgets |
| A-10 | Instrument `insight/` discovery before extending it (§1.3) | C-04 | **already-addressed** — `pulse.usage`, `atlas/evidence/2026-09-15-usage.md`, `2026-09-16-usage.md`; the 2026-08-05 pull-only reversal was made on that measurement | none |
| A-11 | Id scheme for parallel authorship: slug-as-identity or an append-only registry with loud merge conflicts (§2.2) | C-09 | **new** — only `S-`/`T-` ids have a counter; `R-`/`B-` are "next after highest on disk" | spec + decision; contract change (schema §4.1/§4.2 filenames), Pedro's call |
| A-12 | A "currently true" surface: known-broken, owner, fix in flight; transient, read before starting in a familiar area (§3.2) | C-13 | **partially-addressed** — open threads + `hooks.prompt-route` / `hooks.search-annotate` pointers; bug `status:`; no owner / in-flight field | spec: possibly a `bears_on`-carrying view over open bugs + threads in the recall index (`recall.recall-index`) |
| A-13 | Lightweight decision form (what / why / rejected), promotable later (§4.2) | C-16 | **partially-addressed** — approval threads → `cortex thread promote --to atlas/decisions` drafts a decision; `decision-candidate` from session-observe | spec: a `finding kind="decision"`-style tag, or document the existing promote path as the form |
| A-14 | Generate placement guidance as one authoritative statement at adoption (§5) | C-17 | **new** | spec: `cortex init` CLAUDE.md section + `.gitignore` comment written together |
| A-15 | A `visibility:` declaration per module, or a validator warning on operational specifics (hostnames, IPs, ports, account ids) in tracked files (§6) | C-18 | **new** — RULES 12 covers secrets, not aggregate specifics | spec + RULES.md rule 12 amendment; contract change |
| A-16 | Do not change: `rules/` as durable home, the rule format, citation frontmatter, the compass/atlas/insight split (§7) | C-19–C-22 | confirmation | none |

## Genuinely new at 3.4 (nothing shipped 2026-09-15/16 touches them)

A-03 index completeness, A-06 commit stamp on bugs, A-08 non-implementer read protocol,
A-09 `environment.md` surfacing, A-11 id scheme for parallel authorship, A-14 placement
guidance at adoption, A-15 module visibility declaration. A-12 ("currently true") is new in
its owner / fix-in-flight half.

## Partly addressed by the recall work (specs shipped 2026-09-15/16)

- `hooks.session-end` + `pulse.threads` (2026-09-15, commit `3b8a0c7`): A-07 capture, A-13
  decision capture, A-12 "still open".
- `schema.bears-on` + `atlas.evidence` + `recall.recall-index` (2026-09-15, `6e76d4d`): A-10
  instrumentation record, A-12 the forward edge a "currently true" view would be compiled from.
- `hooks.search-annotate` + `hooks.pre-read-writeback` Rule 6 (2026-09-15, `312a00b`): the
  pointer grammar and token budget an `environment.md` surfacing (A-09) would reuse.
- `hooks.prompt-route` + `hooks.pre-read-writeback` Rule 7 (2026-09-16, `7dec509`): first-prompt
  resumption is the closest existing hook to A-09's "first tool use".
