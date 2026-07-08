# CLAUDE.md Template

Use this template when generating the project's CLAUDE.md. Adapt sections based on the project type — a CLI tool won't have frontend commands, a library won't have a database section.

```markdown
# [Project Name]

[1 paragraph: what the project does and who it's for]

## Specflow

This project uses Specflow — specs are the source of truth, code is an artifact. There are **two parallel spec trees**:

- `.specflow/specs-business/` — high-level outcomes, user journeys, and success metrics for stakeholders. Each business spec is the contract with the client. **Read this first** when you want to understand *why* something exists.
- `.specflow/specs/` — developer-facing specs with schemas, APIs, dependency chains, and Given/When/Then acceptance criteria. Each leaf spec is the contract with the implementer. **Read this when you're about to write code.**

Every directory in both trees has an `_overview.md` explaining what it groups and why. Start there if you're new to a folder.

The two trees are bidirectionally linked:
- Each developer leaf spec's frontmatter has `implements:` pointing to the one business spec it serves.
- Each business spec's frontmatter has `implemented_by:` listing every developer spec that contributes to it.

If you change a developer spec in a way that invalidates the business spec it implements, you must update the business spec in the same change. Drift between the two trees is a bug.

The build order in `build-order.md` defines implementation sequence.

## Build Loop

When implementing a developer spec, follow this exact sequence:

1. **Read the business spec it implements.** Follow the `implements:` link first — understand the user-visible outcome before touching code. If the dev spec doesn't make sense in light of the business spec, stop and raise it.
2. **Check dependencies.** Read the dev spec's `depends_on`. All dependencies must be `implemented` before starting.
3. **Read the dev spec.** Understand the intent, entities, rules, and acceptance criteria.
4. **Load relevant skills.** Check `.claude/skills/` for applicable domain knowledge.
5. **Write tests first.** Translate acceptance criteria into test cases. Tests should fail initially.
6. **Implement.** Write the minimum code to make tests pass. Follow rules in RULES.md.
7. **Run tests.** All new tests must pass. Run the full regression suite too.
8. **Update status.** Change the dev spec's status from `draft` to `implemented`.
9. **Re-read the business spec.** If the implemented behaviour drifted from the business spec's promise, update the business spec in the same change. Spec trees must stay aligned.
10. **Update build log.** Record what was implemented and any decisions made.

## Project Structure

```
[Adapt this to the actual project structure. Always include both spec trees.]
project-root/
├── .specflow/specs-business/          # client-facing outcomes
│   ├── _overview.md
│   └── {domain}/
│       ├── _overview.md
│       └── {outcome}.business.md
├── .specflow/specs/                   # developer-facing specs
│   ├── _overview.md
│   ├── _index.md
│   └── {domain}/{capability}/{leaf}.spec.md
└── ...
```

## Commands

[Adapt these to the project's tech stack]

### Development
```bash
[dev server command]
```

### Testing
```bash
[test commands]
```

### Database
```bash
[migration commands, if applicable]
```

## Key Decisions

[List important architectural and stack decisions with brief rationale]

- **[Decision]** — [Why]

## What NOT to Do

- Never implement without a dev spec — if the spec doesn't exist, create it first (and the business spec it implements, if that's missing too).
- Never let the dev tree and business tree drift — if a change invalidates the business promise, update the business spec in the same commit.
- Never skip the `implements:` / `implemented_by:` links — broken links break the spec viewer and confuse future readers.
- Never delete an `_overview.md`. If you reshape a folder, rewrite the overview to match.
- Never skip tests — every spec's acceptance criteria become test cases.
- Never hardcode configuration — use environment variables or config files.
- Never modify specs without user approval — specs are the contract.
- Never ignore RULES.md — rules exist for good reasons.
```

## Adapting the template

**For a CLI tool:** Remove database and frontend sections. Add sections for argument parsing, input/output formats, and exit codes.

**For an API service:** Add sections for API conventions (REST/GraphQL), authentication, rate limiting, and error response formats.

**For a library:** Add sections for public API surface, versioning, backward compatibility, and documentation generation.

**For a data pipeline:** Add sections for data formats, scheduling, error recovery, and monitoring.
