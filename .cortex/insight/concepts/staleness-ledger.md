# staleness-ledger

The per-file sha256/commit/level tracking in ledger.json plus the reverse-dependency stale set and confidence-aging window that drive re-extraction and re-verification decisions.

## Files

- src/insight/refresh-daily.ts
- src/insight/refresh-fast.ts
- src/insight/storage.ts

## Related concepts

- insight-refresh-loops — implementing files co-inhabit cluster:insight-pipeline; the ledger decides what the refresh loops re-extract
