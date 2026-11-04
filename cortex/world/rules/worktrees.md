---
about: Where and how agents work on this repo's code — always a git worktree under ~/worktrees/cortex/<slug>, never the main checkout
permanence: changing
verified: "2026-10-21 (told)"
origin:
  - session:c4837ca3-4601-4f5b-99b6-857f3f005bb6
applies_when: The agent is about to edit code, create a branch, or create or remove a git worktree for this repo
scope:
  - action
match: { commands: ["git worktree", "git checkout -b", "git switch -c"], paths: [] }
aliases: [worktree, worktrees, git-worktree]
---

# Worktrees

- Always work in a git worktree, never in the main checkout (`~/Documents/Projetos/cortex`).
- Create every worktree under `~/worktrees/cortex/<slug>`. Never beside the repo, never loose in `~`. That folder is excluded from Spotlight.
- Remove the worktree when its PR is merged (`git worktree remove`, then delete the branch).

Pedro, 2026-10-21, verbatim (stated for levapp, applies to every project as `~/worktrees/<project>/<slug>`): "Worktrees: always work in a git worktree, never in the main checkout. Create every worktree under `~/worktrees/<project>/<slug>` (for this repo: `~/worktrees/levapp/<slug>`), never beside the repo or loose in `~`. That folder is excluded from Spotlight. Remove your worktree when its PR is merged."

Context: on 2026-10-20 the `cortex-v4` worktree sat beside the repo at `~/Documents/Projetos/cortex-v4` for a week after its merge; a search of `~` on 2026-10-21 found no other loose cortex worktrees.
