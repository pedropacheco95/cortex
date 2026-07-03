---
id: beta.minimal
status: draft
---

# Minimal Spec

## Intent

A deliberately minimal spec — no entities, no rules, no notes, just intent and one acceptance criterion. Tests that the viewer renders gracefully when optional sections are missing.

## Acceptance Criteria

### Smoke
- **Given** the server is running
- **When** a client hits `/healthz`
- **Then** the response is `200 OK`
