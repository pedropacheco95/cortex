# validation-checks

The set of check.* validator functions under src/schema/checks/ that validate one .cortex/ or spec-tree area each, orchestrated by validate.ts.

## Files

- src/schema/checks/archive.ts
- src/schema/checks/atlas.ts
- src/schema/checks/bizspec.ts
- src/schema/checks/claude-md.ts
- src/schema/checks/compass.ts
- src/schema/checks/config.ts
- src/schema/checks/constellation.ts
- src/schema/checks/devspec.ts
- src/schema/checks/hooks.ts
- src/schema/checks/insight.ts
- src/schema/checks/layout.ts
- src/schema/checks/loop-md.ts
- src/schema/checks/provenance.ts
- src/schema/checks/pulse.ts
- src/schema/checks/scenario.ts
- src/schema/checks/specs.ts
- src/schema/checks/xref.ts
- src/schema/validate.ts

## Related concepts

- project-index — co-members of cluster:schema-validator: buildIndex is threaded through every id-resolving check
- schema-contract — co-members of cluster:schema-validator: every check returns the Violation shape types.ts defines
