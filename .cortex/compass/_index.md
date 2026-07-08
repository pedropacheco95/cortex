# Compass — index

**Read this when:** the user asks "why" about a convention or decision, before you
propose a write that touches governed files, or when triaging a bug.

**What's here:**
- `rules/` — one file per rule (R-NNN). Match a write's path against each rule's `governs`.
- `bugs/` — the bug ledger (B-NNN), classified by the seven-type taxonomy.
- `preferences.md`, `environment.md` — project conventions and operational pointers.
- `do-not-repeat.md` — index of recurring-mistake rules.

**How to navigate:** from a rule, follow `source:` to the atlas decision or bug that
justifies it; follow `governs:` to the files it constrains; follow `related_specs:`
to the specs it touches.
