<!-- cortex:start v4.0 -->
## Cortex
# Cortex map

This project keeps its knowledge in `cortex/`: plain markdown, one subject per file. This map is the only part loaded every session; read the rest when you need it.

- `code/<area>/`: how to work in one code area (pitfalls, commands, conventions, why the code is this way). Goes stale with the code.
- `world/`: people, orgs, terms, systems, agreements, decisions and rules. Goes stale with people and the outside world.
- `history/`: dated and append-only: sources, changes, incidents, measurements. Never stale.
- `now/`: true only for now; every item carries `until:` and expires on that date.

## Where to look

- An unknown term → `world/terms/`
- A person or a role → `world/people/`, `world/orgs/`
- An error message → grep its literal text in `cortex/`
- "Why is it like this?" → `world/decisions/` and `history/`
- "What is happening now?" → `now/`
- "How do we work?" → `world/rules/`

## Filing a new fact

1. Search first: `rg -i '<word>' cortex/`, and `rg '^about:' cortex/` as the index.
2. If a file for the subject exists, append the fact to it.
3. Otherwise create one, in the folder the table below gives.
4. Apply the tie-breaker below when the fact fits two subjects.
5. One fact lives in exactly one file. Link to it; never restate it.
6. Set `verified: <YYYY-MM-DD> (observed|told|inferred)` and `origin` (where the fact came from).
7. End with the readback line `Filing: <fact> → <path> (origin: <origin>)`.

| The fact is… | Folder |
|---|---|
| how to work in a code area: pitfall, command, convention, why the code is this way | `code/<area>/` |
| who someone is, or an organisation | `world/people/`, `world/orgs/` |
| what a word means here | `world/terms/` |
| an external system, environment, service or account pointer | `world/systems/` |
| an agreement with a client, partner or the user | `world/agreements/` |
| the current answer to a question, and why | `world/decisions/` |
| how we work (a rule the user set) | `world/rules/` |
| something that happened: a change, incident, measurement or ingested document | `history/<kind>/` |
| true only for now: sprint, leave, status, risk, open question, idea | `now/` |

Tie-breaker: The subject is what the fact constrains. If it constrains two, file it under the one the reader would be working in when it bites, and add an alias in the other.

## Cast

- external-wave-coordinator: External project coordinator (unnamed)

Terms: archive, cerebrum, compass, cortex-extract-insight, cross-scope unification pass, cross-scope-unification, domain.archive, domain.compass, domain.cortex-extract-insight, domain.cross-scope-unification, domain.extraction-level, domain.extraction-scope, domain.insight, domain.provenance, domain.scope-registry, domain.ungated-layer, extraction-level, extraction-scope, insight, insight layer, provenance, scope, scope-registry, ungated, ungated-layer
<!-- cortex:end -->
