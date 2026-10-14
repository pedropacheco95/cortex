---
id: store.rules
status: draft
depends_on:
  - store.layout
implements: ../../specs-business/store/agent-has-knowledge-when-it-needs-it.business.md
governed_by: []
governs:
  - "src/store/checks/rule.ts"
  - "src/store/checks/applies-when.ts"
  - "src/store/rules.ts"
---

# Rules as first-class files

## Intent

The user's rules live one per file in `world/rules/`, each with an `applies_when` written as a situation (schema S4), because the bench showed description quality decides whether a matcher fires on the right rule. Without Senses, rules are pulled. This spec defines the rule model, its checks, and the list of `always` rules that MAP prints in full. It also leaves the seam Senses will compile: `applies_when`, `scope` and `match`.

## Rules

1. `loadRules(store)` returns `{ path, about, appliesWhen, scope, match, source, verified, text }` for every `world/rules/*.md`. `text` is the body, trimmed.
2. `check.rule` (error): `applies_when`, `scope` and `source` are present; `scope` is a non-empty subset of `user-message`, `agent-answer`, `action`, `session-end`; `source` matches `<who>@<YYYY-MM-DD>`; `match.commands` entries compile as regular expressions; `match.paths` are strings; the body is not empty.
3. `check.applies-when` (warning, deterministic): 6–60 words; it starts with `The agent`, `The user`, `A session`, `When`, `Before`, `After` or `While`; it contains none of `about`, `related to`, `regarding`, `anything to do with`. The value `always` is exempt.
4. `alwaysRules(store)` returns the rules whose `applies_when` is `always`, ordered by filename, for `store.map`.
5. Nothing in 4.0 pushes a rule. This spec adds no hook.

## Acceptance Criteria

### A well-formed rule loads with its fields and text

- **Given** the schema S4 example rule
- **When** rules are loaded
- **Then** it has `scope` `[user-message, agent-answer, action]` and its text begins "End every substantive answer"

### Missing `applies_when` is an error

- **Given** a rule file without `applies_when`
- **When** the store is validated
- **Then** `check.rule` reports an `error` naming the file

### An unknown scope value is an error

- **Given** `scope: [prompt]`
- **When** the store is validated
- **Then** `check.rule` reports an `error` naming `prompt`

### A bad command regex is an error

- **Given** `match: { commands: ["git push (--force"] }`
- **When** the store is validated
- **Then** `check.rule` reports an `error`

### A topic-style description is linted

- **Given** `applies_when: "Anything about deployments"`
- **When** the store is validated
- **Then** `check.applies-when` warns: it does not start with an actor or a condition, and it uses a topic phrasing

### A situation-style description passes the lint

- **Given** `applies_when: "The agent is about to run a command that deploys to production"`
- **When** the store is validated
- **Then** `check.applies-when` reports nothing for it

### `always` rules are listed for the map

- **Given** two rules, one with `applies_when: always`
- **When** `alwaysRules` is called
- **Then** it returns only that one, with its full text
