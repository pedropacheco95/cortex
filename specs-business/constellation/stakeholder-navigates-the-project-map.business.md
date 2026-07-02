---
id: constellation.stakeholder-navigates-the-project-map
status: implemented
implemented_by:
  - ../../specs/constellation/renderer.spec.md
---

# A stakeholder opens the project map and finds their way around it

## Outcome

When this works, the compiled project map stops being a data file and becomes something a person can actually open, see, and explore: one command starts a local viewer, the map appears grouped the way the project is organised, and the viewer can narrow it to the lens they care about — just the code, just the knowledge, just one area, or just the unconnected pieces that need attention. The map is quiet and factual; it earns trust by restraint, not polish.

## Who this is for

The same audience as the map itself — collaborators, clients, future maintainers, and the developer — at the moment they want to *look* rather than query: handovers, reviews, returning to a project cold.

## User Journey

1. The developer runs one command; a local address appears and the map opens in the browser.
2. The viewer sees the four knowledge areas as grouped clusters and the connections between them.
3. They switch lenses: everything, structure only, knowledge only, a single area of the product, or only the unconnected pieces.
4. Each lens shows exactly what it names — nothing hidden, nothing invented, connections shown only when both ends are in view.
5. Closing the browser ends the session; nothing was changed by looking.

## Business Rules

1. The viewer is local and private — nothing is published, uploaded, or shared by opening the map.
2. Looking never changes anything: the map viewer is strictly read-only.
3. Every lens is honest — it filters what exists rather than restyling or summarising it.
4. If there is no map yet, the viewer says so plainly and names the one command that builds it.
5. Restraint is the credibility: good defaults, minimal decoration, no flourish that suggests confidence the tool doesn't have.

## Success Metrics

- From command to visible map in seconds, on the developer's own machine, offline.
- A viewer can answer "what's unconnected?" and "what's in area X?" in one interaction each.
- Zero write operations to the project from any viewing session.

## Out of Scope

- The correctness and content of the map itself — that is the compiled-map outcome this viewer draws.
- Fine-grained visual interactions (zoom choreography, drill-down detail panes) — deliberately under-promised until the automated end-to-end test layer exists to keep them honest.
- Sharing beyond the developer's machine — remote viewing and access control are explicitly deferred.

## Notes

- The lens set is deliberately small and fixed; a lens that can't be described in one sentence doesn't ship.
