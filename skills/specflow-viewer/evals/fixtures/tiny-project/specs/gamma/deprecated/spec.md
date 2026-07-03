---
id: gamma.deprecated
status: deprecated
depends_on: []
---

# Legacy Export (deprecated)

## Intent

The legacy CSV export endpoint, kept in the spec tree for historical reference. Do not add new features — use the v2 export instead.

## Rules

1. The endpoint remains available but emits a `Deprecation` header on every response.
2. No new fields may be added to the CSV shape.

## Acceptance Criteria

### Deprecation header present
- **Given** any authenticated request to `/export.csv`
- **When** the response is returned
- **Then** a `Deprecation: true` header is set
