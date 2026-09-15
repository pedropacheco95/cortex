---
kind: insight-observation
updated: 2026-09-06T01:20:00Z
salient: true
sessions:
  - claude-sessions/pedropacheco1/b6fa9d2b-cc7e-472d-a709-12d5dd22d38a
---

The SessionStart hook's observations digest (the "Observations: theme:
gist; theme: gist; …" line injected at the top of every session) is
currently broken and misleading on every session, not just occasionally.

**Root cause, pinpointed by a 2026-09-02 four-agent audit (`b6fa9d2b`):**
`firstGist` (`src/hooks/session-start.ts:92-102`) extracts an observation's
"gist" with `normalized.match(/^[^.!?]*[.!?]/)` — a naive sentence-boundary
regex that stops at the *first* `.`/`!`/`?` character anywhere in the line,
including a period that's part of a backtick-quoted path or abbreviation
rather than a sentence end. Any observation whose first prose line opens
with a path like `` `.cortex/insight/` `` truncates at that internal period,
long before the sentence actually ends.

**Confirmed still live on 2026-09-06** (this session's own SessionStart
output, independent of the audit): the digest line read `insight-scope:
Cortex's own \`.; session-observe-audit-false-positive: ...enrichment audit
diffs the; cortex-binary-is-pnpm-link: The global \`cortex\` binary on this
machine is a \`pnpm link\` straight to; headless-cli-hang: In
scheduled/unattended contexts, some headless \`cortex\` invocations` — every
one of the four rendered gists is truncated mid-clause, three of them
exactly at the first period inside a backtick-quoted path. The digest is
not just terse, it's actively unreadable — a session skimming it gets
sentence fragments with no way to tell they're fragments.

**Fix (not yet applied):** make `firstGist`'s sentence-end regex path-aware
— e.g. don't terminate on a `.` immediately followed by a lowercase/alnum
character with no following whitespace (the path/abbreviation case), or
skip past any run enclosed in backticks before scanning for sentence
punctuation.
