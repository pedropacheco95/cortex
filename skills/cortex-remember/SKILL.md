---
name: cortex-remember
description: >
  File one fact in this project's cortex/ store, in the one place it belongs, and show where. Use when the user says "remember this", "note that", "from now on", or explains something the store doesn't hold.
---

# Cortex: remember

File one fact in the 4.0 store (`cortex/`), by the placement procedure in `cortex/MAP.md`, and end with one visible readback line so the user can correct it on the spot.

**Precondition.** This skill works only on a 4.0 store. If `cortex/cortex.json` does not exist, stop and say: "This project has no 4.0 store (cortex/); nothing filed." Never write into `.cortex/`. It writes only once the migration is accepted (`migration.accepted` is set in `cortex/cortex.json`), or when the project has no `.cortex/`, in every mode below. If `.cortex/` exists and `migration.accepted` is `null`, stop and say: "This project's store is migrated but not accepted (cortex migrate --accept); nothing filed."

## Steps, in order

1. **Search first.** Run `rg -i '<key words>' cortex/` for the fact's subject, and `rg '^about:' cortex/` as the index of every file.
2. **Append to the existing subject file.** If a file for the subject exists, add the fact there. Never restate a fact that already lives elsewhere: one fact lives in exactly one file. If the fact contradicts what the file says, change that file and end with the `Updated:` line of step 8.
3. **Otherwise use the kind → folder table** in `cortex/MAP.md` to pick the folder, and create one file named by the word a reader would search for (lower-case kebab-case, no ids, no dates outside `history/`).
4. **Apply the tie-breaker** from MAP when the fact fits two subjects: file it where the reader would be working when it bites, and add an alias in the other.
5. **Set `verified` with a method, and `origin`.**
   - `verified: <today> (told)` when the user said it; `(observed)` when you saw it in code or output; `(inferred)` otherwise.
   - `origin: session:<id>`, where `<id>` is the value of `$CLAUDE_CODE_SESSION_ID` (run `echo $CLAUDE_CODE_SESSION_ID`).
   - When appending to an existing file, add your value to that file's `origin` list instead of replacing it.
   - If the harness exposes no session id (Codex, or any other agent without one), use `origin: person:user@<today>`. This is a stated limit: the link back to the conversation is lost.
   - If the fact came from an ingested document, use `origin: source:<its history/sources/ digest path>`.
   - Never write a transcript path or a URL as an origin: this repository may be public.
   - A new file also needs `about` (one line saying what it answers) and `permanence` (`stable`, `changing` or `volatile`).
6. **For a fact that is only true for now** (a sprint, leave, a status, a risk, an open question), write it in `now/<topic>.md` as a list item or `##` heading carrying `until: <YYYY-MM-DD>`.
7. **Run `cortex store validate`** and fix any error it reports for the file you wrote.
8. **End with the readback**, exactly one line:
   - `Filing: <fact> → <path> (origin: <origin>)` for a new or appended fact (the fact in at most 12 words);
   - `Updated: <fact> → <path> (origin: <origin>)` when you changed an existing statement.

## Rules from the user

A rule ("from now on…", "always…", "never…") goes to `world/rules/<rule>.md`, one rule per file:

- `applies_when`: one sentence describing the situation the agent is in, written for a matcher and starting with an actor or a condition ("The agent is about to…", "When the user…"). Never a topic ("anything about deploys"). Use `always` only for a rule that applies in every session.
- `scope`: a non-empty subset of `user-message`, `agent-answer`, `action`, `session-end`.
- `source: user@<today>`.
- The body is the rule text, imperative and complete.

## A document to keep: the source digest

When the user hands over a document or transcript to keep:

1. Write a redacted digest (summary, claims, asks) to `history/sources/<YYYY-MM-DD>-<slug>.md`, dated today. Its frontmatter carries the S3 fields, `captured: <today>`, and `origin: external:<who or where, ≤ 120 chars>`, with no URL, host or user path.
2. If the original is a file, copy it byte for byte to `history/sources/raw/<YYYY-MM-DD>-<slug>.<ext>` (that folder is gitignored), and add `raw: history/sources/raw/<YYYY-MM-DD>-<slug>.<ext>` to the digest's frontmatter.
3. File each durable fact taken from it by the steps above, with `origin: source:history/sources/<file>.md`.

## Propose mode: a proposal, not a fact

Use this when the thing to keep needs someone's approval: a rule you inferred (never one the user stated), a suggested change, or a gap found while working.

1. Append one item to `now/proposals.md`:
   - the heading `## P-<YYYY-MM-DD>-<slug>: <title>`;
   - then the lines `until: <today + 30 days>` and `status: pending decision`;
   - then the full text, and where it came from.
2. If the file does not exist, create it with the S3 frontmatter (`permanence: volatile`, `about: Proposals waiting for a decision`). Add your origin to its `origin` list.
3. Use `####` or lower for headings inside the item, so the item stays one item.
4. Run `cortex store validate`, then end with exactly one line: `Proposed: <proposal> → now/proposals.md#P-<YYYY-MM-DD>-<slug> (origin: <origin>)`.

A proposal is approved when a person, or an agent holding that authority, moves its text to its home in the store and removes the item. The skill never approves its own proposal.

## Never

- Never write under `history/` except to create a new dated file (`history/<kind>/<YYYY-MM-DD>-<slug>.md`). History is append-only.
- Never file the same fact in two places, and never skip the readback line.
