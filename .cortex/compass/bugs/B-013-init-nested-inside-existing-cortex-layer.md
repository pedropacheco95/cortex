---
id: B-013
title: cortex init had no guard against being run inside an existing Cortex layer, scaffolding a nested second layer inside .cortex/
type: incomplete-rule
severity: high
status: resolved
affects:
  - core-cli.init
  - src/cli/init.ts (init, Rule 1 preflight)
resolved: 2026-07-27T00:00:00Z
opened: 2026-07-27T00:00:00Z
---

# B-013 — `cortex init` had no guard against a target inside an existing Cortex layer

## Evidence

Reproduced by a user running `cortex init` targeting a `.cortex` directory
(either `cd .cortex && cortex init`, or `cortex init .cortex`). Init resolved
`absRoot` to `.../berd/.cortex`, checked for `.../berd/.cortex/.cortex` (which
didn't exist), passed its preflight, and scaffolded a complete second Cortex
layer nested inside the first: `.cortex/.cortex/`, `.cortex/.specflow/`,
`.cortex/.claude/` (26 skill bundles), `.cortex/CLAUDE.md`,
`.cortex/.gitignore`. The tell was `.cortex/CLAUDE.md` reading "Cortex is
active on **.cortex**" — init genuinely believed the `.cortex` directory was
a project.

## Diagnosis (seven-type classification)

1. **Dev spec governing this behaviour?** YES — `core-cli.init`
   (`.specflow/specs/core-cli/init.spec.md`) Rule 1 owns the preflight.
2. **Does the spec have a rule covering this case?** NO — Rule 1 as written
   stated exactly two refusal conditions (`.cortex/` already exists at the
   target; non-macOS platform), neither of which addresses a target that
   itself *is*, or is nested *beneath*, an existing Cortex layer. The rule's
   own existing-`.cortex/`-exists check only inspects `<target>/.cortex`, so
   a target that already sits inside `.cortex/` never trips it — its own
   `.cortex/.cortex` child doesn't exist.

First NO at step 2 → **type: incomplete-rule**. Rule 1 is stated and correct
as far as it goes; it simply never contemplated this case, so its own text
needed a new condition — not a wrong existing condition (`wrong-rule`), and
not merely a missing acceptance criterion over an already-adequate rule
(`missing-criterion`): the preflight logic itself had a real gap to close.

Severity **high**: the failure mode is silent — no error, no refusal — and
produces a fully-scaffolded, confusing nested Cortex layer (26 skill bundles,
a second CLAUDE.md, a second spec tree) inside the real project's `.cortex/`,
requiring manual cleanup and leaving the user's real project's `.cortex/`
polluted with a decoy self-referential "project."

## Resolution (2026-07-27)

**Spec (`.specflow/specs/core-cli/init.spec.md`):** Rule 1 amended with a
third preflight condition — refuse when the target sits at or beneath an
existing Cortex layer (a directory named `.cortex` carrying its own
`cortex.config.json`), naming the project root (the layer directory's
parent) and pointing at `cortex init`/`cortex sync` there instead. Stated
explicitly as **never bypassable by `--force`**, unlike the other two
conditions. Added AC "Target inside an existing Cortex layer refused, not
even by --force", including the non-false-positive clause: a normal project
root that merely contains a `.cortex/` child is unaffected.

The business spec this implements
(`developer-sets-up-cortex-in-one-command.business.md`) was re-read and does
not need a change: its promise is about setup succeeding when pointed at a
project, and its Rule 1 ("redoing setup ... requires explicit confirmation")
describes the ordinary re-init case, which `--force` still serves unchanged.
This guard only closes a degenerate misuse case (targeting inside `.cortex/`
itself) that the business spec never contemplated and that this fix does not
make any legitimate use case harder.

**Code (`src/cli/init.ts`):** added `findEnclosingCortexLayer(absRoot)` —
walks `absRoot`'s ancestor chain (including itself); a directory named
`.cortex` carrying its own `cortex.config.json` marks a real layer. `init()`
calls it in the Rule 1 preflight, right after the macOS gate and before the
existing-`.cortex/`-child gate; on a match it refuses (exit 2, nothing
written) regardless of `--force`.

**Tests (`tests/atomic/core-cli/init.test.ts`):** new "Rule 1: nested-layer
guard (B-013)" block: targeting the layer directory itself is refused;
`--force` does not override it; a subdirectory well inside the layer
(`.cortex/insight`) is also refused; a normal project root that merely
contains a `.cortex/` child is not a false positive and inits normally.

**Verification:** `pnpm build` clean; `pnpm vitest run
tests/atomic/core-cli/init.test.ts` — 47 passed (43 existing + 4 new);
`pnpm test` — 1195 passed | 9 skipped (baseline 1191 passed | 9 skipped, delta
is exactly the 4 new tests, no regressions); `node dist/cli/cli.js validate .`
— Conformant: YES, 0 errors. Manual proof: `cortex init <tmp>/proj/.cortex`
refused (exit 2) both with and without `--force`, nothing written under
`.cortex/`; `cortex init <tmp>/fresh` (an unrelated dir with no `.cortex/`
anywhere) proceeded normally, exit 0.
