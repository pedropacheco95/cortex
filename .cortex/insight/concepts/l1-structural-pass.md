# l1-structural-pass

The deterministic tree-sitter-based structural scan (skip-list triage, per-language extraction, import resolution, centrality ranking) that produces the raw import/export graph with no LLM involvement.

## Files

- src/insight/exclude.ts
- src/insight/l1-parse.ts
- src/insight/l1-triage.ts
- src/insight/l1.ts

## Related concepts

- insight-query-engine — co-members of cluster:insight-pipeline: the L1 pass produces the entries and graph the query engine reads
