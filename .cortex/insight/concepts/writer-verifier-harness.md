# writer-verifier-harness

The independent writer/verifier sub-agent pattern: two headless Claude CLI subprocesses that never share reasoning, run against an isolated workspace, with a shared auth-failure detection contract.

## Files

- src/cli/claude-auth.ts
- src/harness/run.ts
