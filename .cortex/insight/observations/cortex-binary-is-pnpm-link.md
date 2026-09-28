---
kind: insight-observation
updated: 2026-09-28T18:10:00Z
salient: false
sessions:
  - claude-sessions/pedropacheco1/fc8202fc-723d-4a7c-82df-597d17b5601c
  - claude-sessions/pedropacheco1/5d0bfb94-f382-47c0-8190-8f2cc978dd0c
  - claude-sessions/pedropacheco1/70746728-ff13-4543-a618-90ab8d6b8232
  - claude-sessions/pedropacheco/aafb436a-ec1e-4975-b5dd-e9b3b38fc522
---

The global `cortex` binary on the development machine runs this repo's
`dist/` output directly, not a published npm install. Since the
2026-09-28 move to a new Mac it is a hand-written `sh` shim
(`exec node <repo>/dist/cli/cli.js "$@"` in pnpm's global bin dir),
not a `pnpm link`: `pnpm link` hangs on pnpm 12.6, and a plain symlink
makes every verb exit 0 silently (B-026). The effect is the same either
way, and so is the caveat below (`1.0.0` has
never actually been published to the registry). This means every local
schema/version bump in this repo takes effect on every OTHER Cortex
project on this machine immediately and silently the next time `cortex`
runs there — there is no install/upgrade step to notice or defer.

This caused a real bug: a `SKILL_ADDITIONS` chain entry added *within* an
already-recorded schema version was silently skipped on other local
projects (`berd`, `app_do_ribeiro`) because their linked `cortex` had
already recorded that schema version before the new bundle entry was
added to the chain — a "seed-version trap." When debugging why a change
in this repo isn't reflected in another project that also uses `cortex`,
or vice versa, remember they may be running the literal same linked
binary, not independent installs.
