---
id: store.remember-skill
status: draft
depends_on:
  - store.map
implements: ../../specs-business/store/agent-has-knowledge-when-it-needs-it.business.md
governed_by: []
governs:
  - "skills/cortex-remember/SKILL.md"
  - ".claude/skills/cortex-remember/SKILL.md"
---

# `cortex-remember`: capture one fact by the placement procedure

## Intent

Writing must be as cheap as reading (vision §2). When the user says "remember this", or explains something the store doesn't hold, the agent files it in exactly one place by MAP's placement procedure and shows where in one visible line, so the user can correct it. This is the one 4.0 skill. It is agentic; Core only validates the result.

## Rules

1. The bundle is `skills/cortex-remember/SKILL.md`, mirrored byte-for-byte to `.claude/skills/cortex-remember/SKILL.md`. Its description fits the skill-listing budget (`scaffolding.skill-listing-budget`).
2. The skill's steps, in order:
   - (1) search the store for the fact's subject (`rg -i` on the key words and `rg '^about:' cortex/`);
   - (2) if a subject file exists, append the fact there;
   - (3) otherwise pick the folder by MAP's kind → folder table and the tie-breaker, and create the file with the S3 frontmatter;
   - (4) set `verified` to today with the right method (`told` when the user said it), and set `origin` to `session:<id>` from `$CLAUDE_CODE_SESSION_ID`; when appending to an existing file, add it to that file's `origin` list. If the harness exposes no session id, use `person:user@<today>`, and if the fact came from an ingested document, use `source:<its digest path>` instead;
   - (5) for a fact that is only true for now, write it in `now/` with `until:`;
   - (6) run `cortex store validate` and fix any error it reports for that file;
   - (7) end with the readback line `Filing: <fact in ≤ 12 words> → <path> (origin: <origin>)`.
3. A rule from the user ("from now on…", "always…", "never…") is filed in `world/rules/` with `applies_when` written as a situation, `source: user@<today>`, and a `scope`.
4. The skill never restates a fact that already exists elsewhere. If the fact contradicts an existing file, it updates that file and says so in the readback (`Updated: … → <path> (origin: <origin>)`).
5. The skill never writes under `history/` except to create a new dated file.
6. **Stated limit: harnesses without a session id.** The session link exists only where the harness exposes a session id (Claude Code sets `$CLAUDE_CODE_SESSION_ID`). Codex, and any other harness that reads `AGENTS.md` without exposing one, gets the fallback `person:user@<today>`: the file still has a valid origin, but the link back to the conversation is lost. This is accepted for 4.0, not a defect to work around with transcript paths or URLs (S3, RULES.md rule 20).

## Acceptance Criteria

### The bundle exists and is mirrored

- **Given** the repository
- **When** the skill bundles are listed
- **Then** `skills/cortex-remember/SKILL.md` exists and `.claude/skills/cortex-remember/SKILL.md` is byte-identical

### The description fits the listing budget

- **Given** the skill's frontmatter `description`
- **When** `pnpm check:skill-budget` runs
- **Then** it passes

### The skill carries the placement procedure in order

- **Given** the SKILL.md text
- **When** it is read
- **Then** it names, in this order: search first, append to the existing subject file, the kind → folder table, the tie-breaker, `verified` with a method and `origin`, `until:` for `now/`, `cortex store validate`, and the readback

### The readback format is specified exactly

- **Given** the SKILL.md text
- **When** it is read
- **Then** it contains the line format `Filing: <fact> → <path> (origin: <origin>)` and the update form `Updated: <fact> → <path> (origin: <origin>)`

### The origin comes from the session, with a stated fallback

- **Given** the SKILL.md text
- **When** it is read
- **Then** it sets `origin` from `$CLAUDE_CODE_SESSION_ID` as `session:<id>`, adds to an existing file's `origin` list when appending, names the `person:user@<today>` fallback for a harness with no session id and `source:<digest path>` for a fact from an ingested document, and never writes a transcript path or URL

### User rules go to world/rules with a situation

- **Given** the SKILL.md text
- **When** it is read
- **Then** it directs rules to `world/rules/` with `applies_when` written as a situation, plus `source` and `scope`
