# pulse-proposal-gate

The propose-don’t-mutate boundary: loops and distillation only write typed suggestion proposals to .cortex/pulse/, and the sole path that mutates gated layers (compass/atlas/specs) is the human-driven review/promote gate, constrained to the permitted target roots.

## Files

- src/pulse/promote.ts
- src/pulse/review.ts
- src/pulse/types.ts

## Related concepts

- promotion-graduation-path — co-members of cluster:pulse-proposals: graduation routes through the same review/promote gate
