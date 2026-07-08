---
id: migration.the-modules-name-what-they-hold
status: implemented
implemented_by:
  - ../../specs/migration/compass-rename.spec.md
  - ../../specs/migration/decisions-single-home.spec.md
---

# Cortex's modules are named for what they hold, and every fact lives in one place

## Outcome

When this works, anyone reading `.cortex/` — a developer, a contributor, or Claude itself — can tell what a module is for from its name alone, without having to remember a metaphor. The module that governs rules, conventions, and the bug ledger is called `compass`, because that is what it does: it tells the project which way to go. And every fact the project tracks — starting with its decisions — lives in exactly one place. There is no longer a "same data, two views" arrangement where a decision recorded in one file can quietly drift out of sync with its copy in another. A fact is written once, and everything that depends on it points back to that one place.

## Who This Is For

Developers and contributors working in a Cortex-managed project, and the Claude sessions that read `.cortex/` on their behalf. Anyone who has ever had to ask "wait, is `cerebrum` the rules module or the knowledge module?" or found a decision described one way in one file and a different way in another.

## User Journey

1. A contributor opens `.cortex/` for the first time. Every module name reads as a role: `atlas` is reference knowledge, `compass` is enforceable direction, `archive` is ingested source material, `insight` is inferred understanding, `pulse` is transient activity. Nothing requires knowing a brain-metaphor convention to parse.
2. The contributor goes looking for why a rule exists. They find the rule, follow its citation, and land on exactly one place — `atlas/decisions/` — that holds the decision's full narrative. There is no second copy to reconcile, and no risk that the copy they're reading is the stale one.
3. A rule that used to restate a decision's reasoning inline now points at it instead. Reading the rule is just as fast, and the reasoning itself is guaranteed current because it's never copied.
4. Everywhere the project used to say "cerebrum" — the assistant's onboarding text, the safety-net warnings, the scheduled upkeep instructions — now says "compass," consistently, with nothing left half-renamed.
5. None of this disturbs what was already true: rules and bugs keep their existing identifiers, so nothing that already pointed at `R-014` or `B-031` breaks.

## Business Rules

1. Every `.cortex/` module's name describes what it holds, not an incidental metaphor chosen when the module was first built.
2. Every fact the project tracks lives in exactly one place. Nothing is asserted twice in two files that can independently drift.
3. Renaming a module never changes the identity of the content it holds — a rule or a bug keeps the same identifier it always had.
4. Consolidating a duplicated fact into its one true home never loses the fact. Anything reconciled away remains reachable — by citation, if not by a standing copy.
5. Every surface that names a module — onboarding text, safety-net warnings, upkeep instructions, and the project's own self-check — reflects the current name. No stale reference survives the change.

## Success Metrics

- Zero references to the old module name remain anywhere a developer or Claude would encounter them (excluding historical records that are deliberately preserved as history).
- Zero duplicate decision content exists between the enforcement module and the knowledge module.
- The project's own self-check reports a clean result on the renamed, consolidated state.

## Out of Scope

- The broader v3 reorganization — the new archive module, the provenance system, and the rebuilt insight layer — are separate outcomes with their own specs.
- Any change to the shape of the bug ledger's seven-type classification, or to how rule and bug identifiers are assigned.

## Notes

- This outcome is delivered by two developer specs in sequence: the module rename lands first, and the decisions-consolidation change follows it, because the second needs the module's new name in place before it can point rule citations at the right location.
