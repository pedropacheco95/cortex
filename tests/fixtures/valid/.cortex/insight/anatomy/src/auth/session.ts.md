---
path: src/auth/session.ts
extracted_at: 2026-07-07T14:00:00Z
extraction_level: 3
size_lines: 620
size_tokens: 5400
centrality: high
built_at_commit: 9f2c1ab
source_sha256: a1b3c5d7e9f102132435465768798a9bacbdcedfe0f1023344556677889900aa
---

# src/auth/session.ts

## Purpose

Issues, validates, and refreshes session tokens. The single choke point every
authenticated request passes through; owns the token lifecycle end to end.

## Main players

- `validateToken` (L40–L120) — critical. Verifies signature, expiry, and
  revocation state; every guard in the request path calls it.
- `issueSession` (L130–L240) — critical. Mints a signed session token from a
  verified credential pair.
- `TOKEN_TTL_SECONDS` (L18) — supporting. The one TTL constant; refresh logic
  derives every window from it.

## Insights

- Token verification is deliberately clock-skew tolerant (±30s) — tightening
  it breaks the mobile clients, which batch requests offline.
- Revocation checks hit the store synchronously; this file is why auth is on
  the hot path for latency work.

## File map

- Lines 1–39: imports, constants, key loading
- Lines 40–240: the token lifecycle (validate, issue)
- Lines 241–620: refresh flows, revocation, error taxonomy

## Connections

Uses:
- src/util/log.ts: structured logging for every auth decision
Used by:
- src/api/middleware.ts: calls `validateToken` per request
Semantically related (not imports):
- src/auth/keys.ts: key rotation invalidates tokens this file issued

## Query pointers

- If you need to change token validation, also read: src/auth/keys.ts
- If you need to tune session lifetime, read first: this file's `TOKEN_TTL_SECONDS`,
  then: src/api/middleware.ts
