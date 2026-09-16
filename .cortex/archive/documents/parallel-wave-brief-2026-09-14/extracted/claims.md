# Claims

Factual statements the brief makes, numbered for citation. "Author" is the external
coordinator; all figures are theirs (see `evidence.md`). Cortex context: their project ran
schema 3.3 with ~850 tracked `.cortex/` files.

## Retrieval (brief §0–§1)

- **C-01** (§0) The most expensive unknown of the night — where two scheduled QA jobs were
  defined — was already answered in `compass/environment.md` (ten named tasks, registry path,
  editing procedure). Six sessions filed a ticket calling them "outside the repo".
- **C-02** (§1.1) The CLAUDE.md protocol ("before working a task, read the relevant
  `_index.md`") was followed by every working session and by no coordinating session. The
  coordinator never opened `compass/` in sixteen hours because its brief said "do not read
  source", which it generalised to the knowledge layer.
- **C-03** (§1.2) `environment.md` (fourteen lines) answered most environment friction of the
  night and is discoverable only by opening `compass/_index.md` and choosing to follow it.
- **C-04** (§1.3) `cortex insight` was not mentioned once in sixteen hours of reports across six
  sessions, while sessions read source constantly. The author does not claim nobody ran it.

## Integrity (brief §2)

- **C-05** (§2.1) Two rules carried `id: R-026` under different filenames. `cortex validate`
  reported 16 errors and none was this. Four sessions independently rediscovered it.
- **C-06** (§2.1) Neither R-026 appeared in the compass `_index.md`, which listed 2 of 26 rules.
- **C-07** (§2.1) A session wrote a test in the project's own pytest suite to check: no id
  issued twice; filename, `id:` and H1 agree; the index links only rules that exist.
- **C-08** (§2.1) `cortex validate` "validates layout and frontmatter shape but not whether
  references point at anything". **Does not hold at 3.4** — see `contradictions.md` X-01.
- **C-09** (§2.2) Rule and bug ids are sequential, and parallel sessions on separate branches
  all reach for "the next one"; ledger id collisions were already a known recurring trap. The
  project solved the same problem for DB migrations with random revision ids.

## Freshness (brief §3)

- **C-10** (§3.1) Nothing in an insight entry says which commit it was true at. **Partially
  wrong at 3.4** — entries store `built_at_commit` / `source_sha256`; the CLI does not print
  them. See `contradictions.md` X-02.
- **C-11** (§3.1) The night's single most expensive failure was a scheduled job filing a
  detailed ticket against a six-day-old checkout whose recommended fix had shipped twice; a
  session spent an evening disproving it. One line — "ran against `<commit>`" — would have
  been the tell.
- **C-12** (§3.1) Principle the wave arrived at: a report that does not say what it ran against
  is not evidence. A knowledge layer is a report.
- **C-13** (§3.2) Nothing answers "what is known-broken right now, who owns it, is a fix in
  flight" — the gap that let four sessions rediscover one defect and re-derive workarounds for
  things fixed an hour earlier on unmerged branches.

## Capture (brief §4)

- **C-14** (§4.1) `compass/do-not-repeat.md` is empty while ~45 operational traps live in the
  coordinator's per-user memory file and do not travel between machines.
- **C-15** (§4.1) The missing thing is a ritual, not a file: capture must be part of finishing a
  task, and writing must be cheaper than rediscovering.
- **C-16** (§4.2) ~25 decisions were made in one night; `atlas/decisions/` holds ten narrative
  records; all 25 went to an untracked local plan file because a narrative record is too
  expensive mid-wave.

## Placement and visibility (brief §5–§6)

- **C-17** (§5) CLAUDE.md called the untracked prose directory "the one home for prose" while
  the ignore rule two lines above said "Cortex knowledge lives in `.cortex/` instead". Three
  sessions and the coordinator read the first and not the second, and a ticket recommended
  tracking the prose directory — which would have published internal notes to a public repo.
- **C-18** (§6) `compass/environment.md` accumulated, by reasonable increments, a production
  map (VM address, project/zone, SSH command, container ports, identity accounts, the fact that
  a lower-attention environment holds unanonymised production data). No secrets, but the
  aggregate is reconnaissance, and the repository is public.

## What worked (brief §7)

- **C-19** `compass/rules/` as the durable home was right: seven overnight rules survived;
  everything written to the untracked prose directory did not.
- **C-20** The rule format carries reasoning well — one rule shipped with its own correction in
  the body.
- **C-21** Citation frontmatter did its job wherever used; several times a claim was traced
  back to its bug and found overstated.
- **C-22** The compass (must) / atlas (why) / insight (is) separation held under pressure; every
  placement argument resolved against those definitions.
