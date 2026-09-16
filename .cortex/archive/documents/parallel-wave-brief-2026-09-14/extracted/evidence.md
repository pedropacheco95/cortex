# Evidence

The costs, counts and incidents the brief attaches to its claims (`claims.md`). All figures
are the author's, from one project and one 16-hour window (2026-09-13/14); none has been
re-measured here. Where Cortex holds its own measurement of the same thing it is noted.

## The wave

| Figure | Value | Brief § |
|---|---|---|
| Parallel sessions | 6 | header |
| Duration | 16 hours, one continuous session | header |
| Shipped | one release of 8 PRs | header |
| Tickets filed | 17 | header |
| Compass rules written | 7 (all survived; untracked prose did not) | header, §7 |
| Tracked `.cortex/` files | ~850 | header |
| Schema | 3.3 | header |
| Decisions made by the coordinator | ~25, none reached Cortex | §4.2 |
| Narrative decision records already in `atlas/decisions/` | 10 | §4.2 |
| Operational traps in the coordinator's per-user memory | ~45, none in `do-not-repeat.md` | §4.1 |

## Incidents with a cost attached

- **E-01 The environment black box** (§0, C-01). Hours across six sessions; one ticket filed
  as "definitions live outside the repo"; recommendations recorded as "unenforceable";
  escalated to the owner. Answer was in `compass/environment.md` the whole time.
- **E-02 The R-026 collision** (§2.1, C-05). Discovered four separate times by four sessions in
  one evening from four directions (fresh number, reconciling, adding a rule, surveying
  frontmatter); three discoveries bought nothing. `cortex validate` reported 16 unrelated
  errors. Index listed 2 of 26 rules, so nothing in the tree revealed it. A project-side
  pytest test was written to cover what the validator did not.
- **E-03 The stale scheduled ticket** (§3.1, C-11). A scheduled job filed a confident, detailed
  ticket against a six-day-old checkout; its fix had already shipped twice; a session spent an
  evening disproving it. Named as the single most expensive failure of the night.
- **E-04 The placement ticket** (§5, C-17). Three sessions plus the coordinator misread the
  prose-directory guidance; a ticket recommended tracking the directory, which would have
  published internal notes to a public repository.
- **E-05 `insight/` silence** (§1.3, C-04). Zero mentions of `cortex insight` in six sessions'
  reports over 16 hours. Cortex's own instrument for the same question: `pulse.usage` and
  `atlas/evidence/2026-09-15-usage.md` / `2026-09-16-usage.md` (this repo, not theirs).
- **E-06 Aggregate reconnaissance** (§6, C-18). `environment.md` grew to a fourteen-line
  production map in a public repo — no secrets, but hostnames, ports, accounts, and the location
  of unanonymised production data.

## Verifications made at ingestion (this repo, schema 3.4, 2026-09-16, commit `6014b09`)

- **V-01** A dangling `source:` citation is caught by `cortex validate` as an error (schema §6
  global rule 4). The brief's §2.1 fourth bullet does not hold for 3.4.
- **V-02** Two `compass/rules/` files sharing `id: R-026` are **not** caught. `checkXrefUnique`
  in `src/schema/checks/xref.ts` builds its duplicate map from the dev and business spec globs
  only, although schema §6 global rule 1 names `compass/rules/`, `compass/bugs/` and atlas as
  well. `check.rule` does compare `id` with the filename prefix, so the collision requires two
  files both named `R-026-*.md`; an H1 heading disagreeing with `id` is not checked.
- **V-03** Insight per-file entries already carry `built_at_commit` and `source_sha256` in
  frontmatter (schema §4.10.2; e.g. `insight/anatomy/src/archive/formats.ts.md` has
  `built_at_commit: "c667a9a"`). `cortex insight file <path>` prints the level, centrality and
  line count but neither stamp. §3.1's ask is surfacing, not storing.
- **V-04** Cortex's own `compass/do-not-repeat.md` holds one free-text entry (iCloud resurrecting
  deleted files) and no rule pointer — the same shape as the author's C-14.

## What the author says worked (keep)

Seven rules written into `compass/rules/` overnight survived; a rule shipped with its own
correction in the body; citation frontmatter let sessions trace claims to bugs and find them
overstated; the compass / atlas / insight split resolved every placement argument. The brief
asks for none of these to change.
