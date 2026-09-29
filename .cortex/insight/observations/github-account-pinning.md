---
kind: insight-observation
updated: 2026-09-29T01:20:00Z
salient: false
sessions:
  - claude-sessions/pedropacheco/aafb436a-ec1e-4975-b5dd-e9b3b38fc522
---

This repo (cortex) is pinned to GitHub account `pedropacheco95`, not any
other account that may be configured on the machine. `origin`'s remote URL
uses the `github-personal` SSH host alias
(`git@github-personal:pedropacheco95/cortex.git`), so git-over-SSH
authenticates as `pedropacheco95` regardless of which key is the machine's
default. A repo-local HTTPS credential helper is also configured so an HTTPS
remote would use the same account. None of this pins the `gh` CLI: `gh`
commands always use whichever account `gh auth switch` last activated
globally, independent of the git remote's identity — a session must check or
set the active `gh` account separately before `gh pr create` or similar.
