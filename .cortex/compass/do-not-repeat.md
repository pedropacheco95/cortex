# Do not repeat

Index of recurring-mistake rules. Each entry points at a rule in `rules/`.

(nothing recorded yet)

Do not assume `git status` showing untracked files means uncommitted new work. This repo lives under `~/Documents/Projetos`, which is iCloud-synced (Desktop & Documents Folders). iCloud has repeatedly resurrected files/directories that a commit deleted (old mtimes reappearing as untracked, hit 3x: stray '* 2.md' duplicates, deleted src/schema files, the retired skill-suggest dirs). Before acting on unexpected untracked paths, check `git log` for a recent deletion that matches before treating them as real changes. Consider excluding this folder from iCloud sync or moving the repo out of `~/Documents`.