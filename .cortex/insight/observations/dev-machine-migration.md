---
kind: insight-observation
updated: 2026-09-29T01:20:00Z
salient: true
sessions:
  - claude-sessions/pedropacheco/04aeb5a4-47a2-4aa7-bcfd-f2c1e3f9bd1a
  - claude-sessions/pedropacheco/aafb436a-ec1e-4975-b5dd-e9b3b38fc522
  - claude-sessions/pedropacheco1/ecaa3281-fae5-453e-84ce-792d983d29e2
---

Development spans two Macs as of 2026-09-28: a new Mac was set up via a
"cortex-carry" migration bundle (a Downloads-delivered zip with setup
instructions, carried `.claude/` config, memory and skills), while the old
Mac (OS user `pedropacheco1`) kept running its own copies of the same 5
Cortex scheduled tasks after the new Mac's tasks were registered. Cortex has
no cross-machine dedup for scheduled bundles — when a new machine's tasks are
registered, the old machine's 5 tasks must be disabled manually, or the
daily/weekly/monthly loops run twice against the same repo and git history.

pnpm 12.6 has a real bug in `pnpm setup`: it overwrites the real pnpm binary
in corepack's cache with a small script that calls `pnpm dlx`, so every
subsequent pnpm command — including a retried `pnpm setup`/`pnpm link` —
calls itself forever. This presents as a hang, not a crash. Fix: delete the
broken scripts `pnpm setup` drops in `~/Library/pnpm/bin` (only the `cortex`
shim belongs there), delete corepack's cached copy of that pnpm version so it
redownloads clean, and do not run `pnpm setup` or `pnpm link` again on that
pnpm version afterward — `pnpm build` alone is enough to refresh an
already-installed shim. Separately, `pnpm link --global` no longer exists in
pnpm 12 (the guide's fallback is `pnpm setup` then a no-argument
`pnpm link`), and `pnpm link` itself hangs on 12.6 regardless of the setup
bug — the working global-install pattern is a hand-written shell shim, not
`pnpm link` and not a plain symlink (see `cortex-binary-is-pnpm-link.md` for
why a symlink silently no-ops every verb, B-026).
