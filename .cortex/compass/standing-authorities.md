# Standing Authorities

Default decisions Claude holds per-round without asking. Granted by Pedro, 2026-07-02. Everything not listed here keeps its existing protocol: rule-19 audits, the verification protocol (independent suite + build, real-repo runs, defects surfaced not shipped around), the bug-ledger lifecycle, and design-doc architectural decisions all stay as they are.

## Apply directly, show in the round report

- **Design-doc reconciliations that fix internal contradictions** — a section reference, an out-of-date example, a mislabelled step, a contradiction with a mechanically-derivable resolution. Apply, include the diff summary in the report.
- **Schema additions that unblock the current spec.** Apply, show the diff in the report.
- **Implementation-time engineering calls** — tree-sitter grammar sets, timeout defaults, port numbers, batch sizes, cache TTLs. Decide, record in the spec's Rules or Notes, don't ask.
- **Small quality-of-life additions Pedro has hinted at** ("does the summary tell the user X"). Include if under ~5 ACs of additional scope, don't ask.

## Dogfooding bugs found during a /goal round

File in `compass/bugs/` with the seven-type classification and a populated `proposed_fix`. **Ride the fix into the current round** if it is under ~30 lines *and* the fix's regression test is included; otherwise file it for the next round.

**Blocking-batch exception:** when a filed bug blocks the correctness of the current or immediately-next batch (not merely future rounds), it rides with the blocking batch even past the threshold — the scoped reason is *unblock the batch*, never "small enough to ride". Record that reason explicitly on the ride so exceptions don't erode the general rule. (First exercise: B-003 riding the bug-triage batch — skill-suggest's draft payloads contain fences, so the batch's own outputs would be mangled without it.)

**Ride-along is for mechanical fixes only.** When a filed bug has design surface — multiple sub-decisions, edge cases not obvious from the report — defer to the next round even if the line count is small. (B-002's handling is the template: small-looking fix, but crash-recovery semantics deserved a spec Rule, so it waited.) Resolved bugs stay filed permanently (see `preferences.md`).

## Orchestration depth constraint (temporary)

Until §16.2 step 11 (writer/verifier harness) is complete, `/goal` invocations must be scoped so `specflow-develop` runs at **Minimal or Light depth** — sub-agents cannot spawn sub-agents (the same constraint that killed SpecFlow's agent path, design §8.3), so Standard/Full recursive orchestration fails silently. If a spec's scope would trigger Standard or Full, **split the batch**. Fan-out failures are recovered by breaking the work apart, not by retrying at lower depth mid-run. This constraint lifts when step 11 ships.

## Extraction preference

When a class of behaviour is implemented by two or more modules with the same contract, extract it to a shared source-of-truth module rather than maintaining parallel implementations. The `claude-auth.ts` extraction (init + harness sharing one auth-detection pattern) is the template. Preference, not a rule.

## Ask first, as before

- **Design-doc edits that are architectural decisions** — new boundaries, changed semantics.
- **Schema additions that ripple to other specs.**
- Anything outward-facing or hard to reverse that isn't covered above.

## Intent

Fewer permission checks, more executed work per round. When in doubt about which bucket a decision falls in, the tiebreaker is blast radius: contained-and-reversible → act and report; architectural-or-rippling → ask.

When running two or more subagents in parallel on the same working tree (each touching a disjoint file set), a subagent's own in-session test-suite run can observe a sibling's concurrent in-flight edits and report false failures. Treat only the orchestrator's full-suite verification run, performed after every agent in the parallel batch has completed, as authoritative.