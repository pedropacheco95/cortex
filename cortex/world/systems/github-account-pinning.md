---
about: This repo pushes as pedropacheco95; the gh CLI is not pinned and uses whichever account is active
permanence: changing
verified: "2026-11-04 (observed)"
origin:
  - migrated:insight/observations/github-account-pinning.md@ff385a4
  - session:aafb436a-ec1e-4975-b5dd-e9b3b38fc522
aliases:
  - github-account-pinning
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

As of 2026-11-04, `origin` on the current Mac is the HTTPS URL `https://github.com/pedropacheco95/cortex.git`, so the repo-local credential helper is what pins the account there, and `pedropacheco-berd` is the active `gh` account.

<!-- 3.x fields of insight/observations/github-account-pinning.md, carried verbatim by cortex migrate -->
```yaml
kind: insight-observation
salient: false
```
