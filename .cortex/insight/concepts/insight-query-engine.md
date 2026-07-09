# insight-query-engine

The read-only, deterministic query layer that resolves the scoped-vs-flat layout difference internally and answers file/concept/element lookups for the cortex insight CLI.

## Files

- src/insight/cli.ts
- src/insight/entry.ts
- src/insight/query.ts

## Related concepts

- l1-structural-pass — co-members of cluster:insight-pipeline: the L1 pass produces the entries and graph the query engine reads
