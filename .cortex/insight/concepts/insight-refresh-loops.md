# insight-refresh-loops

The three-tier (fast/daily/full) refresh pipeline that keeps the insight layer's per-file entries, graph, and ledger in sync with source changes after every commit.

## Files

- src/insight/refresh-daily.ts
- src/insight/refresh-fast.ts
- src/insight/refresh-full.ts

## Related concepts

- staleness-ledger — implementing files co-inhabit cluster:insight-pipeline; the ledger decides what the refresh loops re-extract
