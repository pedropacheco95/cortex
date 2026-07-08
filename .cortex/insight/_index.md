# Insight — inferred codebase understanding (ungated)

This module holds Cortex's inferred understanding of THIS codebase:
per-file entries (purpose, main players, insights, file map,
connections), concepts, and the semantic graph. Inferred, not
curated — context, not authority. Where insight conflicts with a
compass rule or a spec, the gated layer wins.

Query it; don't read these files directly:
- cortex insight file <path>     — the rich per-file entry
- cortex insight concept <name>  — how a concept lives in the code
- cortex insight element <query> — a function / class / constant

Before substantive work on a file, query its insight entry; before
cross-file or concept-touching changes, query the concept
(see the "Cortex Insight" block in CLAUDE.md).

Layout: per-file entries under anatomy/ (or scopes/<scope>/anatomy/
when scoped); concepts under concepts/; the semantic graph in
graph.json / tags.json / clusters.json; the scope tree in
scope-registry.yaml. Kept current by the insight-refresh loops
(fast / daily / full) and enriched by cortex-loop-session-observe.
