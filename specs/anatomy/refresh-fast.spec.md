---
id: anatomy.refresh-fast
status: implemented
depends_on:
  - anatomy.scanner
  - core-cli.init
governs:
  - "src/anatomy/refresh-fast.ts"
implements: ../../specs-business/anatomy/contributor-gets-a-legible-codebase.business.md
governed_by:
  - R-001
---

# Anatomy Refresh — Fast Tier

## Intent

`cortex anatomy-refresh-fast` (design §11.4 item 3) is the post-commit tier of mark-dirty-fast / refresh-deep: after every commit it re-derives the cheap anatomy fields for the files that commit touched — tokens, sha256, tree-sitter import/export edges — and flags changed files `needs_purpose_refresh: true`. Zero LLM calls, sub-second target, backgrounded by the already-installed git hook so commits are never blocked. This is the loop that makes anatomy drift stop being the default state on active projects (the load-bearing freshness loop).

## Entities

- **READS:** the last commit's changed paths (`git diff-tree`); the changed files' content; `.cortex/anatomy/files.md` and `graph.json`.
- **WRITES:** `.cortex/anatomy/files.md` (changed rows only) and `graph.json` (edges from/to changed files only). Anatomy is regenerable machine-owned state — direct maintenance is this loop's design purpose (see Notes).
- **CREATES:** nothing new in shape; rows for newly added files are appended per the scanner's conventions.

## Rules

1. **Invocation names.** `cortex anatomy-refresh-fast` — the exact command the installed post-commit hook already calls (`core-cli.init` Rule 12) — and `cortex loop-anatomy-refresh --fast` as the design §15 form; both dispatch identically.
2. **Scope = the last commit.** Changed paths from `git diff-tree --no-commit-id --name-status -r HEAD`: modified/added files get row refresh; deleted files get their row and their graph edges removed. Paths excluded by `.gitignore`/`anatomy.exclude`/hard exclusions are ignored. Not a git repo, or no commit yet → silent no-op, exit 0.
3. **Row refresh.** Recompute `tokens`, `sha256`; set `needs_purpose_refresh: true` when the hash changed (doc-comment re-derivation is the scanner's business, not this tier's); new files appended with placeholder purpose.
4. **Atomic row writes (Pedro's coordination pin).** A row write always carries `last_seen` together with every other field it touches — never `last_seen` alone, never other fields without it — so hygiene's and spec-drift's reads over anatomy never observe a half-updated row.
5. **Edges.** Re-parse changed files with tree-sitter and replace exactly the edges whose `from` is a changed file (plus drop edges pointing at deleted files); all other edges untouched. Emitted artefacts still satisfy `check.anatomy-files`/`check.anatomy-graph`.
6. **Fast and quiet.** Deterministic Core (R-001), no LLM, no network; nothing written outside `.cortex/anatomy/`; errors degrade to a silent exit 0 with a `pulse/hook-errors.md` entry (the hook path must never disturb a commit).
7. **No anatomy yet → no-op.** An unscanned project exits 0 silently (the hook fires before first init-scan in some flows).

## Acceptance Criteria

### Commit-scoped refresh flags exactly the changed files

- **Given** a scanned git fixture where one commit modifies `src/a.ts` (400 chars) and leaves `src/b.ts` untouched
- **When** the fast tier runs
- **Then** `src/a.ts`'s row has `tokens` 100, the new `sha256`, fresh `last_seen`, and `needs_purpose_refresh: true`
- **And** `src/b.ts`'s row is byte-identical

### Atomic row write (coordination regression)

- **Given** any refreshed row
- **Then** its `last_seen` change and its `tokens`/`sha256`/flag changes appear in the same write — asserted by comparing the full row before/after (no intermediate state observable on disk after the run)

### Added and deleted files handled

- **Given** a commit adding `src/new.ts` and deleting `src/old.ts`
- **Then** `src/new.ts` gains a placeholder row (flagged), `src/old.ts`'s row is gone, and no edge touches `src/old.ts`

### Edges replaced only for changed files

- **Given** a commit changing `src/a.ts`'s imports while `src/c.ts`'s edges exist
- **Then** `src/a.ts`'s outgoing edges reflect the new imports and `src/c.ts`'s edges are untouched
- **And** the emitted artefacts pass `check.anatomy-*`

### Hook-safe degradation

- **Given** a corrupt `files.md`
- **When** the fast tier runs
- **Then** exit 0, nothing written to anatomy, one `pulse/hook-errors.md` entry

### Non-repo and unscanned no-ops

- **Given** a non-git or never-scanned project
- **Then** exit 0, nothing written

## Notes

- **Design tension, mechanically resolved and reported:** §11.3 property 2 says loops write only to `pulse/`, while §11.4 items 3–4 exist precisely to write anatomy. Resolution: propose-don't-mutate protects *curated* knowledge; anatomy is regenerable machine-owned state already written directly by the scanner and the PostWrite hook. Both refresh tiers inherit that standing, and write nothing curated, ever.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
