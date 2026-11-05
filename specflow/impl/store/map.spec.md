---
id: store.map
status: implemented
depends_on:
  - store.layout
  - store.rules
implements: ../../promises/store/agent-has-knowledge-when-it-needs-it.business.md
governed_by: []
governs:
  - "src/store/map.ts"
  - "src/store/checks/map.ts"
---

# `MAP.md` generation

## Intent

`MAP.md` is the only always-loaded part of the store (schema S8.1). It tells a session what the store is, where to look, how to file a new fact (the placement procedure that cut duplicates from 24% to 5% in bench round 3), and the rules that always apply. Its fixed parts are a template in Core; its variable parts are generated from the store, so it can't drift.

## Rules

1. `renderMap(store)` returns MAP's text, built in the S8.1 order: (1) the store and its modules; (2) read triggers; (3) the placement procedure, the S8.2 kind → folder table, and the tie-breaker; (4) the full text of the `always` rules; (5) the cast; (6) the terms.
2. Sections 1–3 are fixed template text in `src/store/map.ts`. The tie-breaker sentence is exactly the S8.2 wording.
3. Cast: one line per `world/people/*.md` and per `world/orgs/*.md`: `- <filename stem>: <about>`. Terms: one line, `Terms: ` followed by the term filename stems and their aliases, comma-separated and sorted.
4. A section whose source is empty (no people, no terms, no `always` rules) is omitted with its heading.
5. When the rendered map exceeds 60 lines, the generator still writes it, and `check.map-size` warns with the line count.
6. `cortex store map` writes `cortex/MAP.md` and the managed blocks (`store.managed-block`). `check.map-fresh` warns when the committed `MAP.md` differs from `renderMap(store)`.
7. Output is deterministic: identical stores give byte-identical maps.

## Acceptance Criteria

### STORE-MAP-1: MAP carries the fixed sections in order

- **Given** an empty store
- **When** the map is rendered
- **Then** it contains, in this order, the modules, the read triggers and the placement procedure with the kind → folder table, and the tie-breaker sentence word for word

### STORE-MAP-2: Hard rules are printed in full

- **Given** a rule with `applies_when: always` whose body is "Never push to main."
- **When** the map is rendered
- **Then** the hard rules section contains "Never push to main."

### STORE-MAP-3: Rules that don't always apply are not printed

- **Given** a rule with a situational `applies_when`
- **When** the map is rendered
- **Then** its body does not appear in MAP

### STORE-MAP-4: Cast and terms are generated

- **Given** `world/people/rui.md` (about: "Ops lead at AIF") and `world/terms/fare.md` with alias `ticket price`
- **When** the map is rendered
- **Then** it has the line `- rui: Ops lead at AIF`, and the terms line contains `fare` and `ticket price`

### STORE-MAP-5: Empty generated sections are omitted

- **Given** a store with no people, orgs or terms
- **When** the map is rendered
- **Then** there is no cast heading and no terms line

### STORE-MAP-6: Size is checked

- **Given** a store whose rendered map is 75 lines
- **When** the store is validated
- **Then** `check.map-size` warns with "75 lines (limit 60)"

### STORE-MAP-7: Staleness of MAP is checked

- **Given** `MAP.md` was generated, then `world/terms/route.md` was added
- **When** the store is validated
- **Then** `check.map-fresh` warns that MAP is out of date

### STORE-MAP-8: Generation is deterministic

- **Given** the same store
- **When** the map is rendered twice
- **Then** the outputs are byte-identical
