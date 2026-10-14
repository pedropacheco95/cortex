---
about: "Do not assume `git status` showing untracked files means uncommitted new work. This repo lives under `~/Documents/Projetos`, which is iCloud-synced (Desktop &…"
permanence: changing
verified: "2026-07-10 (told)"
origin:
  - migrated:compass/do-not-repeat.md#3@d7ed910
---

Do not assume `git status` showing untracked files means uncommitted new work. This repo lives under `~/Documents/Projetos`, which is iCloud-synced (Desktop & Documents Folders). iCloud has repeatedly resurrected files/directories that a commit deleted (old mtimes reappearing as untracked, hit 3x: stray '* 2.md' duplicates, deleted src/schema files, the retired skill-suggest dirs). Before acting on unexpected untracked paths, check `git log` for a recent deletion that matches before treating them as real changes. Consider excluding this folder from iCloud sync or moving the repo out of `~/Documents`.
