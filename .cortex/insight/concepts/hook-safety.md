# hook-safety

The warn-never-block invariant (RULES.md rule 6): every Claude Code hook handler degrades to silence plus a logged entry rather than ever blocking or crashing the session.

## Files

- src/hooks/cli.ts
- src/hooks/errors.ts
- src/hooks/post-write.ts
- src/hooks/pre-read.ts
- src/hooks/pre-write.ts
- src/hooks/session-start.ts
