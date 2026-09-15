---
id: recall.why
status: implemented
depends_on:
  - recall.recall-index
  - schema.bears-on
  - hooks.search-annotate
governs:
  - "src/recall/cli.ts"
implements: ../../specs-business/scaffolding/assistant-reaches-for-cortex-instead-of-guessing.business.md
governed_by:
  - R-001
---

# `cortex why <ref>` and `cortex recall <query>` — the pull side of recall

## Intent

The pointer lines (`hooks.search-annotate`, `hooks.pre-read-writeback` Rule 6) end with
`more: cortex why <ref>`; this spec is what that promise resolves to. `cortex why` answers, for
one subject, the question the recall index was compiled to answer — what is decided about this,
what was measured, what is still open, what has been observed — as a short deterministic listing
of ids, dates, titles and paths. `cortex recall` is the same index searched by keyword when the
session has a word rather than a subject. Both are pull: nothing fires them, and `pulse.usage`
Rule 9 already counts their invocations so the day they are first used is recorded, not guessed.
Neither reads a rule body, a decision narrative or a thread body — they name the file and stop.

## Entities

- **READS:** `.cortex/recall-index.json` (schema §4.11) through `hooks.search-annotate` Rule 12's
  shared loader; `cortex-schema.md` heading lines when the ref is the schema document (Rule 3);
  the frontmatter `findings` of the evidence files a `why` listing names (Rule 4 — the one
  bounded exception to index-only, see Notes).
- **WRITES:** nothing. **CREATES:** nothing.

## Rules

1. **Grammar.** `cortex why <ref> [--json]` and `cortex recall <word…> [--kind decision|evidence|
   thread|observation]`. A missing `<ref>`, an empty `<word…>`, an unknown flag, or a `--kind`
   outside the enum prints a one-line usage to stderr and exits **2**. Flags may precede or
   follow their operands.

2. **Index required.** Both verbs read the index only (Rule 4 excepted). When `.cortex/` has no
   `recall-index.json` — or `.cortex/` is absent — they print `cortex <verb>: no recall index at
   .cortex/recall-index.json — run \`cortex scan\`.` to stderr and exit **1**. A malformed index
   is reported the same way with `malformed` in place of `no`.

3. **`why` — ref to subject.** `<ref>` is classified with `schema.bears-on`'s `classifyRef`
   (rule, bug, domain term, concept, clause, path, bare id). A path ref is normalised as the
   index normalises subject keys and expanded to the same candidate keys `hooks.search-annotate`
   Rule 5 derives (the path, its bounded parents, a spec id, a compass id, a domain term, a
   concept slug); the subject shown is the first candidate present in `subjects`, and the
   listing's first line names which key matched when it differs from the ref as typed. The
   schema document path (`cortex-schema.md`) is special: it aggregates every `schema:§…` subject
   into one listing headed `cortex-schema.md (all clauses)`. No candidate present → `Nothing
   bears on <ref>.` on stdout, exit **0** (the verb never checks whether the ref itself exists —
   that is `cortex validate`'s job).

4. **`why` — listing.** In this order, each section omitted when empty, every list in the
   index's own (sorted) order re-sorted by `date` descending:
   ```
   <matched key> (<kind>) — <n> decided · <n> evidence · <n> open · <n> observation themes
   Decided:
     <YYYY-MM-DD>  <id> — <title>  (<path>)
   Evidence:
     <YYYY-MM-DD>  <id> — <title>  (<path>)
       <metric>=<value>  <metric>=<value>  <metric>=<value>
   Open:
     <T-id>  <kind> — <key text>  (<path>)
   Observations: <theme>, <theme>
   ```
   The evidence sub-line carries the **first three** `findings` as `metric=value` (a `unit`, when
   present, follows the value after one space: `insight.file=6 invocations`), read from that
   evidence file's frontmatter — the only file read outside
   the index, bounded by the number of evidence entries listed, never a directory scan; an
   unreadable file renders the sub-line as `(findings unreadable)`. The thread `<kind>` and key
   text come from the index entry (`title`), never from the thread file. Ids are never cut.

5. **`why --json`.** Emits `{ "ref": <as typed>, "key": <matched key or null>, "subject":
   { decided, evidence, threads, observations }, "entries": { <id>: <entry> } }` verbatim from
   the index for the ids the subject names (observation themes map to `observation.<theme>`),
   plus `"findings": { <evidence id>: [ … ] }` for the Rule 4 findings. Two-space indentation, a
   trailing newline, sorted keys. `Nothing bears on` in JSON is `"key": null` with empty lists,
   exit 0.

6. **`recall` — keyword listing.** Tokens are `hooks.search-annotate` Rule 4's (lowercase, ≥3
   chars, stop-list removed, ref-shaped spans verbatim) over the joined `<word…>`. Entries
   qualify by that spec's Rule 6 (two distinct hits, or one ref-shaped hit) and rank by hits
   descending, `date` descending, id ascending. The **top five** print one per line:
   `<kind> <YYYY-MM-DD> <id> — <title> (<path>)`. `--kind` filters before ranking. No qualifying
   entry → `No matches.` on stdout, exit **0**.

7. **Deterministic Core** (R-001): index read, string matching, sorting, one frontmatter parse
   per listed evidence file. No LLM, no network, no subprocess; two runs over the same index
   print the same bytes.

## Acceptance Criteria

### why lists all four sections in order

- **Given** an index where `subjects["R-001"]` has `decided:
  ["decision.2026-07-07-five-module-architecture"]`, `evidence: ["evidence.2026-09-15-usage"]`,
  `threads: ["T-004"]`, `observations: ["working-style"]`, and an evidence file whose first
  three `findings` are `searches.knowledge=54`, `searches.machinery=48`, `searches.document=135`
- **When** `cortex why R-001` runs
- **Then** stdout begins `R-001 (rule) — 1 decided · 1 evidence · 1 open · 1 observation
  themes`, carries `Decided:`, `Evidence:`, `Open:`, `Observations: working-style` in that order,
  the evidence sub-line reads `searches.knowledge=54  searches.machinery=48
  searches.document=135`, and the exit code is 0

### A path ref resolves through its spec id

- **Given** `subjects["pulse.usage"]` present and no path-keyed subject for the spec file
- **When** `cortex why .specflow/specs/pulse/usage.spec.md` runs
- **Then** the first line names `pulse.usage` as the matched key and the listing is that
  subject's

### The schema document aggregates its clauses

- **Given** `subjects["schema:§5"].evidence` and `subjects["schema:§4.11"].decided` both
  non-empty
- **When** `cortex why cortex-schema.md` runs
- **Then** the heading is `cortex-schema.md (all clauses)` and both the evidence and the
  decision appear once

### Nothing bears on an unknown subject

- **Given** an index with no subject `R-999`
- **When** `cortex why R-999` runs
- **Then** stdout is `Nothing bears on R-999.` and the exit code is 0

### --json is the subject block plus its entries

- **Given** the `R-001` subject from the first criterion
- **When** `cortex why R-001 --json` runs
- **Then** stdout parses to an object with `key: "R-001"`, `subject.decided` equal to the
  index's list, `entries` holding exactly the four named ids (the observation as
  `observation.working-style`), and `findings["evidence.2026-09-15-usage"]` with three items

### recall ranks by hits then date and caps at five

- **Given** seven entries whose keywords each contain `usage` and `sessions`, with distinct
  dates, and one entry with only `usage`
- **When** `cortex recall usage sessions` runs
- **Then** exactly five lines print, newest first, and the single-hit entry is absent

### recall filters by kind and honours a ref-shaped token

- **Given** `entries["evidence.2026-09-15-usage"].keywords` containing `schema:§5` and
  `entries["decision.2026-08-05-x"].keywords` containing `schema:§5`
- **When** `cortex recall schema:§5 --kind evidence` runs
- **Then** the one line printed is `evidence 2026-09-15 evidence.2026-09-15-usage — … (…)`

### No matches is exit 0

- **Given** any index
- **When** `cortex recall zxqv plork` runs
- **Then** stdout is `No matches.` and the exit code is 0

### A missing index is exit 1 with the scan hint

- **Given** an initialised project whose `recall-index.json` was deleted
- **When** `cortex why R-001` and `cortex recall usage` run
- **Then** each exits 1 and stderr names `.cortex/recall-index.json` and `cortex scan`

### Bad grammar is exit 2

- **Given** any project
- **When** `cortex why`, `cortex recall`, `cortex recall x --kind rumour` and
  `cortex why R-001 --verbose` run
- **Then** each exits 2 with a usage line on stderr and nothing on stdout

### The verbs are counted the day they ship

- **Given** a transcript fixture with Bash calls `cortex why R-001` and `cortex recall usage`
- **When** `cortex usage` runs
- **Then** the report shows `why` 1 and `recall` 1 under the recall figure (`pulse.usage`
  Rule 9, unchanged)

## Notes

- **Why findings are read from the file.** `why` exists to answer "what is the number behind
  this?", and the index deliberately carries no findings (`recall.recall-index` Rule 8: names,
  never content). Reading three typed findings from the frontmatter of the files the index already
  named is bounded, deterministic and human-invoked — it is not the hook path, where the index-only
  rule is absolute. This is the one exception and it is confined to Rule 4.
- **Why no `--json` on `recall`.** Nothing consumes it yet; adding flags nobody asked for is how
  verbs grow grammar that `pulse.usage` Rule 9 then cannot break down. When a consumer appears it
  is one rule here.
- **Why the verb does not validate the ref.** `cortex why R-999` saying "Nothing bears on" is
  true; saying "R-999 does not exist" would need the project index and would make a read-only
  verb slower than the hook it backs. `cortex validate` owns existence.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention).
