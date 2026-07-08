---
id: constellation.stakeholder-sees-the-project-understood
status: implemented
implemented_by:
  - ../../specs/constellation/compiler.spec.md
---

# A stakeholder sees, at a glance, that the project is understood

## Outcome

When this works, anyone — a collaborator, a client, a future maintainer, the developer returning after months away — can open the project's map and see that someone has genuinely understood it: what the code is, which rules govern it, which decisions shaped it, and which promises it keeps, all connected and traceable to their sources. The understanding stops living in one person's head, where it disappears when they leave.

## Who this is for

Stakeholders reviewing a Cortex-managed project — clients receiving a handover, collaborators joining mid-stream, and the developer proving (to others or to themselves) that the project's knowledge is structured and current.

## User Journey

1. The developer asks Cortex for the project map after a scan.
2. Cortex assembles everything it knows — the code map, the rules and known problems, the project memory, the promises and their implementations — into one connected picture, grouped the way the project is actually organised.
3. The viewer opens the map, sees the four knowledge areas and how they interconnect, and drills from any group down to a single item and its sources.
4. Gaps are visible honestly: parts of the code no rule governs, promises nothing implements yet, knowledge nothing references — sparse regions on the map, not hidden.

## Business Rules

1. The map only ever reflects what is actually recorded — nothing is invented, and every connection shown can be traced to its source.
2. Coverage is honest: unconnected items stay visible as unconnected, because gaps are information.
3. The same knowledge always produces the same map — regenerating it without changing the project changes nothing.
4. Building the map never alters the knowledge it draws from.

## Success Metrics

- A newcomer can name the project's main areas and their connections within minutes of opening the map, without reading code.
- Every connection on the map can be traced back to a recorded artefact — zero invented links.
- The counters at the map's edge (files, rules, knowledge entries, promises) grow visibly over an engagement — proof of accumulating comprehension.

## Out of Scope

- The interactive viewing experience itself — zooming, presets, drill-down — is the renderer's outcome, delivered separately on top of this map.
- Judging whether the recorded knowledge is *correct* — the map shows what is known, the verification outcomes test it.
- Raw code structure (what imports what) — the map shows the knowledge graph, not a dependency browser.

## Notes

- This outcome covers the compiled map (the data). The renderer that makes it navigable is the next outcome in this group and will list its own implementing specs.
