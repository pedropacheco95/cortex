---
id: insight.cli
status: implemented
depends_on:
  - insight.module-contract
implements: ../../specs-business/insight/assistant-has-project-knowledge-when-working.business.md
governed_by:
  - R-001
governs:
  - "src/insight/cli.ts"
  - "src/insight/query.ts"
---

# Insight Query CLI

## Intent

The four `cortex insight` commands are the single query surface both Claude and humans use to pull from the ungated layer (schema §4.10.5, v2 design §7.1): `query <topic>` (lexical search across prose, tags, and cluster labels), `get <file>` (a `map/`-relative file verbatim), `neighbors <node-id>` (graph traversal with `--kind`/`--depth`), and `list` (every insight file and cluster). Every command is deterministic Core with `--json`. Built deliberately **before** the producer loops (consumers-before-producers, v2 design §13): the CLI is testable against hand-authored `map/` fixtures and becomes the verification surface the loops use. Query spends no LLM at query time — the judgment was spent at write time turning meaning into tags — so a miss is an honest miss, not a reason to add semantic search (R-001; schema §4.10.5).

## Entities

- **READS:** `insight/map/*.md` (prose files and their H2 headings/content); `insight/map/graph.json`, `tags.json`, `clusters.json`. Nothing outside `insight/map/`.
- **WRITES:** nothing — the CLI is strictly read-only over the module.
- **CREATES:** nothing on disk; stdout only (a human table by default, the structured object under `--json`).

## Rules

1. **Commands (schema §4.10.5).** `cortex insight query <topic>`, `cortex insight get <file>`, `cortex insight neighbors <node-id>`, `cortex insight list` — all support `--json`. Exit codes: 0 on success (including an honest empty result); 1 on an unknown file (`get`), an unknown node-id (`neighbors`), or a malformed `map/` artefact.
2. **`query` is lexical and grouped.** `query <topic>` matches the topic case-insensitively against prose file names and section content, node tags (`tags.json`), and cluster labels (`clusters.json`), and returns grouped output — matching prose sections, matching nodes (by tag), matching clusters. No LLM, no ranking model, no embeddings; a topic that matches nothing returns an empty grouped result and exit 0.
3. **`get` returns verbatim.** `get <file>` takes a `map/`-relative name (e.g. `setup.md`, `graph.json`) and returns its contents verbatim; an unknown name is exit 1 naming the file. It never reformats prose or re-serializes JSON.
4. **`neighbors` walks the graph.** `neighbors <node-id>` returns the subgraph reachable from the node, with each edge's `confidence` and `rationale`. `--kind <edge-kind>` filters to one of the closed `graph.json` edge kinds; `--depth <n>` (default 1) bounds the walk. An unknown node-id is exit 1; a node with no matching edges returns the node alone (honest empty neighborhood), exit 0.
5. **`list` enumerates everything.** `list` names all `map/*.md` prose files and all clusters from `clusters.json` (the orientation command `insight/_index.md` points at). This is the command `insight.module-contract`'s scaffolding is verified through before the validator checks land.
6. **`--json` is stable.** Each command's `--json` emits a stable, deterministically-ordered structured object; identical `map/` input + identical arguments → byte-identical `--json` output (the payload text is asserted by this spec's tests, not by the validator — schema §4.10.5).
7. **Deterministic Core** (R-001): no LLM at query time, no network, no subprocess, no writes.

## Acceptance Criteria

### query returns grouped hits across both content types

- **Given** a fixture `map/` with `setup.md` containing an H2 "## Authentication", `tags.json` tagging `spec:insight.cli` with `["authentication"]`, and `clusters.json` with `cluster:authentication`
- **When** `cortex insight query authentication` runs
- **Then** the grouped output contains the `setup.md` "## Authentication" section, the node `spec:insight.cli` (matched by tag), and `cluster:authentication`

### query miss is honest and exits 0

- **Given** the same fixture
- **When** `cortex insight query nonexistent-concept` runs
- **Then** the output is an empty grouped result and the exit code is 0 (a miss is a miss, not an error)

### get returns a file verbatim

- **Given** `map/graph.json` in the fixture
- **When** `cortex insight get graph.json` runs
- **Then** stdout is the file's bytes verbatim, and `cortex insight get missing.md` exits 1 naming `missing.md`

### neighbors walks by kind to a bounded depth

- **Given** `graph.json` with edges `spec:insight.cli --semantically-related-> anatomy:src/insight/query.ts` and `anatomy:src/insight/query.ts --mentions-same-entity-> spec:insight.module-contract`
- **When** `cortex insight neighbors spec:insight.cli --kind semantically-related --depth 1` runs
- **Then** the subgraph contains `anatomy:src/insight/query.ts` with the edge's `confidence` and `rationale`, and not `spec:insight.module-contract` (depth 1, wrong kind at hop 2)
- **And** `--depth 2` without `--kind` reaches `spec:insight.module-contract`

### neighbors on an unknown node errors

- **When** `cortex insight neighbors spec:does-not-exist` runs
- **Then** exit code 1 naming the unknown node-id, and no output subgraph

### list enumerates prose files and clusters

- **Given** the fixture with `setup.md`, `testing.md`, and `clusters.json` holding `cluster:authentication` and `cluster:pulse-gate`
- **When** `cortex insight list` runs
- **Then** the output names `setup.md`, `testing.md`, `cluster:authentication`, and `cluster:pulse-gate`

### --json is deterministic

- **Given** an unchanged fixture `map/`
- **When** `cortex insight query authentication --json` runs twice
- **Then** the two outputs are byte-identical

## Notes

- Consumers-before-producers is deliberate (v2 design §13): this CLI is verifiable against hand-authored fixtures and is what the two loops verify their writes through, so it lands before either producer.
- Query is pull-only, never a hook-injection mechanism (schema §4.10.5, §5, v2 design §7.4): insight is surfaced when the scaffolding (CLAUDE.md protocol, `insight/_index.md`, skill steps) says the question warrants it.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention, established in the hooks round).
