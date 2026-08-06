# Plan — `cortex sync` honours deleted skill bundles

**Spec:** `.specflow/specs/core-cli/sync.spec.md` (`core-cli.sync`), Rule 5's additions chain
**Business spec:** `specs-business/core-cli/developer-keeps-existing-project-current.business.md` — unchanged by this work
**Scope:** spec-level. Two source files, three test files.

## The one constraint that must not be violated

**No version constant moves.** `SCHEMA_VERSION` stays `'3.3'` (`src/cli/templates.ts:9`),
`cortex-schema.md` stays `3.3`, and `src/schema/version.ts` is not touched. Schema 3.3 is
unreleased, so this lands as a revision in place — the same allowance 3.1 and 3.3's two
prior revisions took. The B-014 three-way version agreement
(`tests/atomic/schema/version-agreement.test.ts`) must stay green without being edited.
A concurrent worktree has in-flight 3.3 changes to `cortex-schema.md`; do not touch that file.

## Exploration summary

- **Relevant existing code:**
  - `src/cli/scaffold.ts:148-208` — `SkillMigration`, `SKILL_MIGRATIONS`, `compareVersions`,
    `applicableSkillMigrations`, `retiredBundles`. The additions chain is this shape, mirrored.
  - `src/cli/scaffold.ts:113-120` — `listSkillBundles(srcDir)`, the authoritative shipped set
    (a directory with a `SKILL.md`). 31 bundles ship today; `skills/_conventions/` has no
    `SKILL.md` and is correctly not among them.
  - `src/cli/sync.ts:195-302` — `syncSkillBundles`. Line 210 `mkdirSync(targetDir)`, line 222
    the `!fs.existsSync(target)` install branch this plan gates, line 270 the Rule 6 loop.
  - `src/cli/sync.ts:472` — `declaredVersion`, the pre-run `schemaVersion`, captured *before*
    the Rule 2 rewrite at lines 497-501. This is the value the chain compares against.
  - `src/cli/sync.ts:568-582` — the Rule 12 skill-bundle summary lines.
  - `src/cli/scaffold.ts:211` — `installSkills`, **init's** path. Not touched: day-1 init has no
    prior version to compare against and installs the full roster unconditionally.
- **Established patterns:** exported const chain + pure lookup helpers in `scaffold.ts`, atomic
  tests for the lookup and its invariants, spec tests driving a real `sync()` over a tmp project
  via `tests/fixtures/init-harness.js` (`makeTmpDir` / `cleanTmp`). `tests/atomic/core-cli/retired-bundles.test.ts`
  and `tests/spec/core-cli/sync-retirement.spec.test.ts` are the templates to copy.
- **Tech stack:** vitest, plain Node `fs`. No new dependencies (RULES.md rule 2 not engaged).

## Gap analysis

**Can reuse:** `compareVersions`, `listSkillBundles`, the `SKILL_MIGRATIONS` chain shape, the
retirement test harness, `declaredVersion` (already computed, just not passed down).
**Must create:** `SkillAddition` / `SKILL_ADDITIONS` / `bundleAddedAt` / `shouldInstallAbsent`
in `scaffold.ts`; three test files.
**Must modify:** `syncSkillBundles` (new `priorVersion` param, gated install branch,
`skippedDeleted` result field, whole-directory guard); its one call site; the Rule 12 summary.
**Open question, assumption stated:** a bundle **no** chain entry names fails *open* — it is
installed. Worst case is one unwanted reinstall; the alternative fails closed and makes a
bundle permanently unreachable. Task 2's invariant test is what keeps the case hypothetical.

## Compass / decisions checked

`core-cli.sync` carries `governed_by: []` and no rule in `.cortex/compass/rules/` has a
`governs` glob matching `src/cli/**`. No atlas decision bears on skill installation. RULES.md
rules 1 (pnpm) and 5 (macOS-only) apply and are already satisfied by the surrounding code.

## Size check

2 source files, ~5 modified functions, ~250 lines of relevant existing code. One agent, no
split, no delegation.

---

### Task 1: Add the additions chain to scaffold.ts

**Criterion:** `core-cli.sync` — "A project predating the chain gets the full roster once"
**Files:** `src/cli/scaffold.ts` (modify)
**Change:** After `retiredBundles` (line ~208), add, mirroring the `SKILL_MIGRATIONS` block's
doc-comment style:

```ts
export interface SkillAddition {
  /** The `MAJOR.MINOR` schema version at which these bundles first shipped. */
  version: string;
  /** Bundle directory names introduced at that version. */
  added: readonly string[];
  /** Why they arrived — surfaced to whoever audits the chain. */
  reason: string;
}

export const SKILL_ADDITIONS: readonly SkillAddition[] = [
  { version: '3.3', added: [ /* all 31 shipped bundle names, sorted */ ], reason: 'Seed entry …' },
];

/** The version at which `bundle` first shipped, or undefined if no entry names it. */
export function bundleAddedAt(bundle: string): string | undefined;

/** Whether an ABSENT `bundle` should be installed into a project whose pre-run
 *  schemaVersion is `priorVersion` (spec core-cli.sync Rule 5). */
export function shouldInstallAbsent(bundle: string, priorVersion: string): boolean;
```

`shouldInstallAbsent` returns `true` when no entry names the bundle (fail open — see gap
analysis) and otherwise `compareVersions(addedAt, priorVersion) > 0`. Generate the seed's 31
names from `listSkillBundles(path.join(packageRoot(), 'skills'))` at authoring time and paste
them as literals — the chain is a historical record, never computed at runtime. The `reason`
must state that the seed is the bundles shipped when the chain was introduced at 3.3, and that
a project already at 3.3 is deliberately not below it.
**Verify:** `pnpm build`

### Task 2: Pin the chain's invariants

**Criterion:** `core-cli.sync` — "Every shipped bundle is named by exactly one addition"
**Files:** `tests/atomic/core-cli/skill-additions.test.ts` (create)
**Change:** Copy the harness header from `tests/atomic/core-cli/retired-bundles.test.ts`. Assert:
(a) every name in `listSkillBundles(PKG_SKILLS)` is named by exactly one `SKILL_ADDITIONS` entry;
(b) no entry names a bundle twice or appears in two entries;
(c) no entry's `version` is above `SCHEMA_VERSION` (`compareVersions(e.version, SCHEMA_VERSION) <= 0`);
(d) `shouldInstallAbsent('cortex-pulse-hygiene', '3.2') === true` and `… '3.3') === false`;
(e) `shouldInstallAbsent('some-unknown-bundle', '3.3') === true` (fail-open).
**Verify:** `pnpm vitest run tests/atomic/core-cli/skill-additions.test.ts`

### Task 3: Gate the absent→install branch

**Criterion:** `core-cli.sync` — "A bundle the developer deleted is not reinstalled"
**Files:** `src/cli/sync.ts` (modify)
**Change:**
1. `SkillSyncResult` gains `skippedDeleted: string[]`, doc-commented as Rule 5's additions-chain
   skip. Initialise it in the `result` literal at line 201.
2. `syncSkillBundles` gains a `priorVersion: string` parameter (place it after `toVersion`).
3. **Before** `fs.mkdirSync(targetDir, { recursive: true })` at line 210, capture
   `const skillsDirExisted = fs.existsSync(targetDir);`. Order matters — `mkdirSync` creates the
   directory, so reading existence afterwards always returns true and the Rule 5(c) guard dies.
4. In the `if (!fs.existsSync(target))` branch at line 222, install when
   `!skillsDirExisted || shouldInstallAbsent(bundle, priorVersion)`; otherwise push to
   `result.skippedDeleted` and `continue`.
5. Update the call site at line 531 to pass `declaredVersion` (line 472) — **not**
   `SCHEMA_VERSION`, and not a re-read of the config, which by then holds the rewritten value.
   Add a comment naming the ordering hazard.
Leave `installSkills` in `scaffold.ts` untouched — init has no prior version and installs all.
**Verify:** `pnpm build && pnpm vitest run tests/spec/core-cli/sync.test.ts`

### Task 4: Report the skip in the summary

**Criterion:** `core-cli.sync` — "A bundle the developer deleted is not reinstalled" (the
`**And** the summary names it` clause)
**Files:** `src/cli/sync.ts` (modify)
**Change:** In the Rule 12 summary block (lines 568-582), add `skippedDeleted.length` to the
`Skill bundles:` count line as `N skipped (deliberately removed)`, and add a detail line
`  Skipped (deleted by you, not reinstalled): <names>.` guarded by `length > 0`, next to the
existing Rule 6/12 comment. Match the surrounding sentence style exactly.
**Verify:** `pnpm build && pnpm vitest run tests/spec/core-cli/sync.test.ts`

### Task 5: Spec tests for the four behavioural criteria

**Criterion:** `core-cli.sync` — "A bundle the developer deleted is not reinstalled";
"A project predating the chain gets the full roster once"; "The additions comparison reads the
version from before Rule 2's rewrite"; "A missing skills directory is repaired in full"
**Files:** `tests/spec/core-cli/sync-additions.spec.test.ts` (create)
**Change:** Follow `tests/spec/core-cli/sync-retirement.spec.test.ts` for harness, home-stubbing
and `sync()` invocation. Four cases, one per criterion:
1. Project at `3.3`, `.claude/skills/` present with `cortex-loop-rule-decay` removed → after
   `sync()` the directory is still absent and the summary names it as deliberately removed.
2. Project at `3.2` with several bundles absent → all installed; summary names them installed.
3. Project at `3.2`, absent bundles → installed, **and** `cortex.config.json` reads `3.3`
   afterwards. This is the ordering test: it passes only if the comparison used the pre-run
   `3.2`. Assert both facts in one case so a regression that reads the post-rewrite value fails.
4. Project at `3.3` with **no** `.claude/skills/` directory at all → every shipped bundle
   installed regardless of the chain.
The fifth criterion ("A bundle added after the project's version still reaches it") needs a
chain entry above `SCHEMA_VERSION`, which Task 2(c) forbids in the real chain — cover it in the
atomic file instead, via `shouldInstallAbsent` against a fixture version pair, and note in the
spec test file's header comment that it lives there and why.
**Verify:** `pnpm vitest run tests/spec/core-cli/sync-additions.spec.test.ts`

### Task 6: Full regression

**Criterion:** `core-cli.sync` — "Idempotent double-run" and "A developer's own skill is never
touched" must still hold; nothing else in the suite may regress.
**Files:** none (verification only)
**Change:** Run the whole suite. Pay particular attention to `tests/spec/core-cli/sync.test.ts`,
`tests/spec/core-cli/sync-retirement.spec.test.ts`, `tests/spec/specflow/awareness.test.ts` (the
byte-identity suite that init's no-marker decision protects), and
`tests/atomic/schema/version-agreement.test.ts` (must be green **without** having been edited).
**Verify:** `pnpm test`

### Task 7: Flip the spec's implementation-state note

**Criterion:** n/a — spec bookkeeping, not behaviour.
**Files:** `.specflow/specs/core-cli/sync.spec.md` (modify)
**Change:** Once Tasks 1-6 are green, remove the `**Implementation state (Rule 5's additions
chain).**` Note that says the chain is specified ahead of implementation. Leave every other
Note, including the two judgment calls, in place.
**Verify:** `pnpm dev validate`

---

## Known adjacent drift — do NOT fix in this change

`src/cli/sync.ts`'s rule-number comments lag the spec by one from B-015's insertion of Rule 6
(code says "Rule 6 — hooks merge", "Rule 10 — self-validation"; the spec has those at 7 and 11).
Pre-existing, unrelated, and touching it would bury this diff. Worth a bug-ledger entry
separately.
