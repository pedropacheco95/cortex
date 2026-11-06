---
about: "When do rules (b) and (c) of cortex check turn on?"
permanence: changing
verified: "2026-11-06 (told)"
origin:
  - session:13ecca9a-2346-4535-8492-95892e9bd065
---

## Answer

Rules (b) and (c) of `cortex check` stay `off` in `cortex/cortex.json` until the 3.x code is deleted. The 3.x tests stay untagged until then.

## Why

`lint.rules-early` is an error while either rule is on and `Untagged tests` is above 0 (`specflow.port` Rule 14), and 1,162 tests were untagged on 2026-11-06. Pedro's reading is that most of them are 3.x tests, which go with the 3.x code, so the count reaches 0 by deleting them rather than tagging them.

By folder, 400 sit in areas 4.0 drops or supersedes: pulse 147, recall 88, insight 86, constellation 55, compass 24. The other 762 are in schema, hooks, loops, core-cli, discipline, store and tasks, which mix 3.x and 4.0 tests; `specflow/INDEX.md` lists them by file.

## Rejected

- Tagging the 3.x tests under one broad criterion, so the count reaches 0 sooner.
