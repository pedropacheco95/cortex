# Recall — Overview

## What this is

The recall surface: the machinery that lets a later session reach what earlier sessions decided,
measured, and left open, instead of re-deriving it. Step 0 repaired the observer and counted usage
honestly; step 1 gave sessions a record and a threads ledger; step 2 (this domain's first spec)
compiles the forward edges into one index; step 3 will add the consumers that read it.

## What it covers

**Specs written:**

- `recall.recall-index` — the compiled, regenerable, gitignored `.cortex/recall-index.json`
  (schema §4.11): every `bears_on` edge inverted into per-subject lists of decisions, evidence,
  open threads and observation themes, under three entailment rules (current decisions only, open
  threads only, evidence inherited through the citing decision), built by `cortex scan`,
  `cortex init`, and the post-commit fast tier.

_Planned (step 3, not yet written):_

- The search-time annotation hook (Grep/Bash) and the PreRead marker that read the index.
- `cortex why <subject>` and the generated index blocks.
- Open-thread prompt routing.

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
- The hooks that will consume it: `../hooks/`
- Business outcome: `../../specs-business/scaffolding/`
