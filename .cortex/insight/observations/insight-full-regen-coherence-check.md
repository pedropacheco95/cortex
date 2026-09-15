---
kind: insight-observation
updated: 2026-08-20T16:40:02Z
salient: false
sessions:
  - claude-sessions/pedropacheco1/24a8c676-da90-4f8c-ad2f-c3891847195b
---

When `cortex-loop-insight-refresh-full`'s collect worklist shows 0
deleted files / 0 stale references / 0 aged edges against a large,
unscoped, otherwise-healthy insight store, do not hand-regenerate
`graph.json`/`tags.json`/`clusters.json` from scratch — a subagent
cannot reproduce a large graph byte-identically, and rewriting it trips
the shrink guard on a false "unexplained shrink" alarm. The verified-safe
path is to check COHERENCE across all four insight layers (file-nodes
against anatomy entries, concepts against concept-nodes as a bijection,
cluster-membership resolution, tag/vocab validity) rather than trusting
file mtimes alone. An mtime-only check (file-nodes only) can look
sufficient while the concept/tag/cluster layer is the one that's
actually stale — worth an explicit bijection check even when file dates
look fine. If everything is coherent, let the deterministic `--report`
step bless the pass without rewriting the JSON stores: unchanged content
under the schema's total-ordered-serialization/determinism contract
means the existing content-stamp remains valid.
