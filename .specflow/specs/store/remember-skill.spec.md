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

Writing must be as cheap as reading (vision §2). When the user says "remember this", or explains something the store doesn't hold, the agent files it in exactly one place by MAP's placement procedure and shows where in one visible line, so the user can correct it. This is the 4.0 skill for filing facts. It is agentic; Core only validates the result.

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
7. **Source digest** (2026-10-19, schema S7). When the user hands over a document or transcript to keep, the skill writes `history/sources/<YYYY-MM-DD>-<slug>.md`: a redacted digest (summary, claims, asks) with `captured: <today>`, `origin: external:<who or where, ≤ 120 chars, no URL>`, and, when the original is given as a file, `raw: history/sources/raw/<YYYY-MM-DD>-<slug>.<ext>` with the original copied there byte for byte (that folder is gitignored). Facts taken from the digest are then filed by the steps of Rule 2 with `origin: source:history/sources/<file>.md`. This section comes after the Rule 2 steps in the SKILL.md.
8. **Propose mode** (2026-10-19, schema S6). When the fact is a proposal rather than a settled fact (a rule an agent inferred, a suggested change, a gap found while working, or anything a person must approve), the skill appends one item to `now/proposals.md`: `## P-<YYYY-MM-DD>-<slug>: <title>`, then `until: <today + 30 days>` and `status: pending decision`, then the full text and where it came from. It creates the file with the S3 frontmatter (`permanence: volatile`) when absent, and adds its `origin` to the file's list. It ends with the readback `Proposed: <proposal> → now/proposals.md#P-<YYYY-MM-DD>-<slug> (origin: <origin>)`. Approval is a person, or an agent holding that authority, moving the text to its home and removing the item; the skill never approves its own proposal. This section comes after the Rule 2 steps.
9. The order and wording of the Rule 2 steps and the description are unchanged by Rules 7 and 8.
10. **The write gate** (2026-10-19). Every write of this skill, in all modes, applies only once `migration.accepted` is set in `cortex/cortex.json` or when the project has no `.cortex/`. Before that, the skill prints `This project's store is migrated but not accepted (cortex migrate --accept); nothing filed.` and writes nothing, so a re-run of `cortex migrate --apply` cannot overwrite a captured fact.
11. **Asks become spec requests** (2026-11-04). The two ingest skills are gone, and this is the one door for a document. Every ask listed in a source digest (Rule 7) is filed as one spec request, so no ask rests in a digest unread. For each ask the skill appends one propose-mode item (Rule 8) to `now/proposals.md`:
    - the heading is `## P-<YYYY-MM-DD>-<slug>: Spec request: <ask in ≤ 12 words>`;
    - then `until: <today + 30 days>` and `status: pending decision`;
    - then the line `Run specflow-spec on this ask.`, the ask quoted verbatim from the document, and `source: <digest path>`.

    The skill does not judge the ask, reconcile it against the specs, or run specflow-spec: that session does (`specflow.spec-skill` Rule 9). Its `origin` is `source:<digest path>`. It ends each with the readback `Spec request: <ask> → now/proposals.md#P-<YYYY-MM-DD>-<slug> (origin: source:<digest path>)`. A digest with no asks files no item. This paragraph comes in the source digest section of the SKILL.md, after its numbered steps. Rule 9 still holds: the Rule 2 steps and the description do not change.

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

### The skill writes source digests

- **Given** the SKILL.md text
- **When** it is read
- **Then** after the readback step it names `history/sources/<YYYY-MM-DD>-<slug>.md`, `captured`, the `external:` origin with no URL, `raw:` under `history/sources/raw/` copied byte for byte, and `source:` as the origin of facts taken from the digest

### The skill has a propose mode

- **Given** the SKILL.md text
- **When** it is read
- **Then** after the readback step it names `now/proposals.md`, the heading `## P-<YYYY-MM-DD>-<slug>: <title>`, `until:`, `status: pending decision`, the `Proposed:` readback line, and that the skill never approves its own proposal

### The skill writes nothing before acceptance

- **Given** the SKILL.md text
- **When** it is read
- **Then** its precondition names `migration.accepted`, the no-`.cortex/` case, and the line `This project's store is migrated but not accepted (cortex migrate --accept); nothing filed.`, before the steps

## Acceptance Criteria: spec requests (amendment 2026-11-04)

### Asks in a digest become spec requests

- **Given** the SKILL.md text
- **When** its source digest section is read
- **Then** it says every ask in the digest is filed in `now/proposals.md`, with the heading `## P-<YYYY-MM-DD>-<slug>: Spec request: <ask>`, `until:`, `status: pending decision`, the line `Run specflow-spec on this ask.`, the ask quoted verbatim, and `source:`

### The spec-request readback is exact

- **Given** the SKILL.md text
- **When** it is read
- **Then** it contains the line format `Spec request: <ask> → now/proposals.md#P-<YYYY-MM-DD>-<slug> (origin: source:<digest path>)`

### The skill does not judge an ask

- **Given** the SKILL.md text
- **When** its source digest section is read
- **Then** it says the skill does not reconcile the ask and does not run specflow-spec itself

### A digest with no asks files no item

- **Given** the SKILL.md text
- **When** its source digest section is read
- **Then** it says a digest with no asks files no spec request

### The Rule 2 steps and description are unchanged

- **Given** the SKILL.md text before and after this amendment
- **When** the description and the numbered steps are compared
- **Then** they are identical

### The write gate stands alone

- **Given** the SKILL.md text
- **When** its write gate is read
- **Then** it states the gate in full and cites no other spec
