# session rotation

How a live session token is replaced near expiry without forcing a re-login.
Owned entirely by the auth scope: `src/auth/session.ts` refresh flows mint the
replacement and revoke the old token in one step.

Touches:
- src/auth/session.ts — the refresh flow (rotate-and-revoke)

Related concepts: authentication (rotation extends a proven identity).
