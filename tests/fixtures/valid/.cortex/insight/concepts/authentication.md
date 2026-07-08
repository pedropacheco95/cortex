# authentication

How a caller proves identity and stays proven. Implemented as signed session
tokens issued and validated in `src/auth/session.ts`, enforced per request by
`src/api/middleware.ts`.

Touches:
- src/auth/session.ts — token lifecycle (issue, validate, refresh, revoke)
- src/api/middleware.ts — per-request enforcement

Related concepts: authorization (what a proven caller may do).
