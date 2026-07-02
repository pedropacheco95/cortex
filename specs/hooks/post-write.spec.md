---
id: hooks.post-write
status: implemented
depends_on:
  - core-cli.init
  - anatomy.scanner
implements: ../../specs-business/hooks/assistant-gets-timely-guardrails.business.md
governed_by: []
---

# PostWrite Hook (PostToolUse on Write|Edit)

## Intent

The PostWrite hook keeps anatomy honest at the moment a file changes: after a successful Write or Edit it refreshes that file's `anatomy/files.md` row — the **fast tier** of the mark-dirty-fast / refresh-deep idiom (design §11.4). It recomputes the cheap fields and flags the purpose stale; the deep pass (scheduled Skill) and the next scan do the expensive work.

## Entities

- **READS:** stdin JSON (`tool_name`, `tool_input.file_path`, `cwd`); the written file's content on disk (post-write state); `.cortex/anatomy/files.md` (the row to update); `.gitignore` + `cortex.config.json` `anatomy.exclude` (exclusion check).
- **WRITES:** `.cortex/anatomy/files.md` (one row updated or appended); `.cortex/pulse/hook-errors.md` (append, only on internal error).
- **CREATES:** nothing.

## Rules

1. **Invocation.** Registered by `cortex init` as `{"type": "command", "command": "cortex hook post-write", "timeout": 10}` under `PostToolUse` with matcher `"Write|Edit"`. The `cortex hook ` command prefix is the Cortex-ownership marker (see `hooks.session-start` Rule 1).
2. **Always silent.** Exit 0 with empty stdout in every case, success or degraded — Claude sees nothing from this hook, ever. (PostToolUse exit 2 sends stderr to Claude; this hook never exits non-zero.)
3. **Fast tier only.** For the written file, recompute `tokens` (chars/4), `sha256`, `last_seen`, and set `needs_purpose_refresh: true` when the hash changed. **No tree-sitter, no purpose re-derivation, no `graph.json` edge updates** — those belong to the git-hook fast loop and the deep pass (design §5 vs §11.4 division). The emitted `files.md` must still satisfy `check.anatomy-files`.
4. **Unchanged content is a no-op.** If the recomputed `sha256` equals the row's existing hash, the row is left untouched (including its flag and `last_seen`).
5. **New files are appended** with a placeholder purpose and `needs_purpose_refresh: true`, matching the scanner's row conventions.
6. **Exclusions respected.** A path matched by `.gitignore` or `anatomy.exclude` → no-op. A path outside the project root → no-op.
7. **Missing substrate is silence, corruption is a log.** No `.cortex/` or no `anatomy/files.md` → silent no-op (the project isn't scanned). A `files.md` that exists but cannot be parsed → **no write at all** (never destroy the artefact), append a structured entry to `.cortex/pulse/hook-errors.md`, exit 0.
8. **Deterministic and offline.** Pure Node file I/O; no network, no LLM, no subprocess.

## Acceptance Criteria

### Changed file's row is refreshed and flagged

- **Given** a scanned project where `src/a.ts` has a stale row (old sha256, `needs_purpose_refresh: false`)
- **When** the hook runs after a Write that changed `src/a.ts` to 400 characters
- **Then** the row's `tokens` is 100, `sha256` matches the new content, `last_seen` is updated, and `needs_purpose_refresh` is `true`
- **And** stdout is empty with exit code 0

### Unchanged content leaves the row untouched

- **Given** a row whose `sha256` already matches the file on disk
- **When** the hook runs for that file
- **Then** the row is byte-identical to before (flag and `last_seen` included)

### New file appended with placeholder

- **Given** a scanned project and a Write creating `src/new.ts`, absent from `files.md`
- **When** the hook runs
- **Then** `files.md` gains a row for `src/new.ts` with a placeholder purpose and `needs_purpose_refresh: true`
- **And** the updated `files.md` passes `check.anatomy-files` with zero errors

### Excluded paths are a no-op

- **Given** `.gitignore` listing `dist/`
- **When** the hook runs after a Write to `dist/out.js`
- **Then** `files.md` is byte-identical to before

### Unscanned project is fully silent

- **Given** a `cwd` with `.cortex/` but no `anatomy/files.md`
- **When** the hook runs
- **Then** exit code 0, empty stdout, no file created, no pulse entry

### Corrupt files.md is never destroyed

- **Given** an `anatomy/files.md` with a truncated, unparseable table
- **When** the hook runs after a Write
- **Then** `files.md` is byte-identical to before, exit code 0
- **And** `.cortex/pulse/hook-errors.md` gains an entry naming the hook and the parse failure

### No graph or purpose work in the fast tier

- **Given** a Write that adds a new `import` line to `src/a.ts`
- **When** the hook runs
- **Then** `graph.json` is byte-identical to before and the row's purpose text is unchanged (only the flag flips)

## Notes

- Design §5's "refreshes purpose if structure changed" is realised as *flagging* (`needs_purpose_refresh: true`), not re-deriving — re-derivation is the scanner's/deep pass's job. This keeps the hook allocation-cheap and tree-sitter-free, per the mark-dirty-fast idiom (§11.4).
- Journey-layer tests deferred to v1.1 (see `hooks.session-start` Notes).
