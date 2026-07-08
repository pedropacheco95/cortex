---
id: insight.cli
status: implemented
depends_on:
  - insight.storage-format
implements: ../../specs-business/insight/assistant-understands-codebase.business.md
governed_by:
  - R-001
governs:
  - "src/insight/cli.ts"
  - "src/insight/query.ts"
---

# Insight Query CLI — `cortex insight file/concept/element`

## Intent

This spec defines the `cortex insight` query surface for v3 — implements addendum §A5.1 (superseding schema §4.10.5). Three deterministic subcommands — `file`, `concept`, `element` — read the pre-extracted shapes fixed by `insight.storage-format` and return them at the grain asked for. This spec supersedes v2's `query | get | neighbors | list` verbs entirely: v2 queried a concept-map over curated artefacts, v3 queries a codebase-understanding layer over source-code entities, and the verb change reflects that difference (design §5.6). All three subcommands are deterministic Core reading files already on disk — **no LLM runs at query time** (RULES 3); the judgment was spent at extraction time by `insight.extract-skill`. There is deliberately no `cortex insight ask` in v3 — natural-language questions are answered by Claude in-session over these three primitives, not by a subprocess (design §5.6, addendum §A5.1).

## Entities

- **READS:** the shapes owned by `insight.storage-format` — per-file entries under `anatomy/` or `scopes/<scope>/anatomy/`; `concepts/` files (scope-local and global); `graph.json`/`tags.json`/`clusters.json` (scope-local and cross-scope); `scope-registry.yaml` when present.
- **WRITES:** nothing — this is a read-only query surface.
- **CREATES:** nothing on disk; each subcommand's only output is its returned payload (human-readable text, or structured JSON under `--json`).

## Rules

1. **`cortex insight file <path>` (addendum §A5.1, design §5.6).** Returns the rich per-file entry (`insight.storage-format` §A4.2) for the given project-relative source path — the full L3 entry when one exists (`Purpose`, `Main players`, `Insights`, `File map` if present, `Connections`, `Query pointers`), or the lighter L2 entry (`Purpose`, `Connections` only) when the file was extracted at L2. The command resolves the path under either layout transparently: it checks `scope-registry.yaml` for a scoped module and locates the entry under the owning scope's `anatomy/`, or under top-level `anatomy/` for a flat module — the caller never needs to know or specify which.
2. **`cortex insight concept <name>` (addendum §A5.1, design §5.6).** Returns which files touch the named concept, how each implements it, and related concepts — sourced from the `concepts/` files and the `implements-concept`/`co-clustered` edges in the relevant `graph.json` (scope-local plus cross-scope, unified transparently). A concept name with no matching concept file or graph node returns an explicit "no such concept" result, never a silently empty success.
3. **`cortex insight element <query>` (addendum §A5.1, design §5.6).** Returns an atomic element (function, class, key constant) — matched against the `## Main players` sections that L3 extraction produces (`insight.storage-format` §A4.2) — with its description, its connections, and its follow-up query pointers. When the query matches no L3 main player, the command returns an explicit **"no rich entry"** result naming the file the element lives in (resolved via L1/L2 structural data), rather than an empty result or an error — the element remains discoverable through `cortex insight file <that-path>` even without its own rich entry.
4. **The scoped/flat difference is invisible to the caller (design §5.8).** All three subcommands accept the same arguments and produce the same response shape whether the underlying module is scoped or flat; the command layer is responsible for locating the right scope internally and unifying scope-local with cross-scope results where relevant (`concept` and `element` in particular may need to merge a scope-local `graph.json` with the cross-scope one).
5. **`--json` on every subcommand (addendum §A5.1).** All three subcommands accept `--json` and emit a stable, structured payload suitable for programmatic consumption; without the flag, each emits a human-readable rendering of the same underlying data — the two modes are never different queries, only different renderings of one result.
6. **Deterministic Core, no LLM at query time (RULES 3, addendum §A5.1).** Every subcommand is pure file I/O over the shapes `insight.storage-format` defines plus deterministic matching/lookup logic — no subcommand imports or calls an LLM SDK. The reasoning over what a query result *means* happens in the calling Claude Code session, not inside the CLI.
7. **Supersedes v2 verbs (design §5.6, addendum §A5.1).** `cortex insight query|get|neighbors|list` (schema §4.10.5) are retired in v3 and MUST NOT be exposed; `file`, `concept`, `element` are the complete v3 verb set. There is no `cortex insight ask` — an attempt to invoke it should fail as an unknown subcommand, not silently degrade to a different verb.
8. **Absent module returns an explicit miss, not an error crash (build-order-v3 spine convention).** When `.cortex/insight/` does not exist at all (extraction never ran), each subcommand returns an explicit "no insight data for this project" result rather than throwing.

## Acceptance Criteria

### `file` returns the rich L3 entry for a known path

- **Given** a flat-layout module with an L3 entry at `anatomy/src/auth/session.ts.md` for `src/auth/session.ts`
- **When** `cortex insight file src/auth/session.ts` runs
- **Then** the output includes the `Purpose`, `Main players`, `Insights`, and `Connections` content from that entry

### `file` returns the lighter L2 entry when that's all that exists

- **Given** a module with only an L2 entry (`extraction_level: 2`) for `src/utils/format-date.ts`, carrying `Purpose` and `Connections` only
- **When** `cortex insight file src/utils/format-date.ts` runs
- **Then** the output includes `Purpose` and `Connections` and does not error or fabricate a `Main players` section

### `file` resolves transparently across scoped and flat layouts

- **Given** two otherwise-identical fixture modules — one scoped (the entry for `src/auth/session.ts` living under `scopes/auth/anatomy/src/auth/session.ts.md`) and one flat (the same entry under top-level `anatomy/src/auth/session.ts.md`)
- **When** `cortex insight file src/auth/session.ts` runs against each
- **Then** both return the identical entry content, and the caller's invocation is identical in both cases

### `concept` returns touching files and related concepts

- **Given** a `concepts/authentication.md` file and a `graph.json` with an `implements-concept` edge from `file:src/auth/session.ts` to `concept:authentication`, and a `co-clustered` edge linking `concept:authentication` to `concept:authorization`
- **When** `cortex insight concept authentication` runs
- **Then** the output names `src/auth/session.ts` as a file touching the concept and lists `authorization` as a related concept

### `concept` reports an explicit miss for an unknown concept

- **Given** a module with no `concepts/permissions.md` file and no graph node for `concept:permissions`
- **When** `cortex insight concept permissions` runs
- **Then** the output explicitly states no such concept was found — it is not an empty success and not a crash

### `element` returns a main player with its connections

- **Given** an L3 entry for `src/auth/session.ts` whose `## Main players` names `validateToken` (lines 40–68) with a short description
- **When** `cortex insight element validateToken` runs
- **Then** the output includes `validateToken`'s description, its line range, and its connections/follow-up pointers

### `element` returns "no rich entry" for a non-main-player, still pointing at its file

- **Given** a function `formatTimestamp` that exists in `src/utils/format-date.ts` but was not named as a main player during L3 extraction
- **When** `cortex insight element formatTimestamp` runs
- **Then** the output explicitly states no rich entry exists for `formatTimestamp`, and names `src/utils/format-date.ts` as the file where it can be found via `cortex insight file`

### `--json` emits structured output equivalent to the default rendering

- **Given** the same fixture used in "`file` returns the rich L3 entry for a known path"
- **When** `cortex insight file src/auth/session.ts --json` runs
- **Then** the output is valid JSON containing the same `Purpose`/`Main players`/`Insights`/`Connections` content as fields, not prose text
- **And** running the same command without `--json` produces a human-readable rendering of that identical underlying data

### Query-time execution makes no LLM call

- **Given** any of the three subcommands run against a populated fixture module
- **When** the command executes
- **Then** no LLM SDK is imported or invoked by the command's code path — the result is produced entirely from files already on disk

### v2's retired verbs are not exposed

- **Given** the v3 `cortex insight` command
- **When** `cortex insight query`, `cortex insight get`, `cortex insight neighbors`, or `cortex insight list` is invoked
- **Then** each is rejected as an unknown subcommand — none silently maps to `file`, `concept`, or `element`

### `cortex insight ask` does not exist

- **Given** the v3 `cortex insight` command
- **When** `cortex insight ask "how does auth work here?"` is invoked
- **Then** it is rejected as an unknown subcommand — no subprocess-based natural-language answer is produced

### An absent insight module returns an explicit miss

- **Given** a project with no `.cortex/insight/` directory at all
- **When** `cortex insight file src/auth/session.ts` runs
- **Then** the output explicitly states there is no insight data for this project, rather than throwing an unhandled error

## Notes

- The exact text/formatting of each subcommand's human-readable payload is asserted by this spec's own tests, not by `insight.storage-format`'s validator (carried convention from schema §4.10.5) — the validator checks the shapes on disk; this spec checks what the CLI does with them.
- Merge behaviour for `concept`/`element` queries that span a scoped module's scope-local and cross-scope graphs (Rule 4) is asserted here at the acceptance-criteria level only for the single-scope case above; a criterion covering a concept split across two sibling scopes is deferred to the implementation pass as an open item, since exercising it needs a populated two-scope fixture this draft doesn't construct.
- Journey-layer tests are deferred pending the test-runner loop, per the project-wide convention established for the v2 insight specs.
