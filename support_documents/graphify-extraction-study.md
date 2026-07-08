# Graphify Extraction Study — Design Input for `cortex-extract-insight` (Cortex v3)

**Status:** design-pass input. Not a spec, not a decision record.
**Feeds:** the `cortex-extract-insight` skill design (L1 tree-sitter → L2 per-file purpose → L3 deep per-file → L4 cross-file semantic graph).
**Method:** read the whole Graphify skill bundle (`~/.claude/skills/graphify/`) plus the installed `graphifyy` package source (`~/.local/share/uv/tools/graphifyy/.../graphify/`), which is where the crown jewels actually live — the skill markdown is only an orchestration script that shells into the Python.

## Orientation

Graphify is a Claude Code skill that turns any folder into a NetworkX knowledge graph with community detection, three output formats (interactive HTML, GraphRAG-ready `graph.json`, plain-language `GRAPH_REPORT.md`), and a query/path/explain surface. Its extraction is a **two-track merge**: a deterministic tree-sitter AST pass over code (`graphify.extract.extract`, `extract.py`) runs in parallel with an LLM "semantic" pass over docs/papers/images (Claude subagents dispatched by the skill, or a direct backend in `llm.py`), and the two node/edge sets are merged by ID (`SKILL.md` Part C). The single most important thing for Cortex to internalize: **Graphify uses no vector embeddings anywhere** — I grepped the entire package and the only "embedding" hits are the word appearing in YAML/Cypher-escaping docstrings. Its only notion of "similarity" is (a) LLM-judged `semantically_similar_to` edges carried on a discrete confidence rubric, and (b) lexical near-duplicate detection via MinHash/LSH + Jaro-Winkler string distance (`dedup.py`). That makes Graphify a remarkably close philosophical fit for Cortex's no-embeddings / explainable-and-stable constraint — and much of this study is about which of its *deterministic-graph and prompt* mechanisms to lift wholesale versus which of its *orchestration* choices to replace with Cortex's scoped/multi-agent plan.

A note on honesty: Graphify's extraction is a **fixed pipeline with two levels** (deterministic structural + one flat LLM semantic pass). It has **no analogue of Cortex's L2/L3/L4 layering, no scope registry, no recursion, and no "plan the extraction" step**. So for the Architecture and Prompts axes, "what maps on" is partial by construction; I mark where Cortex is genuinely on its own.

Files read in full or in substantive part are listed at the end.

---

## Axis 1 — Architecture (parallelism, batching, scale)

**What Graphify actually does** (`SKILL.md` Step 3, `cache.py`, `detect.py`):

- **Two tracks in parallel.** Deterministic AST (`Part A`) and LLM semantic (`Part B`) are dispatched *in the same message* because they touch disjoint file types (code vs docs/papers/images) and merge cleanly in `Part C`. AST is free and fast; semantic costs tokens.
- **Fan-out by fixed chunking.** Semantic files are split into **chunks of 20–25 files**, one sub-agent per chunk, "**all sub-agents dispatched in a single message**" so they run concurrently (`Step B2`). Images get their own chunk (vision needs isolated context). Chunking deliberately **groups files from the same directory together** "so related artifacts land in the same chunk and cross-file relationships are more likely to be extracted."
- **Cache-first.** `check_semantic_cache` (`cache.py`) is consulted before any dispatch; only cache-miss files become sub-agent work. Cache key = **SHA256 of content + relative path**, with a size+mtime_ns stat fastpath (`file_hash`).
- **Scale gate.** `detect` warns and asks the user to narrow when `total_words > 2,000,000` or `total_files > 500`, ranking the top-5 first-level subdirs by file count; HTML viz auto-aggregates to a community view above 5,000 nodes.
- **Each sub-agent writes its fragment to an absolute-path chunk file** (`.graphify_chunk_NN.json`); the parent's success signal is "the file exists on disk," and it explicitly warns that a read-only (`Explore`) sub-agent silently drops results — hence the hard `subagent_type="general-purpose"` requirement.

**TAKE.**
- The **parallel-sub-agents-in-one-message + write-fragment-to-disk-then-merge** pattern is exactly Cortex's per-scope L2/L3 model. Adopt the "disk file is the success signal, missing file = warn-don't-silently-skip, >half missing = abort" contract verbatim — it is battle-tested defensive orchestration.
- **Cache-first dispatch keyed on content hash** is the right substrate for Cortex's refresh loops; adopt it (see Axis 5).
- **Directory-grouped batching** is a cheap heuristic that raises cross-file-edge recall. Cortex's scope planner supersedes it but should preserve its intent: a scope should be a coherent directory-ish neighborhood so L4 cross-file edges fall *within* a scope's sub-agent context wherever possible.
- **AST-and-LLM in parallel** maps directly onto Cortex running L1 (tree-sitter, deterministic, in Core) concurrently with L2/L3 planning.

**LEAVE.**
- **Fixed 20–25-file flat chunking.** This is Graphify's biggest architectural weakness relative to Cortex. It has **no notion of significance** — a 2000-line god-object and a 5-line `__init__.py` each count as "one file" toward the chunk budget, so token/attention is spread uniformly regardless of centrality. Cortex's whole L1-centrality→significance-triage premise exists to fix exactly this. Leave the flat chunker; replace with scope-planned, centrality-weighted allocation.
- **The user-facing "narrow to a subdirectory" size gate.** It's an interactive escape hatch, not a scaling strategy. Cortex is CLI-first and loop-driven; it must scale by recursion, not by asking a human to pick a subfolder.

**DIFFERENTLY.**
- **Plan, don't chunk.** Graphify's unit of parallelism is a bag of ~22 files; Cortex's is a *logically-coherent scope* from the scope registry, recursing when a scope is too large. The nestable-scope + registry model is strictly richer — it gives you (a) stable scope IDs to attach L2/L3/L4 output to, (b) a natural recursion boundary, and (c) a place to record *why* a scope exists. Graphify has none of this; Cortex must design the registry from scratch (**not observable in the available bundle**).
- **Add the cross-scope unification pass.** Graphify's "merge" (`Part C`) is a dumb dedup-by-ID union of AST + semantic nodes. It has **no unification reasoning** — no pass that reconciles concepts named differently across chunks, resolves which scope "owns" a shared concept, or builds cluster-level structure deliberately. Graphify's clustering (Axis-adjacent, `cluster.py`) runs *after* the fact on the merged graph with Leiden/Louvain; it never *reasons* about cross-scope coherence. Cortex's L4 cross-scope unification pass is a genuine addition and the bundle offers no template for it — design it independently, but steal `cluster.py`'s determinism (below) for the mechanical clustering underneath it.

---

## Axis 2 — Prompts (the crystallized experience)

The load-bearing prompt is `references/extraction-spec.md` (the verbatim sub-agent prompt) plus the discrete confidence rubric. These are the most directly reusable artifacts in the entire bundle. Quoting the load-bearing patterns:

**(P1) The three-tier provenance vocabulary** — the spine of the whole thing:
> `EXTRACTED`: relationship explicit in source (import, call, citation, "see §3.2")
> `INFERRED`: reasonable inference (shared data structure, implied dependency)
> `AMBIGUOUS`: uncertain - flag for review, do not omit

**(P2) The discrete confidence rubric** (with an explicit anti-pattern the authors learned in production):
> INFERRED edges: pick exactly ONE value from this set — never 0.5: `0.95` direct structural evidence … `0.85` strong inference … `0.75` reasonable inference … `0.65` weak inference … `0.55` speculative but plausible. Models follow discrete rubrics better than continuous ranges; the bimodal distribution observed in production (>50% at 0.5, >40% at 0.85+) shows the range guidance is being collapsed to a binary.

**(P3) Store rationale as an attribute, never as a node:**
> For rationale (WHY decisions were made, trade-offs, design intent): store as a `rationale` attribute on the relevant concept node — do NOT create a separate rationale node… Only create a node for something that is itself a named entity or concept.

**(P4) Deterministic, collision-free node IDs derived from label alone:**
> `{stem}_{entity}` where stem is `{parent_dir}_{filename_without_ext}` … This must match the ID the AST extractor generates … CRITICAL: never append chunk numbers … IDs must be deterministic from the label alone — the same entity must always produce the same ID regardless of which chunk processes it.

**(P5) Direction and language discipline on edges:**
> source MUST be the caller, target MUST be the callee. Never reverse this direction. `calls` edges MUST stay within one language … cross-language call edges are phantom artifacts, never emit them.

**(P6) Semantic-similarity edges only when non-obvious and cross-cutting** (the no-embeddings substitute):
> if two concepts … solve the same problem or represent the same idea without any structural link … add a `semantically_similar_to` edge marked INFERRED with a confidence_score (0.6–0.95) … Only add these when the similarity is genuinely non-obvious and cross-cutting. Do not add them for trivially similar things.

**(P7) Don't re-extract what AST already has:**
> Code files: focus on semantic edges AST cannot find … Do not re-extract imports - AST already has those.

**TAKE (adopt for L2/L3/L4):**
- **P1 (EXTRACTED/INFERRED/AMBIGUOUS) → adopt as Cortex's edge-provenance enum across L3 and L4.** It is precisely the "confidence must mean something real" primitive Cortex's decisions record demands: it labels *the epistemic basis of the claim*, not a similarity magnitude. This is the single most important prompt import.
- **P2 → adopt the discrete rubric for every confidence Cortex emits, and adopt the production lesson.** The comment about the bimodal collapse (>50% at 0.5) is hard-won calibration data. Cortex confidence scores should be **discrete, named tiers each tied to a stated evidence type**, never a free-floating float — and *never* cosine similarity relabelled (which Cortex has already ruled out; P2 shows Graphify independently arrived at "confidence = strength-of-evidence," not "confidence = similarity").
- **P4 → adopt deterministic, path-derived IDs** for L1/L3 file entities and L4 concepts, so the same entity gets the same ID across refreshes (essential for Axis 5 incremental update and stable diffs). The "must match the deterministic extractor's ID or you get orphan ghost-duplicate nodes" warning is a real footgun to design out from day one.
- **P5 → adopt caller→callee direction and the within-language guard** for L1/L3 code edges. (Cortex's L1 is tree-sitter so it owns direction natively; the value is the *guard* against phantom cross-language edges when Sonnet writes L3/L4 edges.)
- **P7 → adopt the division of labour**: L4 (Sonnet, semantic) must be told *not* to re-derive what L1 (tree-sitter) already knows, and to spend its budget on the cross-file semantics AST can't see. This is the L1↔L4 contract in one sentence.

**DIFFERENTLY (Cortex's four levels need prompts Graphify doesn't have):**
- **P3 (rationale-as-attribute) → generalize into Cortex's L3 schema, but richer.** Graphify's semantic pass is *flat*: one shot, one JSON, `rationale` is a lone escape valve. Cortex L3's "main players / insights / file-map" is a structured per-file understanding. Adopt P3's *principle* (prose attributes hang off entities; don't reify prose into graph nodes — that principle also drives `semantic_cleanup.py`, which sanitizes sentence-like nodes back into attributes), but design the L3 output schema independently — the bundle has no L2 "one-line purpose" prompt and no L3 "deep understanding" prompt to copy.
- **P6 → keep as Cortex's ONLY sanctioned similarity edge, and tighten it.** This is how Cortex gets "semantic similarity" with zero embeddings: the LLM asserts a same-problem/same-idea link *and must justify it structurally*, carrying discrete confidence and INFERRED provenance. Adopt it for L4. Tighten the guardrail ("non-obvious and cross-cutting only") because Cortex, being actively refreshed, will accumulate these; a loose bar produces edge-spam that Axis-5 refresh then has to churn.
- **L2/L3/L4 prompt separation is Cortex-only.** Graphify has exactly one semantic prompt for all non-code content. Cortex needs three distinct prompts at three altitudes (per-file purpose; per-file deep understanding on centrality-important files; cross-file concept graph). The confidence rubric, provenance enum, and ID discipline should be *shared across all three*; the extraction targets differ. **Design the three prompt bodies independently** — only the primitives above transfer.

---

## Axis 3 — Storage format (and every embedding to strip)

**What Graphify serializes** (`export.py`):

- **Primary artifact: `graph.json`** via `to_json` → NetworkX `node_link_data` (nodes / links / hyperedges). On write it:
  - stamps each node with its `community` id and a **`norm_label`** (diacritic-stripped, lowercased label) — this is Graphify's *entire* retrieval index: **a plain lowercased string for substring matching, not a vector.**
  - backfills `confidence_score` on every edge from `_CONFIDENCE_SCORE_DEFAULTS` if missing;
  - restores true `_src`/`_tgt` edge direction that undirected NetworkX storage would otherwise canonicalize away;
  - stamps `built_at_commit` (git HEAD) for staleness tracking;
  - **refuses to overwrite a larger existing graph** unless `force=True` (guards against a half-finished session shrinking the graph — a data-integrity check worth stealing).
- **Prose store: Obsidian vault** (`to_obsidian`) — **one markdown file per node**, human-readable, with frontmatter. This is Graphify's markdown half.
- **Interchange exports:** GraphML (`to_graphml`), SVG, Cypher/Neo4j (`to_cypher`, with careful injection-escaping), wiki (`wiki.py`).
- **Dedup blocking uses MinHash/LSH** (`dedup.py`, `datasketch`) over **character 3-gram shingles of the label string** — again lexical, not semantic vectors.

**Embedding audit result: there are none.** A full grep of the package for `embedding|sentence.transform|cosine|vectoriz|faiss|np.dot|.encode(...sentence)` returns only unrelated docstring hits ("safe for embedding in a YAML scalar"). `datasketch` is MinHash/LSH for string near-duplicate blocking, not vector similarity. **Nothing to strip** — Graphify is already embedding-free, which is the strongest validation available that Cortex's no-embeddings stance is buildable.

**TAKE.**
- **The hybrid is already Graphify's model and maps 1:1 onto Cortex's md+JSON hybrid:** `graph.json` (structured graph/edges/communities/confidence) + Obsidian per-node markdown (prose). Adopt: **JSON owns the graph/tags/clusters; markdown owns per-file prose.** Cortex's "prose per-file entries + JSON graph/tags/clusters" is the same split with better altitude separation.
- **`built_at_commit` provenance stamp** → adopt directly for Cortex refresh invalidation (Axis 5). Store the commit *and* per-entry content hashes.
- **The "refuse to shrink the graph without force" guard** → adopt. A refresh loop that crashes mid-run must never silently truncate the insight store.
- **Deterministic serialization** (`cluster.py` sorts nodes/edges into a total order before partitioning so IDs are reproducible run-to-run) → adopt; Cortex needs stable diffs across refreshes, and non-deterministic ordering reads as spurious "churn."
- **`norm_label` as a cheap, explainable lexical index** → adopt as *one* of Cortex's retrieval paths. But it is exactly the mechanism whose weakness motivates Cortex's structured tags (see Failure Modes + query note below).

**LEAVE.**
- **One-markdown-file-per-node (Obsidian).** Fine for a human vault; wrong for Cortex, whose prose unit is the **per-file L2/L3 entry**, not the per-symbol node. A god-object with 40 methods would become 40 vault files. Cortex should write **one prose entry per source file** (L2 purpose + L3 deep understanding co-located), keyed to the file, not one per graph node.
- **The zoo of interchange exports** (GraphML/SVG/Cypher/Neo4j/wiki). Cortex is CLI-first with its own `.cortex/` store; it doesn't need Gephi/Neo4j serialization surfaces. Leave them unless a concrete consumer appears.

**DIFFERENTLY.**
- **Add structured tags as a first-class store, which Graphify lacks.** Graphify's only "queryable structure" beyond the graph is `norm_label` substring matching. Cortex's decisions commit to **structured tags + graph traversal** as the retrieval substrate. There is no tag schema in Graphify to copy — **design Cortex's tag vocabulary and per-entity tag JSON independently.** This is the concrete thing that replaces embeddings: tags are explainable, stable across model changes, and traversable, where a `norm_label` substring index is brittle (below) and an embedding index is neither explainable nor stable.
- **Co-locate confidence + provenance in the stored edge**, not just a backfilled float. Graphify stores `confidence` (enum) *and* `confidence_score` (float); Cortex should store the enum, the discrete-tier score, **and a one-clause evidence string** so every edge is auditable — "confidence means something real" enforced at the storage layer, not just the prompt.

---

## Axis 4 — Failure modes (where extraction produces garbage, and the triage)

**Where Graphify guards, and how** (`detect.py`, `dedup.py`, `semantic_cleanup.py`, `analyze.py`):

- **Generated / vendored / build noise → hard skip list.** `_SKIP_DIRS` excludes `node_modules`, `__pycache__`, `.git`, `dist`, `build`, `target`, `out`, `site-packages`, `.next/.nuxt/.turbo/.angular`, `.pytest_cache/.mypy_cache/.ruff_cache`, coverage/snapshot/storybook dirs, and even `graphify-out`/`.graphify` (never index your own output). `_SKIP_FILES` drops lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `Cargo.lock`, `go.sum`, …). Plus `.graphifyignore` gitignore-style support.
- **Secrets / config-with-credentials → sensitive skip.** `_SENSITIVE_DIRS` + `_SENSITIVE_PATTERNS` silently drop `.env`, `*.pem/*.key/*.p12`, `credentials`, `*token*`, `.netrc`, `aws_credentials`, etc. (Reported as a count, never by name.)
- **Misnamed / same-named-different-symbol code → dedup guards.** `dedup.py` is a whole pipeline built around this failure mode: exact-normalize only *within the same `source_file`* in Pass 1; in Pass 2, identical labels across *different* files are explicitly **not** merged ("same-named-but-different symbols (trait impls, wrapper methods, common type names)"); variant-suffix guard (`_is_variant_pair`: `M1` vs `M1 Pro`, `Cortex-A55` chip SKUs); short-label guard blocks fuzzy merges except same-length single-char typos; **cross-repo dedup is hard-disabled** (labels collide by coincidence across repos).
- **Jargon / sentence-like "concept" garbage → entropy gate + sanitizer.** Dedup's fuzzy pass only considers nodes with **Shannon entropy ≥ 2.5 bits/char** (`_entropy`), filtering low-information labels. `semantic_cleanup.py` converts sentence-like nodes (≥80 chars or ≥8 words) that are really rationale prose back into attributes, and rejects any `file_type` outside the six-value enum — so runaway LLM output can't inject prose nodes.
- **Doc-hub over-connection → cohesion re-split + hub exclusion.** `cluster.py` re-splits communities whose cohesion `< 0.05` because a `CLAUDE.md`-style file "connected to everything" bridges unrelated subsystems; `exclude_hubs_percentile` can pull staging/utility super-hubs out of partitioning so they don't inflate god-node rankings (#919).
- **Centrality is pure degree, with mechanical hubs excluded.** `god_nodes` (`analyze.py`) = top-N by `G.degree()`, but **explicitly excludes file-level nodes, concept nodes, and json-key nodes** because "they accumulate import/contains edges mechanically and don't represent meaningful architectural abstractions."

**A structural failure mode Graphify exhibits and Cortex must avoid:** its query layer (`references/query.md`) matches nodes by **case-folded substring + IDF, with "no stemming, no synonyms, no cross-language match."** They bolt a whole LLM "constrained query-expansion against the graph's own vocabulary" step on top precisely because plain substring matching collapses to noise on any vocabulary mismatch. That is the brittleness of `norm_label`-as-index made visible — and the direct argument for Cortex's structured tags.

**TAKE.**
- **Adopt the skip lists nearly verbatim.** `_SKIP_DIRS`, `_SKIP_FILES`, and the sensitive-file patterns are exactly what Cortex's **significance triage must exclude before L2/L3/L4 spend a single token**. This is the cheapest, highest-leverage import in the study. (Cortex's Core is deterministic — this is pure file I/O, so it belongs in Core, not a skill.)
- **Adopt the entropy gate + sentence-node sanitizer.** Cortex's L4 will let Sonnet name concepts; the entropy gate and `semantic_cleanup`-style validation are the guardrails that keep low-information and prose-masquerading-as-entity nodes out of the graph.
- **Adopt "exclude mechanical hubs from centrality."** Cortex's L1-centrality→significance triage is the mechanism that decides which files get expensive L3. Graphify's lesson: **raw degree over-ranks file nodes and glue files.** Cortex must compute centrality on the *entity/concept* graph with file-container and config nodes down-weighted, or L3 budget gets spent on `index.ts` and `CLAUDE.md`.
- **Adopt the dedup guardrails' *principle*:** never merge same-named symbols across files/repos by string similarity alone. Even without a MinHash pipeline, Cortex's L4 concept-unification must carry the "same label ≠ same entity across scopes" rule or cross-scope unification will over-merge.

**LEAVE.**
- **The MinHash/LSH+Jaro-Winkler dedup *machinery itself*.** It exists because Graphify's flat chunker produces the same node from many chunks and must reconcile them after the fact. Cortex's scope registry + deterministic IDs (Axis 2 P4) means the *same entity yields the same ID at emit time* — you prevent the duplicates instead of reconciling them. Keep the guard-rules; you shouldn't need the string-similarity blocker. (If cross-scope unification still needs a tiebreaker, note that Graphify's own `dedup.py` offers an opt-in LLM yes/no tiebreaker — a cleaner, more explainable mechanism than string distance, and more in Cortex's spirit.)

**DIFFERENTLY.**
- **Cortex's significance triage is a *ranking* problem, not just a *skip* problem.** Graphify skips noise then treats everything surviving uniformly. Cortex must go further: after excluding noise, **rank survivors by centrality and route only the top tier to expensive L3.** That ranking step is Cortex-specific and **not observable in the bundle** — Graphify has no "which files deserve deep analysis" concept because it has no L3. Design the centrality-threshold / budget policy independently, using `god_nodes`' degree computation and hub-exclusion as the starting metric.
- **Config-only and generated-but-committed files** (e.g. a checked-in `schema.json`, a generated client SDK not under `dist/`) slip through Graphify's dir/name skip lists and then produce low-value "json-key nodes" it has to exclude downstream (`_is_json_key_node`). Cortex should catch these *at triage* via a content-significance signal (is this file mostly data/config vs. logic?), not paper over them at ranking time.

---

## Axis 5 — Update mechanism (incremental vs. full; stale-edge invalidation)

**What Graphify does** (`references/update.md`, `references/hooks.md`, `cache.py`, `build.py`):

- **Incremental by content hash.** `--update` → `detect_incremental` diffs current files against a saved manifest of **SHA256(content+path)** hashes (`file_hash`), re-extracts only changed files, prunes deleted ones (`build_merge(..., prune_sources=deleted)`), and merges into the existing `graph.json` **without a NetworkX round-trip** so edge direction is preserved (#801). Then re-clusters and shows a `graph_diff`.
- **Code-only fast path = zero LLM.** If every changed file is code, it prints "Code-only changes detected - skipping semantic extraction," runs **AST only**, and skips all sub-agents. Doc/paper/image changes trigger the full semantic pipeline.
- **For Markdown, only the body below YAML frontmatter is hashed** (`cache.py _body_content`) — so touching frontmatter metadata doesn't force re-extraction.
- **Trigger surfaces:** post-commit git hook (`hooks.py`, re-runs AST on `git diff HEAD~1` files), a `--watch` folder watcher with debounce (`watch.py`; code→auto-rebuild, docs→writes a `needs_update` flag), and `built_at_commit` stamped in `graph.json`.
- **Clustering is always global.** Even on incremental update, `cluster()` re-runs on the *whole* merged graph (with `remap_communities_to_previous` to keep community IDs stable across runs and avoid spurious churn).

**The critical gap for Cortex to note:** Graphify invalidates on **file change only.** A semantic edge `A → B` lives in the cache keyed to the file(s) it was extracted from. If file `B`'s *meaning* changes but its **containing file wasn't in the changed set for the edge's source chunk**, the `A → B` semantic edge is **stale but never invalidated** — nothing re-examines edges whose *other endpoint* moved. Graphify has **no semantic-edge dependency tracking**; it re-derives edges only for changed files and trusts cached edges for everything else. For pure AST edges this is fine (they're recomputed deterministically); for LLM `semantically_similar_to` / `conceptually_related_to` edges it means **cross-file semantic drift accumulates silently** until a full rebuild.

**TAKE.**
- **Content-hash manifest + code-only-skips-LLM** is exactly right for Cortex's tiered loops and maps cleanly:
  - **refresh-fast loop** → L1 (tree-sitter) only, deterministic, on changed files — Graphify's code-only fast path, wholesale.
  - **daily loop** → re-run L2 (per-file purpose) on files whose content hash changed.
  - **full loop** → L3/L4 rebuild, the periodic correction for accumulated semantic drift.
- **Adopt hash-the-body-not-the-frontmatter** so Cortex's own metadata edits to `.cortex/` prose entries don't self-trigger refreshes.
- **Adopt `remap_communities_to_previous` / stable-ID clustering** so L4 cluster diffs are meaningful, not permutation noise. Cortex will surface these diffs to loops and humans; churn destroys trust.
- **Adopt the prune-on-delete + no-round-trip merge** discipline (direction preservation) for Cortex's incremental graph writes.
- **Adopt `built_at_commit`** plus per-entry hashes as the staleness ledger.

**LEAVE.**
- **Trusting cached semantic edges indefinitely.** This is the gap above. Cortex must not inherit "file unchanged ⇒ its outgoing semantic edges are valid."

**DIFFERENTLY — this is where Cortex must design beyond Graphify:**
- **Track semantic-edge dependencies so stale L4 edges are invalidated when *either* endpoint's file changes**, not just the source. Minimum viable version: when file `X`'s hash changes, mark for L4 re-examination not just `X` but every concept/edge that *references* an entity in `X` (reverse index from entity→edges). Graphify's forward-only, source-keyed cache cannot do this; **Cortex must build the reverse dependency index itself** (not observable in the bundle).
- **Confidence decay / staleness on un-revisited semantic edges.** Since Cortex confidence is a real evidence-tier (Axis 2), an INFERRED edge not re-confirmed across N refreshes should be visibly aged (surfaced to the daily/full loop for re-verification), not silently trusted. Graphify has no concept of edge age; Cortex's "actively-refreshed" premise demands one.
- **Scope-scoped invalidation.** Because Cortex extracts per-scope, a changed file should invalidate and re-plan only its owning scope(s) (and cross-scope edges touching them), leaving untouched scopes cached. Graphify has no scopes, so it re-clusters globally every time; Cortex can be cheaper *and* more correct — design the scope-invalidation policy independently.

---

## Explicitly NOT adopted

The three the decisions record already names, confirmed against the code, plus what the bundle-read surfaced:

1. **Embeddings-heavy retrieval — rejected (and Graphify agrees).** There are none to adopt: Graphify's retrieval is `norm_label` substring + IDF matching; its only similarity mechanisms are LLM-judged discrete-confidence edges and MinHash/LSH *string* blocking. Cortex uses structured tags + graph traversal. *Why: explainability and stability across LLM model changes; a vector index is neither.*

2. **MCP-as-primary interface — rejected.** Graphify offers an MCP stdio server (`serve.py`, `--mcp`, `graphify.serve`) exposing `query_graph/get_node/get_neighbors/...`, but it is strictly opt-in behind a flag; the default surface is CLI + `graph.json`. Cortex is CLI-first; keep MCP (if ever) as a secondary adapter, never the source of truth. *Why: the store, not a live server, is the contract; CLI is scriptable in loops.*

3. **Cosine-as-confidence — rejected, and Graphify never did it.** Graphify's `confidence`/`confidence_score` is a **strength-of-evidence** measure on a **discrete rubric** (P2), with a documented production lesson that continuous ranges collapse to noise. Cortex adopts this framing exactly and must never relabel any similarity magnitude as "confidence." *Why: a confidence score has to mean "how sure are we the claim is true," tied to a named evidence type — not "how close two vectors are."*

Additionally not adopted, found in the read:

4. **Flat 20–25-file chunking as the unit of parallelism** — replaced by scope-planned, centrality-weighted allocation (Axis 1). *Why: uniform attention ignores significance; Cortex's whole L1-triage premise is to spend deep-analysis budget non-uniformly.*

5. **One-markdown-file-per-graph-node (Obsidian vault)** — replaced by one prose entry per *source file* (Axis 3). *Why: per-symbol prose explodes on large files and fragments the per-file understanding L2/L3 are built around.*

6. **The interchange-export zoo (GraphML/SVG/Cypher/Neo4j/wiki)** — out of scope for a CLI-first internal store (Axis 3). *Why: no consumer; each is a maintenance surface with no Cortex user.*

7. **Forward-only, source-keyed semantic-edge caching** — replaced by a reverse dependency index + confidence-aging (Axis 5). *Why: it lets cross-file semantic drift accumulate silently, which is fatal for an "actively-refreshed" system.*

8. **Interactive "narrow to a subdirectory" scale gate** — replaced by recursion on large scopes. *Why: Cortex is loop-driven and must scale without a human in the loop.*

---

## Appendix — files actually read

**Skill bundle (`~/.claude/skills/graphify/`):** `SKILL.md` (full, 615 lines), `references/extraction-spec.md`, `references/update.md`, `references/query.md`, `references/exports.md`, `references/add-watch.md`, `references/hooks.md`, `references/github-and-merge.md`, `references/transcribe.md` (all full).

**Installed package (`~/.local/share/uv/tools/graphifyy/.../graphify/`):** `cluster.py` (full), `dedup.py` (full), `export.py` (`to_json` + serialization/escaping region; export-function inventory), `analyze.py` (`god_nodes`, `surprising_connections`, centrality region), `semantic_cleanup.py` (validation/sanitizer region), `detect.py` (`_SKIP_DIRS`/`_SKIP_FILES`/`_SENSITIVE_*` triage region), `cache.py` (`file_hash`/`_body_content` invalidation region), `llm.py` (`BACKENDS` table + entry points). Whole-package grep for embedding/vector/cosine usage (negative result — confirms zero embeddings). `extract.py` (11k-line tree-sitter AST engine) inventoried by grep, not read line-by-line — its role (deterministic structural extraction, Cortex's L1) is established from its callers and the AST/semantic merge in `SKILL.md`.

**Not observable in the available bundle (Cortex must decide independently):** the scope registry and recursion policy; the cross-scope L4 unification-reasoning pass; the L2 one-line-purpose and L3 deep-understanding prompt bodies; the structured-tag schema; the centrality-threshold significance-ranking policy; and semantic-edge reverse-dependency invalidation with confidence-aging. Graphify has no analogue for any of these — it is a two-level fixed pipeline, not a four-level plan.
