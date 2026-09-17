---
id: compass.bug-currency
status: draft
depends_on:
  - schema.validator
  - pulse.threads
  - schema.id-registry
governs:
  - "src/compass/git-head.ts"
  - "src/schema/checks/compass.ts"
implements: ../../specs-business/scaffolding/assistant-reaches-for-cortex-instead-of-guessing.business.md
governed_by:
  - R-001
provenance:
  - derives_from: archive/documents/parallel-wave-brief-2026-09-14/extracted/asks.md
---

# Bugs as the "currently true" surface — owner, fix in flight, found-at commit

## Intent

The bug ledger already says what is known-broken (`status: open|triaged`). It does not say who
owns it, whether a fix is already on an unmerged branch, or which commit the observation was
made against — the three facts whose absence let four parallel sessions rediscover one defect,
re-derive workarounds for things fixed an hour earlier on another branch, and spend an evening
disproving a ticket filed against a six-day-old checkout (brief §3.1–§3.2, claims C-11 and
C-13, asks A-06 and A-12). This spec adds three optional frontmatter fields to schema §4.2,
gives `triaged` a definite meaning — owned, with a fix in flight — and has every Core writer of
a bug file stamp the commit it was written at, read from `.git/HEAD` by pure file I/O because
Core spawns no `git`. The recall consumers that surface these bugs at the moment of a read or a
search are `recall.recall-index` Rules 15–17 and the `Bugs:` marker (`hooks.pre-read-writeback`
Rule 6); this spec owns the fields and the stamp. Schema 3.4, fifth revision in place.

## Entities

- **READS:** `.git/HEAD`, the ref file it names, `.git/packed-refs`, and a `.git` *file* in a
  linked worktree (`gitdir: <path>`) — the stamp; `.cortex/compass/bugs/B-*.md` frontmatter —
  the check.
- **WRITES:** nothing of its own; `cortex thread promote --to compass/bugs` (`pulse.threads`
  Rule 12) writes `found_at_commit` into the file it drafts.
- **CREATES:** nothing.

## Rules

1. **Three optional fields (schema §4.2).** A bug file MAY carry:
   - `owner` — string, free text (a name, a handle, a team; never validated beyond type);
   - `fix_in_flight` — string: a branch name, a PR URL, or a commit sha — where the fix lives
     while it is not yet on the main line;
   - `found_at_commit` — string matching `/^[0-9a-f]{7,40}$/`: the commit the observation was
     made against, the brief's "ran against `<commit>`" stamp.
   Absent fields mean "unknown", never "none". Nothing existing is renamed or made required.

2. **`triaged` means owned with a fix in flight.** The `status` enum is unchanged
   (`open | triaged | resolved`); its middle value's meaning is fixed here: a bug is `triaged`
   when someone owns it **and** a fix exists somewhere (`owner` and `fix_in_flight` both set).
   A classified-but-unowned bug stays `open` — classification is the `type:` field, not the
   status. A `triaged` bug lacking either field is not a violation in this revision (Rule 3 is
   shape-only by decision); it is the daily bug-triage loop's report line, not the validator's.

3. **`check.bug` learns the three fields, shape only (schema Appendix A).** `owner` and
   `fix_in_flight` present but not a string → `error`; `found_at_commit` present but not
   matching Rule 1's pattern → `error`. Nothing else: no existence check on the commit (Core
   has no object database), no URL validation, no cross-field rule.

4. **The head-commit helper — `readHeadCommit(root): string | null` in `src/compass/git-head.ts`.**
   Pure file I/O, never throws, never spawns `git`:
   - `<root>/.git` is a directory → read `.git/HEAD`;
   - `<root>/.git` is a **file** starting `gitdir: <path>` (a linked worktree) → resolve
     `<path>` (relative to `<root>`) and read `HEAD` there, one level only;
   - `HEAD` is `ref: <refpath>` → read `<gitdir>/<refpath>`; when that file is absent, scan
     `<gitdir>/packed-refs` (the common dir for a worktree: `<gitdir>/commondir`, one level)
     for a line `<sha> <refpath>`;
   - `HEAD` is a bare sha (detached) → use it;
   - return the first **7** characters of the 40-hex sha, lowercase; any other content, a
     missing file, or no `.git` at all → `null`.
   Seven characters matches `git rev-parse --short HEAD`'s default; ambiguity resolution is
   git's problem, not a file reader's.

5. **Writers stamp on creation.** `cortex thread promote --to compass/bugs` (`pulse.threads`
   Rule 12) writes `found_at_commit: <readHeadCommit(root)>` when the helper returns a sha and
   omits the key when it returns `null` (a project that is not a git repository stays valid).
   The specflow-bugs skill, which runs where `git` is available, writes the same field from
   `git rev-parse --short HEAD` (`schema.id-registry` Rule 7's sentence carries this too).
   `owner` and `fix_in_flight` are human-set: no Core writer guesses them.

6. **Currency is read from the ledger by the recall index, not from here.** An `open` or
   `triaged` bug is a recall carrier (`recall.recall-index` Rule 17): its `affects` entries
   become subjects, so a read of the affected file or a search into its directory gets a
   `Bugs: B-NNN` pointer, and `cortex why <path>` lists it with `owner` and `fix_in_flight`
   when set (`recall.why` Rule 4). A `resolved` bug contributes nothing — the surface is what is
   broken *now*.

7. **Deterministic Core** (R-001): frontmatter type checks and up to four small file reads.

## Acceptance Criteria

### The three fields validate by shape only

- **Given** `compass/bugs/B-020-x.md` with `owner: pedro`, `fix_in_flight: feature/registry`
  and `found_at_commit: 2b217df`
- **When** `cortex validate` runs
- **Then** the report carries no `check.bug` violation for that file

### A malformed stamp is an error; a bare status is not

- **Given** `B-021-y.md` with `found_at_commit: 2b217dfz` (a non-hex character), and
  `B-022-z.md` with `status: triaged` and neither `owner` nor `fix_in_flight`
- **When** `cortex validate` runs
- **Then** the first file yields one `check.bug` error naming `found_at_commit`, and the second
  yields no `check.bug` violation

### The helper reads a symbolic HEAD

- **Given** a temp repo whose `.git/HEAD` is `ref: refs/heads/main` and
  `.git/refs/heads/main` is `2b217dfa9c…` (40 hex)
- **When** `readHeadCommit(root)` runs
- **Then** it returns `2b217df`

### The helper reads a packed ref, a detached head and a worktree

- **Given** in turn: a repo whose ref file is absent but `packed-refs` carries
  `<sha> refs/heads/main`; a repo whose `HEAD` is a bare 40-hex sha; and a directory whose
  `.git` is a file `gitdir: ../main/.git/worktrees/wt` pointing at a worktree dir with its own
  `HEAD` and a `commondir` naming the main `.git`
- **When** `readHeadCommit(root)` runs for each
- **Then** each returns the first seven characters of the right sha

### The helper never throws

- **Given** in turn: no `.git`, a `.git/HEAD` containing `garbage`, and a `.git/HEAD` naming a
  ref that exists nowhere
- **When** `readHeadCommit(root)` runs for each
- **Then** each returns `null` and nothing is thrown

### Promote stamps the draft

- **Given** an open thread `T-010` in a repo whose head is `2b217df…`
- **When** `cortex thread promote T-010 --to compass/bugs --type layer-drift --affects src/a.ts`
  runs
- **Then** the drafted file's frontmatter carries `found_at_commit: 2b217df`, and the same
  command in a non-git directory drafts a file with no `found_at_commit` key that still passes
  `cortex validate`

## Notes

- **Why optional, against the preference.** `compass/preferences.md` prefers "required with a
  well-defined empty-state value" over optional. These three are optional because they are
  facts about the world (who, where, when) that are genuinely unknown for most of the nineteen
  bugs already filed; an empty-state value would be a lie, and making them required would be a
  MAJOR (§10.2). `found_at_commit` is the one Core can always fill going forward, and Rule 5
  makes it fill it.
- **Why `.git/HEAD` and not a subprocess.** R-001 and RULES.md rule 3: Core spawns no `git`.
  The helper reads at most four files and covers the three layouts a checkout can have; it is
  the same trade the post-commit hook already makes.
- **Not done here:** no validator warning for a `triaged` bug without owner or fix (Rule 2 —
  a candidate for the daily bug-triage loop's report, OPEN); no automatic `resolved` when
  `fix_in_flight` merges (Core cannot see merges).
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention).
