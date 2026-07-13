---
id: gamma.broken
status: draft
depends_on: [alpha.onboarding, nonexistent.spec, gamma.deprecated]
---

# Broken Dependency Spec

## Intent

Intentionally declares a dependency on a spec that doesn't exist (`nonexistent.spec`) and one that is deprecated (`gamma.deprecated`). Exercises the viewer's "missing chip" rendering and downstream propagation.

## Rules

1. This spec is here only to test the viewer — not a real product rule.

## Acceptance Criteria

### Missing dep is surfaced
- **Given** the viewer parses this spec
- **When** the dashboard health panel renders
- **Then** a warning appears referencing `nonexistent.spec`
