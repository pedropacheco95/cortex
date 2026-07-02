# SpecFlow — Overview

## What this is

The spec-and-test lineage absorbed into Cortex: the conventions of the two spec trees, the four test layers, the seven-type bug taxonomy, and the Cortex-awareness updates to the eleven specflow-* skills.

## What it covers

_No specs written yet — this tree is scaffolded structure only. Planned coverage:_

- The conventions of the two spec trees (`specs/` and `specs-business/`)
- The four test layers: atomic, spec, journey, and scenario, with the `covers:` coverage constraint
- The seven-type bug taxonomy
- The Cortex-awareness updates to the eleven specflow-* skills (reading anatomy, cerebrum, and atlas before producing output)

## Why it's grouped this way

This domain owns spec-and-test discipline and its skills. The cortex-* persistence and loop skills live conceptually under `loops/`, `pulse/`, and `atlas/` — this domain holds only the absorbed SpecFlow lineage and the skills that produce and verify specs and tests. The bug *taxonomy* is defined here, but the live bug *ledger* lives in `cerebrum/`.

The specflow-* skills are agentic and so sit apart from the deterministic `core-cli/`; their Cortex-awareness updates make them read the surrounding state before acting.

## Related groups

- Business outcomes for this domain: `../../specs-business/specflow/`
- The contract these conventions formalise: `../schema/`
- The live bug ledger using this taxonomy: `../cerebrum/`
- Persistence/loop skills: `../loops/`, `../pulse/`, `../atlas/`
