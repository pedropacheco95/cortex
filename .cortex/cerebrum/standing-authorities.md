# Standing Authorities

Default decisions Claude holds per-round without asking. Granted by Pedro, 2026-07-02. Everything not listed here keeps its existing protocol: rule-19 audits, the verification protocol (independent suite + build, real-repo runs, defects surfaced not shipped around), the bug-ledger lifecycle, and design-doc architectural decisions all stay as they are.

## Apply directly, show in the round report

- **Design-doc reconciliations that fix internal contradictions** — a section reference, an out-of-date example, a mislabelled step, a contradiction with a mechanically-derivable resolution. Apply, include the diff summary in the report.
- **Schema additions that unblock the current spec.** Apply, show the diff in the report.
- **Implementation-time engineering calls** — tree-sitter grammar sets, timeout defaults, port numbers, batch sizes, cache TTLs. Decide, record in the spec's Rules or Notes, don't ask.
- **Small quality-of-life additions Pedro has hinted at** ("does the summary tell the user X"). Include if under ~5 ACs of additional scope, don't ask.

## Dogfooding bugs found during a /goal round

File in `cerebrum/bugs/` with the seven-type classification and a populated `proposed_fix`. **Ride the fix into the current round** if it is under ~30 lines *and* the fix's regression test is included; otherwise file it for the next round. Resolved bugs stay filed permanently (see `preferences.md`).

## Ask first, as before

- **Design-doc edits that are architectural decisions** — new boundaries, changed semantics.
- **Schema additions that ripple to other specs.**
- Anything outward-facing or hard to reverse that isn't covered above.

## Intent

Fewer permission checks, more executed work per round. When in doubt about which bucket a decision falls in, the tiebreaker is blast radius: contained-and-reversible → act and report; architectural-or-rippling → ask.
