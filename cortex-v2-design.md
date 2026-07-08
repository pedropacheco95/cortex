# Cortex v2 — Design Document

**Status:** Design phase. No code written, no schema edits, no specs. Pending review by Pedro.
**Author:** Pedro Pacheco (Sucesso Fractal), in collaboration with Claude.
**Date:** 6 July 2026.
**Document purpose:** Capture the v2 design decisions — the `insight` module (the ungated, queryable project-knowledge layer), its two producer loops, the promotion pipeline into the gated layers, the constellation insight preset, and the `.specflow/` reorganization. This is a **separate document** from `cortex-design.md`, which stays as the shipped record of v1.0. Section references of the form "v1 §N" point into `cortex-design.md`; "schema §N" points into `cortex-schema.md` v1.0. Schema v2.0 is drafted after this document is reviewed and signed off — §11 below names every schema clause v2 changes.

A note on the word "v2": v1 §4.4 used "deferred to v2" loosely, meaning "post-v1". This document defines what v2 actually is; the §4.4 items are dispositioned in §12 below (none of them are in this round).

---

## 1. Problem statement

v1.0's defining property is that **every durable claim in the knowledge layer passed through a human review gate**. Cerebrum rules, atlas decisions, spec content — all of it was either written under direct human review or proposed by a loop into `.cortex/pulse/` and accepted via `cortex pulse-accept`. That property is what makes the citation graph trustworthy and what earns cerebrum its write-time enforcement authority (v1 §5.3).

The same property creates a systematic gap. Three kinds of knowledge have nowhere to live:

1. **Inferred structure.** The curated citation graph records what humans asserted (this rule derives from that decision; this spec governs those files). It does not record what a competent reader would *infer* — that two files are about the same concept, that a cluster of artefacts forms a domain, that a spec and an atlas decision mention the same entity without citing each other. v1 §7.3 deliberately kept this out of anatomy ("confidence-tagged edges belong to LLM-extracted concept graphs, which Cortex's anatomy is not") — correctly, but the concept graph itself was never built anywhere.

2. **Observed-but-unreviewed context.** Sessions constantly surface project knowledge that never lands: the user explains a setup quirk once, Claude burns tokens re-deriving something that should have been written down, a correction gets made in conversation and evaporates. Distil (v1 §10.3) catches the subset that *repeats* (threshold N=3) and routes it through the gate — deliberately conservative, deliberately slow. Everything below the threshold, and everything that needs to be useful *tomorrow* rather than after three recurrences and a weekly cadence and a review, is lost.

3. **Knowledge in transit.** Even content that clearly belongs in cerebrum or atlas needs somewhere to live *before* it has earned the gate — a staging layer where it can stabilize, be corrected, and accumulate evidence, so that what eventually reaches the human for review is mature rather than speculative.

v2 adds one module — `.cortex/insight/` — to hold all three, two loops to produce it, a CLI to query it, a promotion pipeline (through the existing pulse gate) to graduate it, and a constellation preset to see it. In the same round, v2 moves the two spec trees under `.specflow/` (§9) — a breaking path change that rides the MAJOR schema bump insight forces anyway.

---

## 2. The two-layer thesis: gated and ungated

v2 rests on one distinction, and it must be stated precisely because the imprecise version leads to the wrong architecture:

**The distinction is gated vs ungated — NOT human-written vs machine-written.**

Nearly all v1.0 content was authored by Claude Code. What makes cerebrum, atlas, and the spec trees trustworthy is not authorship; it is that every claim passed through a human review gate before becoming durable — written under review, or accepted via `cortex pulse-accept`. The gate is the load-bearing property. Authorship is incidental.

Insight is the complementary layer: content that is **inferred or ungated** — produced autonomously, useful immediately, never having passed review. The two layers are complementary, not competitive:

| | Gated (v1.0: cerebrum, atlas, specs) | Ungated (v2: insight) |
|---|---|---|
| Trust source | Human review gate | Producer discipline + traceability |
| Write path | Under review, or pulse-accept | Autonomous (two loops, humans) |
| Enforcement authority | Yes (PreWrite reads cerebrum) | **No — never** (§10) |
| Freshness | As fresh as review bandwidth | As fresh as the loops' cadence |
| Failure mode | Stale, incomplete | Occasionally wrong |
| Correction path | Bug ledger, pulse proposals | Direct edit by the gaps loop or a human |
| Terminal state | Durable | Durable, or promoted through the gate (§3.7) |

Each layer covers the other's failure mode. The gated layer is *right but slow*; the ungated layer is *fast but fallible*. A claim that stabilizes in insight and proves load-bearing graduates through the pulse gate into the gated layer (§3.7) — insight is, among other things, where content lives before it earns the gate.

The consequence that shapes everything downstream: because insight never carries enforcement authority and never claims review, its producers may write it directly — the propose-don't-mutate discipline (v1 §11.3) exists to protect the *gate*, and insight has no gate to protect. §4.4 restates the loop write rule in these terms.

---

## 3. The insight module

### 3.1 Purpose and placement

`.cortex/insight/` — the queryable project-knowledge layer holding inferred and ungated content. Fourth durable module, sibling to anatomy, cerebrum, and atlas (v1's "three durable modules plus one transient" becomes four plus one). It answers two question families the v1 modules can't:

- **"What is this project about, conceptually?"** — the inferred concept map: which artefacts relate, what the domain clusters are, what concepts each node carries. (Anatomy answers *what each file is*; insight answers *how it all hangs together semantically*.)
- **"What has been observed about working here that nobody reviewed yet?"** — setup quirks, testing gotchas, deploy steps, conventions-in-formation, corrections captured from sessions.

### 3.2 Structure and storage

**`insight/map/` is the single storage location. Flat directory. Two content types side by side, distinguished by extension:**

```
insight/
├── _index.md                 active prompt (§7.3), same convention as every module
└── map/
    ├── setup.md              ┐ prose: human-authored or gaps-loop-authored/updated
    ├── testing.md            │ extensible — new files as categories surface
    ├── deploy.md             │
    ├── conventions.md        ┘
    ├── graph.json            ┐ inferred: concept nodes + typed, confidence-carrying edges
    ├── tags.json             │ per-node tag sets
    └── clusters.json         ┘ cluster memberships — regenerated by the refresh loop, never hand-edited
```

**Rationale for one flat directory with extension as the type discriminator:** the two content types have exactly opposite ownership (prose: humans + gaps loop; JSON: refresh loop only) but exactly one audience surface — `cortex insight query` searches both, `cortex insight list` enumerates both. Splitting them into subdirectories would encode the producer split into the consumer's navigation, which is the wrong axis: consumers care about *topic*, not *producer*. The extension already carries the ownership rule unambiguously (`.md` = gaps loop / human; `.json` = refresh loop), so a directory split would duplicate information the filename carries.

**Prose file contract (schema v2 fixes the details):** minimal frontmatter — `kind: insight-prose`, `updated` (iso-datetime). Body is free markdown organized by headings. Entries appended by the gaps loop carry a one-line provenance trailer (date, signal type, source session ids). Corrections to existing content are recorded in a `## Corrections` log at the bottom of the file (recommended over frontmatter — see open question 6, §15).

**Inferred file contracts (sketch; schema v2 locks them):**

```jsonc
// graph.json
{ "schemaVersion": "2.0", "generated": "<iso>", "rebuild": "full|incremental",
  "nodes": [{ "id": "anatomy:src/cli/init.ts", "module": "anatomy", "label": "init.ts" }],
  "edges": [{ "from": "<node-id>", "to": "<node-id>",
              "kind": "semantically-related|same-cluster|mentions-same-entity",
              "confidence": "high|medium|low", "rationale": "<one line>" }] }
// tags.json
{ "schemaVersion": "2.0", "generated": "<iso>",
  "tags": { "<node-id>": ["authentication", "JWT", "session-management"] } }
// clusters.json
{ "schemaVersion": "2.0", "generated": "<iso>",
  "clusters": [{ "id": "cluster:<label-slug>", "label": "Authentication",
                 "members": ["<node-id>", "…"], "rationale": "<one line>" }] }
```

Serialization is deterministic (stable sort, single `generated` timestamp, no per-entry timestamps) — the same discipline as `constellation.json` (schema §4.9) — to keep committed diffs reviewable (§3.3).

### 3.3 Git policy: committed, not gitignored

Insight is **NOT gitignored**. All of `insight/` is committed as durable content.

This deliberately breaks v1's git-policy diagonal. Schema Decision 1 split the world into *human-gated → committed* (cerebrum, atlas) and *machine-regenerable → gitignored* (anatomy, constellation.json, pulse). Insight occupies the quadrant v1 didn't have: **machine-owned and committed.** The rationale:

- The prose files are durable observations a collaborator (or a fresh clone, or a CI loop) should inherit — losing them on clone would recreate exactly the cold-start problem insight exists to solve.
- The inferred JSON is regenerable in principle but expensive and non-deterministic to regenerate (it embodies LLM judgment); committing it makes the concept map a shared artefact rather than a per-machine one, and makes its evolution reviewable in history.

The cost is diff noise from the weekly rebuild. Two mitigations are design requirements on the refresh loop: deterministic serialization (§3.2), and **carry-over on re-derivation** — when a full rebuild re-derives an edge/tag/cluster whose identity matches an existing entry, the existing `rationale` and `confidence` text is preserved verbatim rather than re-generated, so only genuinely new or changed inferences produce diff lines. Whether this is sufficient is open question 4 (§15).

### 3.4 The concept map content

- **Nodes: files, modules, spec entities, cerebrum concepts, atlas decisions — the same node set as the constellation.** Node ids use the constellation node-id grammar (schema §4.9: `anatomy:<relpath>`, `rule:R-NNN`, `spec:<dev-id>`, `atlas:<artefact-id>`, …). Rationale: the constellation compiler already solves node identity over exactly this artefact set; reusing its grammar gives node-id stability for free wherever the underlying artefact is stable, and makes the constellation overlay (§8) a trivial join instead of a mapping layer. (Cluster-id stability is the one genuinely new identity problem — open question 1, §15.)
- **Inferred edges with types** — `semantically-related`, `same-cluster`, `mentions-same-entity` (a closed enum at schema time; extending it is a MINOR bump). **Each edge carries a confidence (`high|medium|low`) and a one-line rationale.** These are structurally distinct from curated citation edges: a citation edge exists because a human-gated frontmatter field asserts it; an inferred edge exists because the refresh loop's judgment proposed it. The two never mix in one file — curated edges live in `constellation.json`, inferred edges in `insight/map/graph.json`. Note the edge-confidence enum is deliberately *not* v1's `STATED|EXTRACTED|INFERRED` provenance enum (schema Decision 7): every inferred edge is by definition inferred; what varies is the strength of the inference.
- **Node tags** — structured concept labels per node (e.g. `["authentication", "JWT", "session-management"]`). Tags are what make query-time behaviour deterministic (§3.6): the LLM judgment is spent once, at write time, turning meaning into labels; query time is pure label matching.
- **Cluster assignments** — nodes grouped into inferred domain clusters with labels and rationales.
- **NO embeddings.** Everything in the map is explainable (each edge names its rationale) and stable across LLM model changes (a model swap may produce different *new* inferences, but never silently re-ranks or invalidates existing content the way re-embedding does). This also keeps Cortex Core untouched by vector infrastructure — Core stays deterministic file I/O (v1 §3.1). Note the continuity with v1 §7.3: v1 rejected Leiden clustering and confidence-tagged edges *for anatomy* on the grounds that they belong to LLM-extracted concept graphs. Insight **is** that concept graph — built where §7.3 said such content belongs, with anatomy staying the flat per-file index it always was. v2 vindicates that boundary rather than reversing it.

### 3.5 Query mechanism

Hybrid concept graph + tags + clusters, all composable:

- **Tag queries return node sets** — "which nodes carry `authentication`?"
- **Edge traversals return subgraphs** — "what is semantically related to this file, one hop out?"
- **Cluster queries return cluster membership** — "what's in the auth cluster?"

Query execution is **deterministic Core** — lexical matching over tags, labels, cluster names, and prose headings/content. No LLM at query time (the judgment was spent at write time producing the tags), no ranking model, no embeddings. A query that misses because nothing was tagged with that concept is an honest miss — and a signal to the refresh loop's next pass, not a reason to add semantic search. The CLI surface is §7.1.

### 3.6 Producers

Exactly three writers, with non-overlapping write targets — detailed in §4. Summary:

| Producer | Writes | Never touches |
|---|---|---|
| `cortex-loop-insight-refresh` | `map/*.json` only | prose `.md`; anything gated |
| `cortex-loop-insight-gaps` | `map/*.md` only (plus the `insight/_index.md` file list, §4.2) | `.json`; anything gated (proposes via pulse instead) |
| Humans | prose `.md` | `.json` (hand edits would be overwritten by the next refresh) |

### 3.7 The promotion pipeline

When the gaps loop identifies insight content that has **stabilized** and is **load-bearing** — content that belongs in a gated layer (`cerebrum/environment.md`, `cerebrum/rules/`, `atlas/decisions/`, or `RULES.md`) — it produces a pulse suggestion through the **existing** pulse gate (schema §4.5): S-namespace id from the shared counter, provenance pointing at the insight file and the sessions behind it, proposed text, target path in the gated layer.

The user reviews via `cortex pulse-accept`. On accept:

1. The content lands in the gated target, carrying a `source:` reference back to the insight file it graduated from (the citation graph records the lineage).
2. The insight-side original is **marked promoted** (an annotation naming the S-id and the gated destination), not silently deleted — deletion of the now-redundant insight copy is the human's call, typically at accept time. Marking rather than deleting keeps the accept operation append-plus-annotate (auditable) instead of destructive.

Rationale for reusing the pulse gate rather than building a promotion-specific mechanism: the gate is the single point where ungated content becomes gated (v1 §10, §11.5), and its whole apparatus — S-namespace, dismissed-memory, provenance-mandatory sections, review CLI — is exactly what promotion needs. A second gate would split the user's review queue for no benefit.

**No automatic promotion, ever** — however stable the content looks (§10). What "stabilized" means mechanically is open question 3 (§15).

---

## 4. The two producer loops

Both are Cortex loops in the v1 §11 family (loops fourteen and fifteen; scheduled tasks thirteen and fourteen), both follow the deterministic-bookends idiom that distil established (v1 §16.2 item 18: Core `--collect`, judgment in-session, Core `--apply`/`--propose`), and both are manually invokable like every other loop.

### 4.1 `cortex-loop-insight-refresh` — the inferred-map maintainer

- **Writes:** `insight/map/graph.json`, `tags.json`, `clusters.json` — **only**. Never touches prose. Never touches gated content.
- **Cadence:** weekly full rebuild + incremental daily on file changes flagged by anatomy-refresh-fast. Registered as **one** daily Desktop scheduled task; the `--collect` bookend decides full vs incremental (full when ≥7 days since the last full rebuild, incremental otherwise) — one task, not two, because the full/incremental split is a property of the run, not of the schedule.
- **Shape:** `cortex loop-insight-refresh --collect` assembles the node set (via the constellation compiler's node-emission path — same code, same ids) and, for incremental runs, the changed subset; the change signal is the refresh loop's **own watermark** (last-refresh timestamp compared against anatomy `last_seen`/`sha256`), deliberately *not* the `needs_purpose_refresh` flag — that flag is owned and cleared by anatomy-refresh-deep (v1 §7.2), and sharing it would couple two loops' correctness. The in-session judgment derives tags, edges (with confidence + rationale), and clusters. `--apply` validates shape, applies the carry-over rule (§3.3), sorts deterministically, and writes the three files atomically.
- **Family conformance:** this is the anatomy-loop pattern — v1 §11.4's conventions note already recognises loops that "maintain machine-owned regenerable state directly and propose nothing." The refresh loop is that class, pointed at insight's machine-owned files.

### 4.2 `cortex-loop-insight-gaps` — the session-observation capturer

- **Writes:** `insight/map/*.md` — **only** — plus pulse suggestions for anything gated. Never touches JSON. Never modifies gated content directly. Additionally maintains the file list in `insight/_index.md` when it creates a new prose file (bounded, mechanical: add one line under "What's here"), so the active prompt never lags the directory — flagged for confirmation as open question 2 (§15).
- **Cadence:** daily Desktop scheduled task. Analyzes the previous 24 hours of this project's session transcripts via the shared session-reading layer (v1 §10.7 resolution, §11.5) — window mechanics under catch-up semantics are open question 5 (§15).
- **Shape:** `--collect` gathers the transcript corpus (distil's corpus machinery, daily window); the in-session judgment classifies against the five signals (§5); the deterministic close writes prose appends (signals 1–3, 4-in-insight) and routes gated-layer material (signals 4-in-gated, 5) through `--propose` into §4.5 proposal sections with S-ids from the shared counter.
- **File creation discipline:** before creating a new prose file for a new category, the loop MUST read the existing `map/*.md` list and `insight/_index.md` and prefer appending to an existing file over creating a near-duplicate (`setup.md` vs `environment-setup.md` fragmentation). Naming authority is open question 2 (§15).

### 4.3 The coordination rule: non-overlapping write targets

**This is the coordination rule between the two loops, and it is load-bearing: the refresh loop writes only `.json`; the gaps loop writes only `.md`. The write-target sets are disjoint by file extension.**

Consequences worth naming:

- **No lock files needed between the two insight loops.** v1 shipped no loop-concurrency locking (post-v1 considerations; v1 §17 item 17) and accepted last-writer-wins on transient reports. Insight files are *not* transient, so that acceptance wouldn't transfer — but disjoint write targets make the question moot between these two producers. A same-loop double-fire remains the v1-accepted residual risk.
- **Human edits are safe on exactly one side.** A human edit to prose coexists with the gaps loop (append-oriented, reads before writing). A human edit to JSON is overwritten by the next refresh — which is why §3.2 marks the JSON never-hand-edited.
- The rule is enforceable mechanically: schema v2's `check.insight-layout` can assert file-type ownership shape, and each loop's `--apply` bookend refuses out-of-lane paths (defence in depth inside Core, not just skill instructions).

### 4.4 Loop-family conformance, and restating propose-don't-mutate

v1 §11.3 property 2 says a Cortex loop "writes only to `.cortex/pulse/`", with the test-runner as "the sole exception" — and by §16.2 item 26 the bug-triage loop had already become a second exception. The gaps loop would be a third, the refresh loop arguably a fourth. A rule accumulating principled exceptions is a rule stated at the wrong altitude.

**v2 restates the invariant at the altitude it always meant:**

> **A loop never mutates gated content.** Cerebrum, atlas, `RULES.md`, and both spec trees change only through the human gate (pulse-accept) or under direct human review. Machine-owned ungated state — anatomy, insight `map/*.json` — is maintained directly by its designated owner loop. Ungated observational content — insight `map/*.md` — is written directly by its designated producer (the gaps loop), with provenance. Everything else a loop wants changed is a pulse proposal.

The test-runner (code, via writer/verifier + branch + PR) and bug-triage (fill-only classification frontmatter) keep their narrow, principled, reported exceptions exactly as v1 documented them. This restatement is flagged as F1/F6 in §14 because it amends v1 §11.3's wording and resolves an existing v1 internal tension.

---

## 5. The five gap signals

The gaps loop classifies session-transcript evidence against exactly five signals. Like the seven-type bug taxonomy (v1 §2), the set is closed with an explicit escape: evidence matching none of the five is reported in the loop's pulse report and produces no write.

| # | Signal | Definition | Action |
|---|---|---|---|
| 1 | **Investigation load** | Claude spent significant tokens answering something project context should have made obvious. | **Autonomous:** append the answer to the appropriate `insight/map/` prose file (create the file if the category is new, per §4.2 discipline). |
| 2 | **Misjudgment** | Claude proposed X, the user corrected to Y, and Y wasn't previously in any persistent layer. | **Autonomous:** append Y (with the correction context) to the appropriate prose file. |
| 3 | **User explanations** | The user explicitly explained project setup, conventions, or context not currently in persistent knowledge. | **Autonomous:** append to the appropriate prose file. |
| 4 | **Corrections to existing knowledge** | The user explicitly contradicted content Claude referenced from insight, cerebrum, atlas, or `RULES.md` — signals like "that's wrong," "that's not what we do," or Claude quoting a rule the user then treated as inoperative. | **Split by where the corrected content lives** (below). |
| 5 | **Memory-commit requests** | The user explicitly asked for something to be remembered — "commit this to memory," "this should be a rule," "remember this for next time." | **Gated:** pulse suggestion of type `user-directed-capture` (below). |

**Signal 4, corrected content in `insight/map/`:** the gaps loop updates the insight file **directly** — insight is ungated; keeping known-wrong content queryable pending a review nobody asked for would be the worst of both layers. Traceability is mandatory: the file's `## Corrections` log (or frontmatter — open question 6) records the original assertion, the user's correction, and the session context. Whether the contradicted text is rewritten in place or annotated-and-superseded is open question 7 (§15).

**Signal 4, corrected content in cerebrum, atlas, or `RULES.md`:** the loop **never touches the gated layer**. It surfaces a pulse suggestion of type `gated-layer-update` carrying: the affected file, the current content, the correction, and the session context. The user reviews via `cortex pulse-accept`. Note this is the suggestion type that makes **edit-typed proposals** load-bearing — v1's accept only appends (a recorded post-v1 consideration); a correction to an existing rule is an edit, so schema v2 must ship the edit-typed proposal mechanism (§11, flag F3).

**Signal 5:** a pulse suggestion of type `user-directed-capture` with **the user's own words as the proposed content**, plus the loop's best guess at the landing layer (insight, cerebrum, atlas, or `RULES.md`) as an explicit, human-editable field. The user reviews and directs the landing. Rationale for gating even the insight-landing case: the user said "remember this" — an explicit request deserves explicit confirmation of *where* it landed, and the landing layer is a judgment the user may want to override (what the loop reads as an insight note the user may know is a hard rule).

The asymmetry across signals is the design: **signals 1–3 are the loop's own observations landing in the loop's own ungated layer (autonomous); signals 4-gated and 5 touch the gate (proposals).** Suggestion IDs for the gated paths come from the existing S-namespace counter (schema §4.5) — one review queue, one dismissed-memory, no new gate.

---

## 6. Coordination with distil

Distil (v1 §10.3) already extracts patterns from sessions for cerebrum. The gaps loop also reads sessions and can also produce cerebrum-targeted suggestions (signal 5, promotion). Without a boundary they would double-propose. The boundary:

**Memory-commit is user-directed and explicit; distil is loop-inferred and pattern-based. Signal 5 fires when the user *names* the thing to remember; distil fires when a pattern *repeats unnamed*.** Complementary by construction:

| | `cortex-loop-insight-gaps` | `cortex-pulse-distil` |
|---|---|---|
| Evidence unit | Single explicit event (a correction, an explanation, a "remember this") | Repetition (≥ `distilThresholdN`, default 3, across sessions) |
| Cadence / window | Daily / previous 24h | Weekly / since last run |
| Default destination | `insight/map/` prose (ungated) | Cerebrum via the pulse gate |
| Gated proposals | Signals 4-gated and 5 only | All of its output |

Three mechanisms prevent duplicate work:

1. **Signal ownership.** An explicit memory-commit is signal-5 territory; distil's judgment step is amended (in the v2 skill update) to *skip* utterances that are explicit memory-commit requests — the gaps loop already routed them, same-day, with the user's own words.
2. **The shared S-namespace and dismissed-memory.** Both loops allocate from `pulse/.suggestion-counter` and both respect `dismissed.md` (v1 §11.5) — a proposal the user rejected from either loop is suppressed for both within the window.
3. **Distil's already-covered filter extends to insight.** v1's filter checks whether a candidate is already covered by cerebrum content; v2 extends the check to `insight/map/` prose. A pattern already captured in insight is not proposed as fresh cerebrum text — it is proposed as a **promotion** of the existing insight content (§3.7), referencing the insight file. This is also the natural graduation path working as intended: the gaps loop captures an explanation once (day 1, insight); the user repeats it across weeks; distil detects the repetition and — finding it already in insight — proposes promotion rather than duplication. Repetition-detected-by-distil is one concrete reading of "stabilized" (open question 3).

---

## 7. The query interface

### 7.1 CLI foundation (minimum viable surface)

Both Claude and humans use the same CLI. All commands are deterministic Core (§3.5), all support `--json` for machine consumption:

- **`cortex insight query <topic>`** — searches prose files and graph content for the topic: matching prose files/sections, nodes whose tags match, clusters whose labels match. Grouped output.
- **`cortex insight get <file>`** — returns a specific insight file (prose or JSON) by `map/`-relative name.
- **`cortex insight neighbors <node-id>`** — graph traversal from a node; `--kind <edge-kind>` filters by edge type, `--depth <n>` (default 1) bounds the walk. Returns the subgraph with confidences and rationales.
- **`cortex insight list`** — enumerates all insight files and graph clusters (the orientation command `_index.md` points at).

Composability comes from the shared node-id grammar: a `query` hit's node ids feed `neighbors`; a cluster from `list` feeds membership lookups. This is deliberately a small surface — the v1 CLI discipline (v1 §15) was ~15 commands doing exactly what the schema needs; insight adds four.

### 7.2 Skill-level integration (workflow surface — separate follow-up pass)

Consistent with v1 §6.1 mechanism 3 (skills must explicitly read the knowledge layer; spontaneous discovery is not assumed), the skills that benefit gain insight-query steps in their `SKILL.md` workflows:

- `specflow-develop` — `cortex insight query` on the ticket's concepts before implementing (alongside its existing anatomy/cerebrum/atlas reads in the Cortex Awareness section).
- `specflow-tests` — query before running/generating tests (testing.md gotchas, cluster context for the domain under test).
- `specflow-ingest` — query when routing new content (does this concept already live somewhere?).
- `specflow-onboard-codebase` / new-project scaffolding — insight scaffolding for fresh projects.

**These skill updates are a separate follow-up pass, not v2 foundation work** — the same pattern as v1's step-30 awareness pass landing after the substrate (v1 §16.2). One carve-out: the *mechanical path rewrite* the `.specflow/` reorganization forces on every specflow skill cannot wait for that pass — see §9.4 and flag F4.

### 7.3 Discovery scaffolding: CLAUDE.md and `insight/_index.md`

Discovery follows v1 §6.1's mechanism ordering — CLAUDE.md first, `_index.md` second, skills third, and (deliberately) **no hook mechanism** (§7.4):

- **CLAUDE.md's Cortex section** (the managed block, schema §8) gains an insight bullet — module named, contents described in one line, CLI pointed at — and a protocol line: for "how does X hang together" / "how do we do Y here" questions, run `cortex insight query` before grepping the codebase. Template update is a schema §8 change (§11).
- **`insight/_index.md` is an active prompt** in exactly the v1 §6.1 / schema §7.1 convention (Read this when / What's here / How to navigate, <300 tokens). Sketch:

```markdown
# Insight — index

**Read this when:** you need conceptual orientation — how things relate, what a
domain cluster contains, or how setup/testing/deploy actually work here. Insight
is ungated: useful immediately, not human-reviewed. For enforced rules, cerebrum.

**What's here:**
- `map/*.md` — observed project knowledge (setup, testing, deploy, conventions, …).
- `map/graph.json`, `tags.json`, `clusters.json` — the inferred concept map. Query
  via CLI; never hand-edit.

**How to navigate:** `cortex insight query <topic>` first; `cortex insight
neighbors <node-id>` to walk relations; `cortex insight list` to see everything.
Treat claims here as unreviewed — trace load-bearing ones before relying on them.
```

The "ungated — treat as unreviewed" line is deliberate: the index is where Claude learns the trust model, not just the file list.

### 7.4 No hook injection — with rationale

Insight is **NOT a hook-injection mechanism.** No new hooks, no insight payloads added to existing hooks.

- **v1's hook philosophy holds:** hooks warn-never-block, are pure Node file I/O, are *reinforcement* at decision points rather than the primary scaffolding (v1 §5, §6.1), and live inside a strict token budget (v1 §6.3). Injecting unreviewed inferred content at SessionStart or PreRead would spend the trust budget on the layer with the *weakest* trust warrant — precisely backwards. The one hook with enforcement character (PreWrite) reads cerebrum because cerebrum is gated; insight never earns that channel (§10).
- **Pull beats push for this content.** Inferred context is valuable when Claude has a question, worthless as ambient noise. The CLI is a pull mechanism invoked exactly when the scaffolding (CLAUDE.md protocol, `_index.md`, skill steps) says the question warrants it — the same reasoning that made SessionStart minimal in v1 §5.1 ("ranked lists guess at relevance instead of letting Claude pull what it actually needs").

---

## 8. Constellation integration

### 8.1 The `insight` preset

The preset list (v1 §12.5; five server-side lenses) gains a sixth: **`insight`** — the curated citation graph plus an inferred overlay:

- **Inferred edges render dashed**, visually subordinate to the solid curated edges (weight/opacity may additionally encode confidence — renderer detail, not contract). This resolves a deferral v1 §12.2 explicitly left open: "edge stroke can carry semantic distinctions where they exist in the underlying data (e.g. dashed for inferred …); design decision deferred to schema." v2 is that decision.
- **Tag clusters render as background color regions** behind their member nodes (Cytoscape supports this via compound/parent styling — same library, no new renderer).
- Node set is unchanged — insight adds edges and groupings over the *same* nodes (§3.4's shared id grammar is what makes this a join, not a merge).

### 8.2 Composition mechanics

`constellation.json` stays **curated-only and byte-identical to its v1 contract** (schema §4.9, modulo `schemaVersion`). The insight overlay is composed at serve time: the `cortex constellation` server reads `insight/map/graph.json` and `clusters.json` directly when (and only when) the insight preset is requested. Rationale: the compiled artefact keeps its single meaning (the citation graph), its determinism contract stays untouched, and the overlay is always as fresh as the last refresh run with no second compilation step to drift.

### 8.3 Default stays curated — preserving "proof of comprehension"

**The default view remains curated-only. The insight preset is opt-in per session, never the default.**

This preserves v1 §12.1's framing: the constellation is *proof of comprehension* — "someone has understood this project, and the understanding is structured, navigable, and not in anyone's head." Every edge in the default view is a claim a human gated. Inferred edges are *hypotheses about* comprehension, not comprehension; blending them into the default would dilute the exact property that makes the map credible to a stakeholder (v1 §12.7: "restraint is the credibility"). Opt-in, the overlay honestly answers a different question — "what does the machine *think* connects here?" — which is useful precisely because it is visibly (dashed) second-class.

---

## 9. The `.specflow/` reorganization

### 9.1 What moves

| v1 path | v2 path |
|---|---|
| `specs/` | `.specflow/specs/` |
| `specs-business/` | `.specflow/specs-business/` |
| `tests/` | **stays at project root** |

`.specflow/` contains exactly the two trees — no wrapper docs of its own; each tree keeps its own `_index.md`/`_overview.md` structure unchanged. The root human-audience SpecFlow artefacts (`RULES.md`, `build-order.md`, `link-map.md`, `implicit-behaviors.md`, `dead-features.md`) stay at the project root per v1 §8.5's audience rationale (whether they follow later is open question 8, §15).

**Rationale.** The spec trees are tooling-governed knowledge, not project source — the same argument that put `.cortex/` behind a dot. Grouping them under one SpecFlow-owned namespace shrinks the root footprint (two top-level directories become one hidden one), makes "this project is under spec management" a single-path check, and gives the SpecFlow lineage the same namespace symmetry `.cortex/` gave the persistence lineage. `tests/` stays at root because tests are executable project code with ecosystem conventions attached (runners, CI globs, coverage tooling all assume root-level test paths) — moving knowledge is cheap, moving code convention is not.

### 9.2 Versioning cost: none beyond the bump v2 already pays

This is a schema-wide breaking change (directories moved = MAJOR, schema §10.2) — but schema v2.0 is a MAJOR bump anyway for insight, so the reorganization rides it at no additional versioning cost. Doing it in the same round is precisely why it is in this round.

**No migration ships.** There are no external users; the Cortex repo itself moves as part of the v2 build. This deliberately waives schema §10.4's "a MAJOR bump ships a migration that `cortex migrate` applies" for the 2.0 transition specifically — the policy holds for future MAJORs once external users exist. Flagged as F5 (§14).

### 9.3 What changes and what — usefully — doesn't

**Invariant under the move (worth naming because it bounds the blast radius):**

- **Spec IDs are unchanged.** IDs follow the path *within the tree* (schema §2.2); the tree root moving doesn't touch `auth.registration.email-signup`. Every ID-form cross-reference — `depends_on`, `covers`, `governed_by`, `related_specs`, anatomy `spec_links` — survives untouched.
- **`implements:`/`implemented_by:` relative paths are unchanged.** They are relative to the referring file (schema §6), and both trees move together — the relative geometry between `.specflow/specs/…` and `.specflow/specs-business/…` is identical to the old geometry.
- **`governs:` globs are project-root-relative pointers at *source* files** — unaffected.

**What actually changes:** every project-root-relative reference *to* the trees — tree-discovery roots in the validator, compiler, and loops (`check.layout`, `check.id-matches-path` path base, constellation spec-node scan, spec-drift/lint/verify inputs, `specflow-change-router`'s "project has a `specs/` directory" trigger); the CLAUDE.md template text (schema §8); `loop.md`'s wording; documentation; and the specflow skills' hardcoded paths (§9.4).

### 9.4 Coordination with the SpecFlow-awareness pass

Every specflow skill names `specs/` and `specs-business/` in its instructions. Two skill-touching workstreams must not be conflated:

1. **The mechanical path rewrite** (`specs/` → `.specflow/specs/` throughout skill text) — this **must ship in the v2 reorganization round**, or every skill breaks the day the trees move.
2. **The insight-query enrichment** (§7.2) — this **stays a separate follow-up pass**, per the locked decision.

The locked decisions as stated place all skill updates in the follow-up pass while also moving the trees in the v2 round; taken literally those conflict. Resolution (flagged as F4, §14): the reorganization round carries the mechanical rewrite (a find-and-replace-grade change, reviewable in one diff); the judgment-bearing enrichment remains the follow-up. This mirrors v1's own precedent — the §8.5 output-home migrations shipped at the instruction level inside the awareness pass, mechanically, distinct from the awareness judgment itself.

---

## 10. What v2 explicitly does not do

1. **No PreWrite enforcement against insight content — only cerebrum enforces.** Write-time authority is exactly what the human gate earns (v1 §5.3); enforcing unreviewed inference would launder the ungated layer into the gated layer's one privileged channel.
2. **No embeddings.** Explainability (every edge carries a rationale) and stability across LLM model changes are the properties the concept map is built on; vectors provide neither, and would drag non-deterministic infrastructure into a deliberately deterministic Core (§3.4, §3.5).
3. **No MCP server.** The CLI is the query surface for both Claude and humans; users wanting an MCP server can add the optional Graphify enhancement per v1 §7.5 — unchanged from v1 §19's disposition.
4. **No automatic promotion — all promotion is human-gated via pulse.** The review gate is v1.0's load-bearing property (§2); auto-promotion on any "stability" heuristic would collapse the two-layer thesis into a single ungated layer with extra steps.

---

## 11. Schema v2.0 impact — the named changes

This document does not edit `cortex-schema.md`; it names every clause the v2.0 draft must change. Version: `schemaVersion: "2.0"` (MAJOR — directories moved, layout extended).

| Schema clause (v1.0) | v2.0 change |
|---|---|
| §1 layout | Add `insight/` (committed) with `_index.md` + `map/`; `specs/`/`specs-business/` root references become `.specflow/specs/`, `.specflow/specs-business/`. |
| Decision 1 (git policy) | Amend: insight is committed **machine-owned** content — the policy gains the fourth quadrant (§3.3; flag F2). |
| §2 spec-tree conventions | All tree paths re-rooted under `.specflow/`; ID rule (§2.2) unchanged in substance — IDs follow the path within the tree. |
| §4.5 pulse artefacts | Three extensions: (a) a **`**Type:**` field line** on suggestion sections — `rule-candidate` (v1 default, implicit), `skill-proposal`, `gated-layer-update`, `user-directed-capture`, `promotion`; (b) **edit-typed proposals** — a proposal shape carrying current-content + replacement for targets that must be *edited*, not appended (signal 4-gated requires it; subsumes the recorded post-v1 consideration); (c) **target roots extended** beyond `.cortex/cerebrum/` + new skill files to include `.cortex/atlas/`, `.cortex/insight/map/`, and `RULES.md` (signal-5 landing layers, promotion targets). |
| §4.6 / §4.7 dev & business specs | Path examples and `implements:`/`implemented_by:` illustrations updated for `.specflow/` (relative forms unchanged, §9.3). |
| new §4.x insight artefacts | Contracts for `insight/map/*.md` (`kind: insight-prose`, `updated`, provenance-trailer + corrections-log conventions) and the three JSON files (§3.2 shapes; node-id grammar shared with §4.9; edge-kind and confidence enums; determinism + carry-over requirements). |
| §4.9 constellation | Unchanged in shape; note that the insight preset composes the overlay at serve time from `insight/map/` (never compiled in). |
| §7.1 `_index.md` | `insight/_index.md` prompt template added (§7.3 sketch). |
| §8 CLAUDE.md template | Insight bullet + `cortex insight query` protocol line; `specs/` → `.specflow/specs/` in the source-of-truth paragraph. |
| §9.1 canonical task names | Two additions: `cortex-loop-insight-refresh`, `cortex-loop-insight-gaps` (scheduled tasks 12 → 14; loops 13 → 15). |
| §10 versioning | `2.0`; §10.4 migration waived for this bump (§9.2, flag F5). |
| Appendix A | New checks: `check.insight-layout` (directory + `_index.md` + file-type ownership shape), `check.insight-prose` (frontmatter), `check.insight-graph` (JSON shapes, node-id grammar, edge/confidence enums, id uniqueness); `check.layout`/`check.overview-present`/`check.id-matches-path` re-rooted for `.specflow/`. |

CLI surface additions (design-level, v1 §15's list): `cortex insight query|get|neighbors|list`, `cortex loop-insight-refresh (--collect/--apply, --full)`, `cortex loop-insight-gaps (--collect/--propose)`.

---

## 12. Disposition of post-v1 considerations and v1 §4.4 deferrals

Of the twelve `post-v1-considerations.md` items:

- **Subsumed by v2:** *edit-typed pulse proposals* ("curation-loop proposals through the pulse gate for status edits") — v2 ships the mechanism because signal 4-gated makes it load-bearing (§5, §11); once it exists, the curation loops' status-edit proposals can adopt it (their adoption is not itself v2 scope).
- **Touched but not subsumed:** *loop concurrency locking* — v2's answer for the two new loops is structural (disjoint write targets, §4.3) rather than locks; the general item stands. *Extend init's migration to the full §8.5 list* — unaffected by v2's no-migration stance (§9.2), which is specific to the 2.0 transition.
- **Unchanged / still deferred:** purpose-line sentence trimming, PostWrite `_index.md` staleness nudge, scenario `covers:` deferral convention, orphaned scheduled-task detection, bug-triage type-7 → test-runner wiring, design-doc drift loop, `update_scheduled_task` self-adapting cadence, `cortex pulse-reset-dismissed`.

Of v1 §4.4's "deferred to v2" items — **none are in this round**: `ledger/` observability, an interactive graph viewer beyond the constellation, atlas-as-graph analysis, and open-sourcing all remain deferred. The Graphify enhancement (v1 §7.5) likewise stays an unbuilt option (§10 item 3).

---

## 13. Build sequencing sketch

Same discipline as v1 §16.2 — shared substrate before the loops that depend on it, spec-per-piece, review-gated (v1 §16.3). Dependency order, not a schedule:

1. **Schema v2.0** — the §11 changes, drafted and reviewed first (the v1 Phase-1 rule: both layers depend on it).
2. **`.specflow/` reorganization** — the mechanical move + validator/compiler/loop re-rooting + skill path rewrite (§9.4), *early*, so every subsequent piece builds against final paths.
3. **Insight substrate** — directory + `_index.md` scaffolding in init, the three `check.insight-*` validator checks, prose/JSON contracts.
4. **Query CLI** — the four `cortex insight` commands (consumers before producers is deliberately inverted here: the CLI is testable against hand-authored fixtures and gives the loops a verification surface).
5. **Pulse-gate extensions** — suggestion `Type:` field, edit-typed proposals, extended target roots (needed by the gaps loop before it can propose).
6. **`cortex-loop-insight-refresh`** — bookends + judgment + carry-over.
7. **`cortex-loop-insight-gaps`** — bookends + five-signal judgment + distil's already-covered/skip amendments (§6).
8. **Promotion accept path** — the promoted-marking behaviour on accept (§3.7).
9. **Constellation insight preset** — serve-time overlay.
10. **CLAUDE.md / scaffolding template updates** and init/scheduled-task registration (tasks 13–14).
11. **Follow-up (separate pass):** skill-level insight-query enrichment (§7.2).

---

## 14. Flags: contradictions, conflicts, and schema gaps

Raised per the drafting discipline; none are papered over in the sections above — each is resolved-with-proposal or left open, explicitly.

- **F1 — Locked decision vs v1 §11.3 property 2.** The gaps loop's direct writes to `insight/map/*.md` (and the refresh loop's to `*.json`) violate "a Cortex loop writes only to `.cortex/pulse/`" as literally stated. Proposed resolution (§4.4): restate the invariant as *loops never mutate gated content*, with designated owners for machine-owned and ungated state. Requires amending v1 §11.3's wording (or superseding it from this document) — Pedro to confirm the restatement.
- **F2 — v1 git-policy principle vs committed regenerable JSON.** Schema Decision 1's implicit rule ("regenerable → gitignored") conflicts with the locked "insight NOT gitignored" for `map/*.json`. Resolved as a deliberate fourth quadrant (machine-owned, committed — §3.3) with determinism + carry-over as the diff-noise mitigations; residual noise is open question 4.
- **F3 — Schema gap: the v1 pulse gate cannot express v2's proposals.** Three concrete gaps (§11): suggestion sections are untyped; accept is append-only (no edit-typed proposals — signal 4-gated is unimplementable without them); `Target:` roots exclude atlas, insight, and `RULES.md` (signal-5 landing and promotion targets). All three are mandatory v2.0 schema work.
- **F4 — Locked decisions conflict when made concrete: skill updates deferred vs reorganization now.** "Skill updates are a separate follow-up pass" + "move the trees in this round" would break every specflow skill's hardcoded paths. Proposed resolution (§9.4): mechanical path rewrite ships with the reorganization; only the judgment-bearing insight enrichment is the follow-up.
- **F5 — Schema §10.4 waived for the 2.0 bump.** "A MAJOR bump ships a migration" is deliberately not honoured (no external users; the repo moves itself). The policy stands for future MAJORs; the waiver should be recorded in schema v2.0 itself.
- **F6 — Pre-existing v1 contradiction exposed by v2.** v1 §11.3 calls the test-runner the *sole* exception to pulse-only writes while v1 §16.2 item 26 names bug-triage "the second loop granted an exception." v2's F1 restatement resolves the growing-exception-list smell rather than adding a third and fourth entry to it.
- **F7 — Apparent (not actual) reversal of v1 §7.3.** v1 rejected community detection and confidence-tagged edges *for anatomy*; insight ships clusters and confidence edges. Not a contradiction: §7.3's stated ground was that such content belongs to LLM-extracted concept graphs — which insight is and anatomy still isn't. Named here to preempt the misreading.
- **F8 — Terminology drift: "v2" in v1 §4.4 and §7.5.** v1 used "v2" to mean "post-v1"; this document narrows it to the insight + reorganization round. §12 dispositions the old "v2" items (all still deferred); §10 item 3 keeps the Graphify path as the MCP answer.

---

## 15. Open questions for Pedro's review (before schema work begins)

1. **Cluster-id stability across rebuilds.** Node ids inherit constellation-grammar stability (§3.4), but cluster ids are inferred: is `cluster:<label-slug>` with carry-over matching (a rebuild that produces a substantially-overlapping member set keeps the existing id and label) acceptable, or do clusters get regenerated identities each full rebuild (simpler, but breaks any external reference to a cluster)?
2. **Prose-file naming authority and `_index.md` maintenance.** Is the gaps loop's file-creation discipline (§4.2 — check existing files, prefer append, update `insight/_index.md`'s file list on creation) sufficient authority, or should new-file creation itself be gated (e.g. a category-creation proposal) with only appends autonomous? And is a loop writing `insight/_index.md` (scaffolding, elsewhere init-owned) acceptable within the F1 restatement?
3. **What "stabilized" means for promotion eligibility.** Proposed working definition: content is promotion-eligible when it has survived ≥14 days in insight with ≥2 independent session observations (or one distil repetition detection, §6 mechanism 3) and no correction since the last observation. Confirm, tune, or replace — this threshold shapes how noisy the promotion queue gets.
4. **Git-diff noise from weekly JSON rebuilds.** Are deterministic serialization + carry-over (§3.3) sufficient, or should the LLM-authored free text (`rationale` strings) live in a gitignored sidecar with only the structural graph committed? (The sidecar trades the noise for a weaker "committed as durable content" property.)
5. **Gaps-loop window mechanics.** "Previous 24h" as wall-clock conflicts with Desktop catch-up semantics (v1 §10.4: missed runs consolidate into one catch-up run) — a machine asleep for three days would drop two days of transcripts. Proposal: watermark-based ("since the last successful gaps run"), with the 24h phrasing describing the *nominal* cadence. Confirm.
6. **Correction-tracking format (signal 4-in-insight).** Frontmatter vs a `## Corrections` log at the file's bottom. Recommendation: the bottom log — corrections carry multi-line context (original assertion, user's words, session ref) that YAML frontmatter holds badly, and keeping frontmatter lean keeps `check.insight-prose` simple. Confirm or choose frontmatter.
7. **Signal 4-in-insight: rewrite or supersede?** May the gaps loop rewrite contradicted prose in place (log preserving the original), or should it only annotate-and-supersede (strike the old text, append the correction), leaving destructive rewrites to humans? Recommendation: rewrite-in-place with the log — insight's value is being *currently right*, and the log preserves the audit trail — but this is the most autonomous write in the system and deserves an explicit call.
8. **Do the root SpecFlow artefacts follow into `.specflow/` later?** `link-map.md`, `build-order.md`, `implicit-behaviors.md`, `dead-features.md` stay at root in v2 (§9.1, per v1 §8.5's audience rationale). Should a later MINOR/MAJOR absorb the machine-read ones (`link-map.md` is read by `specflow-viewer`), or is root their permanent home?

---

**End of v2 design document.**

Next artefact, after review: `cortex-schema.md` v2.0 — the §11 changes drafted as contract text, then the v2 spec tree (business + dev) under the build sequencing in §13.
