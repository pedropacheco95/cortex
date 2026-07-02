# Constellation — Overview

## What this is

The read-only graph compiler and renderer for humans. `cortex scan` produces `.cortex/constellation.json`, and `cortex constellation` serves a local Node single-page Cytoscape renderer.

## What it covers

**Specs written:**

- `constellation.compiler` — pure-Core compiler: four knowledge surfaces in, `.cortex/constellation.json` out per schema §4.9 (module-prefixed nodes, citation-graph edges only, Level-1 groups, dropped-ref counters, deterministic).

_Planned coverage (not yet written):_

- Compiling `.cortex/constellation.json` — a hierarchical node-group tree plus edges from frontmatter cross-references
- The local Node single-page Cytoscape renderer
- Compound nodes
- Hierarchical zoom (levels)
- The three view presets: project map, code map, and knowledge map

## Why it's grouped this way

Constellation is human-facing visualisation only — read-only, with the CLI staying the source of truth. It exists for people to navigate the project visually; Claude navigates the citation graph directly rather than through this renderer. Nothing here mutates project state.

The compiler reads cross-references already defined by the schema and emitted alongside anatomy; this domain only arranges and renders them, never authors them.

## Related groups

- Business outcomes for this domain: `../../specs-business/constellation/`
- Graph data source and scan: `../anatomy/`, `../core-cli/`
- Cross-reference conventions: `../schema/`
