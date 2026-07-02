---
id: loops.spec-drift
status: implemented
depends_on:
  - core-cli.init
  - schema.validator
  - anatomy.scanner
implements: ../../specs-business/loops/developer-gets-upkeep-proposals-without-asking.business.md
governed_by:
  - R-001
governs:
  - "src/loops/spec-drift.ts"
  - "skills/cortex-loop-spec-drift/**"
---

# Spec-Drift Loop

## Intent

`cortex loop-spec-drift` (daily, design §11.4 item 10) detects *content* drift between specs and the code they govern — complementing `specflow-lint` (structure) and the verification pass (coverage). For each dev spec with governed files, it compares the spec's last substantive change against its files' changes and writes suspects to `pulse/spec-drift.md`.

## Entities

- **READS:** dev specs (`governs:` frontmatter, git last-commit dates); governed files' git last-commit dates; `.cortex/anatomy/files.md` (`spec_links` as the reverse map).
- **WRITES:** `.cortex/pulse/spec-drift.md` only.
- **CREATES:** the report per schema §4.5 (`kind: pulse-spec-drift`, always-write).

## Rules

1. **Command + bundle.** `cortex loop-spec-drift` + shipped `skills/cortex-loop-spec-drift/SKILL.md` (registers the `spec-drift` task under `--partial`).
2. **Drift signal (v1):** a dev spec is **suspect** when any file its `governs:` matches (or whose anatomy `spec_links` names it) has a git last-commit date **more than 14 days after** the spec's own last-commit date. The report lists: spec id, the newer files with both dates, and the three possible readings (spec wrong / implementation regressed / new ACs needed — design §11.4).
3. **Ungoverned specs are skipped** (nothing to drift against); specs outside git history (untracked) are noted, not judged.
4. **Always-write (schema §4.5):** explicit "No drift suspects this cycle." when quiet.
5. **Read-only Core** (R-001): flags suspects; classification is the human's (or `specflow-bugs`') job.

## Acceptance Criteria

### Newer governed file makes the spec suspect

- **Given** a git fixture where a spec's governed file has commits 20 days after the spec's last commit
- **When** the loop runs
- **Then** the report names the spec, the file, both dates, and the three readings

### Fresh spec is not suspect

- **Given** a spec committed after all its governed files' changes
- **Then** it does not appear

### Grace window respected

- **Given** a governed file changed 5 days after its spec
- **Then** it does not appear (14-day grace)

### Ungoverned spec skipped, untracked spec noted

- **Given** a spec with no `governs:` and no `spec_links`, and another not yet committed
- **Then** the first is absent and the second appears under a "not in git history" notice

### Only the report is written

- **Then** the only file created or modified is `pulse/spec-drift.md`

## Notes

- The 14-day grace window is an engineering-call constant (stated in the footer) — code normally changes days after its spec during implementation; drift is when it keeps changing later.
