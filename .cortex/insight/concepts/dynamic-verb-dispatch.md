# dynamic-verb-dispatch

Routing CLI verbs and heavy one-off compile steps through `await import(...)` at call time instead of static top-of-file imports, to keep the process's initial require graph minimal.

## Files

- src/cli/cli.ts
- src/cli/init.ts
