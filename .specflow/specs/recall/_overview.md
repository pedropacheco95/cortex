# Recall — Overview

## What this is

The recall surface: the machinery that lets a later session reach what earlier sessions decided,
measured, and left open, instead of re-deriving it. Step 0 repaired the observer and counted usage
honestly; step 1 gave sessions a record and a threads ledger; step 2 (this domain's first spec)
compiles the forward edges into one index; step 3 adds the consumers that read it — two hooks, two
verbs, and the generated index blocks.

## What it covers

**Specs written:**

- `recall.recall-index` — the compiled, regenerable, gitignored `.cortex/recall-index.json`
  (schema §4.11): every `bears_on` edge inverted into per-subject lists of decisions, evidence,
  open threads and observation themes, under three entailment rules (current decisions only, open
  threads only, evidence inherited through the citing decision), built by `cortex scan`,
  `cortex init`, and the post-commit fast tier.
- `recall.why` — `cortex why <ref>` (everything the index holds for one subject: decided,
  evidence with its first three findings, open threads, observation themes; `--json`) and
  `cortex recall <query>` (keyword search over the entries, top five, `--kind`). Pull only;
  index only; exit 1 with a `cortex scan` hint when the index is absent.
- `recall.index-blocks` — the generated `<!-- cortex:recall:start -->` block `cortex scan` and
  `cortex init` write into `atlas/decisions/_index.md` and `atlas/evidence/_index.md`: one line per
  entry with the subjects it bears on, newest first, collapsing to a count line inside the §7.1
  budget; hand-written text preserved, opaque to `cortex sync`, idempotent.

The two hook consumers live in `../hooks/`: `hooks.search-annotate` (the PreToolUse Grep/Bash
pointer, which also owns the shared query module `src/recall/query.ts`) and
`hooks.pre-read-writeback` Rule 6 (the PreRead marker).

_Planned (step 4, not yet written):_

- Open-thread prompt routing for scheduled sessions; the read-deferral flag.

## Why it's grouped this way

The pieces the recall work adds cut across pulse (threads), atlas (evidence), schema (the edge and
the clause resolver) and hooks (the consumers); each of those lives in its own domain. What is
*only* recall — the compiled inverse and, later, the hooks and verbs that consume it — has no
natural home in any of them, and a domain of its own keeps the consumer side from being scattered
across `hooks/` and `core-cli/` where the pull-only history would hide it.

## Related groups

- The edge this domain inverts: `../schema/` (`schema.bears-on`, `schema.schema-clauses`)
- The carriers it reads: `../atlas/` (`atlas.evidence`), `../pulse/` (`pulse.threads`),
  `../insight/` (observations, `insight.session-observe`)
- The hooks that consume it: `../hooks/` (`hooks.search-annotate`, `hooks.pre-read-writeback`)
- The verbs' home in the CLI: `../core-cli/` (`cortex scan` and `cortex init` call the block writer)
- Business outcome: `../../specs-business/scaffolding/`
