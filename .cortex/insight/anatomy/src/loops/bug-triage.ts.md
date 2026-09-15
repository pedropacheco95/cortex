---
path: src/loops/bug-triage.ts
extracted_at: 2026-07-12T01:10:00Z
extraction_level: 2
size_lines: 575
size_tokens: 5574
centrality: medium
built_at_commit: "fd7b55b"
source_sha256: "6c987a66cceb6b11e8935cdc01f443719776f778e320fdffc0ae677396d75ebe"
---

# src/loops/bug-triage.ts

## Purpose

Implements `cortex loop-bug-triage`, the daily bug-ledger triage loop (spec `loops.bug-triage`): it scans `.cortex/compass/bugs/` for `status: open` bugs, partitions them into unclassified/classified in a `--collect` worklist written to `.cortex/pulse/state/triage-worklist.json` (relocated from the pulse root under the reorganized pulse zones), then applies a classification judgment's results back to the ledger under a strict "fill-only" mutation rule (Rule 3) — absent `type:`/`severity:`/`proposed_fix:` frontmatter fields are filled in, present fields are never overwritten, and disagreements are surfaced as reported divergences rather than silently applied. It supports three modes (`--collect`, `--report <file>`, and a bare mode that shells out to a headless `claude` subprocess for the judgment itself) and always writes `.cortex/pulse/reports/bug-triage.md` with Filled/Agreements/Divergences/Aged sections, even on degraded runs (no binary, timeout, auth failure). This is the one Core loop file permitted to mutate a gated ledger file directly, and only in this narrow, additive, idempotent way.

## Connections

Uses:
- `src/cli/claude-auth.ts` — `AUTH_FAILURE_PATTERN`, used to detect an unauthenticated Claude CLI in the bare-mode subprocess's combined stdout/stderr.
- `src/loops/report.ts` — `writePulseReport`, the shared always-write function used to emit `bug-triage.md` under `.cortex/pulse/reports/`.
- `src/pulse/distil.ts` — `parseCandidatesFromOutput`, reused (despite the name) to extract the JSON results array from the headless judgment subprocess's stdout.

Used by: (none src-internal)

## Insights

- `scanOpenBugs` (lines 83-122) silently drops any bug file whose frontmatter fails YAML parsing — `matter(...)` is wrapped in `try { } catch { continue; }` with the comment "not this loop's problem (hygiene's)", but `cortex pulse-hygiene` has no check that actually catches unparseable compass frontmatter. Confirmed live: `B-017-tier-run-failure-reads-as-clean.md`'s `proposed_fix:` contains an unquoted `: ` inside a plain scalar (`"...become non-zero: Rule 1's sibling..."`), which breaks YAML block-mapping parsing — so B-017 is invisible to every `--collect` worklist despite being a fully-classified `status: open` bug in the ledger index, with no error surfaced anywhere. Reproduced independently across multiple sessions from 2026-08-31 through 2026-09-06; still unfixed as of the latter. (claude-sessions/pedropacheco1/ae5057ae-3fe3-45c6-9754-8d06a4d6ac47)
