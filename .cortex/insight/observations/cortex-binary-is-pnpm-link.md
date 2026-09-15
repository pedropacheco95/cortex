---
kind: insight-observation
updated: 2026-08-20T16:40:02Z
salient: false
sessions:
  - claude-sessions/pedropacheco1/fc8202fc-723d-4a7c-82df-597d17b5601c
  - claude-sessions/pedropacheco1/5d0bfb94-f382-47c0-8190-8f2cc978dd0c
  - claude-sessions/pedropacheco1/70746728-ff13-4543-a618-90ab8d6b8232
---

The global `cortex` binary on this machine is a `pnpm link` straight to
this repo's `dist/` output, not a published npm install (`1.0.0` has
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
