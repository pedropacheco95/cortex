---
id: hooks.pre-write
status: implemented
depends_on:
  - core-cli.init
implements: ../../specs-business/hooks/assistant-gets-timely-guardrails.business.md
governed_by: []
---

# PreWrite Hook (PreToolUse on Write|Edit)

## Intent

The PreWrite hook is where Cortex earns its keep (design §5.3): before a write or edit lands, it checks the cerebrum rules whose `governs:` globs match the target path or whose `check:` predicates match the proposed content, and warns Claude — with the rule's source attached — without ever blocking the operation. It is the only mechanism that prevents a class of error rather than observing it, and it catches cases where the index-first protocol was skipped.

## Entities

- **READS:** stdin JSON (`tool_name`, `tool_input.file_path`, `tool_input.content` for Write / `tool_input.new_string` for Edit, `cwd`); `.cortex/cerebrum/rules/R-*.md` (frontmatter: `governs`, `check`, `status`, `title`, `source`).
- **WRITES:** `.cortex/pulse/hook-errors.md` (append, only on internal error).
- **CREATES:** nothing.

## Rules

1. **Invocation.** Registered by `cortex init` as `{"type": "command", "command": "cortex hook pre-write", "timeout": 10}` under `PreToolUse` with matcher `"Write|Edit"`. The `cortex hook ` command prefix is the Cortex-ownership marker (see `hooks.session-start` Rule 1).
2. **Envelope (pinned).** When at least one rule matches: exit 0 + stdout JSON `{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "allow", "additionalContext": "<warnings>"}}` — `additionalContext` reaches Claude as a system reminder at the tool-result position. **The hook never emits `deny` or `ask`, never uses `updatedInput`, and never exits 2.** Warn-never-block is enforced by the envelope itself.
3. **Zero-overhead silence.** No matching rule → exit 0, empty stdout. This is the common case (design §6.3: average overhead near zero).
4. **Rule matching (revised per B-001).** Matching is two-stage: the target path must fall inside the rule's scope, and then the warning decision depends on whether the rule is mechanically checkable:
   - **Predicate-bearing rules** (`check:` of kind `regex` or `grep`): warn **only when the predicate fires** on the proposed content (Write: `content`; Edit: `new_string`) within its `applies_to` scope (default `governs`). `expect: absent` → a pattern match is a violation; `expect: present` → a missing pattern is a violation. A governed path whose content passes the predicate is a **silent pass** — path match alone never warns for these rules.
   - **Predicateless rules** (`check:` absent or `kind: none`/`ast` — nothing the hook can evaluate): warn on path match. The hook cannot verify content mechanically, so surfacing the rule is the correct conservative behaviour; `ast` predicates' content enforcement belongs to the test layer (design §8.4 bridge 1).

   Rules with `status: retired` are skipped entirely. This split is what keeps "silence is the normal case" true (design §6.3) while preserving the fallback for rules that can't be checked mechanically.
5. **Warning text.** One line per matching rule, per schema §5: `⚠ Cortex {{RULE_ID}} may apply to {{PATH}}: {{RULE_TITLE}}. Source: {{SOURCE_PATHS}}. {{GUIDANCE}}` — multiple matches concatenate into one `additionalContext`, each carrying its rule ID and source so the warning can be challenged, not just obeyed.
6. **Degradation.** A malformed rule file is skipped (the remaining rules are still evaluated), one degradation line is appended to the warning if any other output is being emitted, and a structured entry is appended to `.cortex/pulse/hook-errors.md`. A missing `.cortex/` or empty `rules/` → silent exit 0. The hook never exits non-zero.
7. **Deterministic and offline.** Pure Node file I/O; no network, no LLM, no subprocess. Target: fast enough to be imperceptible per write.

## Acceptance Criteria

### Path-matching rule warns with ID, title, and source

- **Given** rule `R-014` with `governs: ["src/db/**/*.ts"]`, `title: No camelCase database columns`, a source path, and no `check:` predicate
- **When** the hook receives a Write to `<project>/src/db/schema.ts`
- **Then** stdout JSON has `permissionDecision: "allow"` and `additionalContext` containing `R-014`, the title, and the source path

### Content-predicate rule warns on proposed content

- **Given** rule `R-020` with `check: {kind: regex, pattern: "console\\.log", expect: absent}` and `governs: ["src/**"]`
- **When** the hook receives an Edit to `src/a.ts` whose `new_string` contains `console.log("x")`
- **Then** `additionalContext` warns naming `R-020`

### No matching rule → empty stdout

- **Given** rules whose globs match only `src/db/**`
- **When** the hook receives a Write to `docs/readme.md`
- **Then** the exit code is 0 and stdout is empty

### Never blocks, by envelope

- **Given** any input, including one matching five rules simultaneously
- **When** the hook runs
- **Then** the exit code is 0 and the JSON never contains `"deny"`, `"ask"`, or `updatedInput`

### Malformed rule file degrades without losing the others

- **Given** `rules/R-001-broken.md` with unparseable frontmatter and a valid matching `R-002`
- **When** the hook receives a matching Write
- **Then** `additionalContext` carries the `R-002` warning, exit code 0
- **And** `.cortex/pulse/hook-errors.md` gains an entry naming `R-001-broken.md`

### Predicate passes on a governed path → silent (B-001 regression)

- **Given** rule `R-001` with `governs: ["src/schema/**"]` and `check: {kind: regex, pattern: "@anthropic-ai/", expect: absent}`
- **When** the hook receives a Write to `src/schema/clean.ts` whose content contains no LLM SDK import
- **Then** the exit code is 0 and stdout is empty

### Predicateless rule still warns on path match

- **Given** rule `R-030` with `governs: ["src/db/**"]` and no `check:` field
- **When** the hook receives a Write to `src/db/schema.ts` with any content
- **Then** `additionalContext` warns naming `R-030`

### Retired rules are silent

- **Given** a path-matching rule with `status: retired`
- **When** the hook receives a matching Write
- **Then** stdout is empty

## Notes

- The `additionalContext` field on PreToolUse JSON output is a newer Claude Code API capability (verified in current docs 2026-07-02, absent in older CLI versions). The implementation should degrade to silence (never to blocking) if the installed CLI ignores the field; `cortex init` may add a minimum-CLI-version note to its summary. OPEN: whether init should detect the CLI version — decide at implementation.
- `ast`-kind predicates warn on path only (Rule 4) — a deliberate v1 boundary, not an omission.
- Rule 4's two-stage semantics are the resolution of bug `B-001` (`.cortex/cerebrum/bugs/B-001-prewrite-path-match-noise.md`): the original rule warned on path match alone, which made every write to a governed path noisy. The ledger entry stays filed as history.
- Journey-layer tests deferred to v1.1 (see `hooks.session-start` Notes).
