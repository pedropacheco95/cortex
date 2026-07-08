# CLAUDE.md Template for Onboarded Projects

Adapt this template when generating CLAUDE.md for an onboarded codebase. The key difference from a greenfield project is that conventions are *extracted* from existing code, not chosen fresh.

```markdown
# [Project Name]

[1 paragraph: what the project does and who it's for — extracted from README or code]

## Specflow

This project was onboarded to Specflow from an existing codebase. Specs are now the source of truth — code is an artifact.

- **Two parallel spec trees:**
  - `.specflow/specs/` — developer specs (schemas, APIs, dependency chains, Given/When/Then acceptance criteria). Every implemented behaviour has a leaf spec here.
  - `.specflow/specs-business/` — business specs (user-visible outcomes, journeys, business rules, success metrics). Stakeholder-readable. Each links to the dev specs that realise it via `implemented_by:`; each dev spec links back via `implements:`.
- **Folder overviews:** every directory in both trees contains an `_overview.md` explaining what the folder is, what it covers, and why the grouping exists. When you add or rename a folder, update its overview AND its parent's overview in the same change.
- `link-map.md` is the human-readable bidirectional coverage view (business → dev and the unmapped-dev list).
- `build-order.md` defines the sequence for implementing remaining draft specs.
- `.cortex/compass/bugs/` (the bug ledger, one `B-NNN-<slug>.md` per bug) holds known bugs discovered during onboarding (spec-code delta) — never a root `bugs.md`.
- `corrections.md` documents all human corrections made during onboarding.

When changing behaviour: update the **dev spec** first; if the change affects the user-visible outcome, also update the **business spec** in the same PR. The two trees should never drift.

### Spec statuses
- `implemented` — Code exists, tests pass, human approved during onboarding
- `draft` — Known bug or missing feature, needs implementation
- Any spec with `OPEN:` notes needs human decision before work begins

## Build Loop

When implementing a draft spec (fixing a bug or adding a missing feature):

1. **Check dependencies** — All `depends_on` specs must be `implemented`
2. **Read the spec** — Understand intent, rules, and acceptance criteria
3. **Read corrections.md** — Check if this spec has human corrections that add context
4. **Load relevant skills** — Check `.claude/skills/` for codebase-specific patterns
5. **Write tests first** — Translate acceptance criteria into tests. They should fail for bugs, pass for new features.
6. **Implement** — Follow existing codebase patterns (see RULES.md and skills)
7. **Run tests** — New tests + full regression suite must pass
8. **Update status** — Change spec status to `implemented`

## Project Structure

```
[Extract actual directory structure from the codebase]
```

## Commands

[Extract from package.json scripts, Makefile, pyproject.toml, etc.]

### Development
```bash
[actual dev server command]
```

### Testing
```bash
[actual test commands]
```

## Conventions

[Extracted from the codebase — naming, patterns, architecture decisions]

## What NOT to Do

- Never implement without reading the spec and corrections.md for that feature
- Never change a pattern that's consistent across the codebase without updating RULES.md
- Never skip tests — every spec's acceptance criteria are test cases
- Never modify `implemented` specs without human approval
- Never delete code listed in dead-features.md without confirming with the human first
```
