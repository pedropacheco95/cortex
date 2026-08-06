# session-observe

Reference for `cortex-loop`. Moved verbatim from the retired `cortex-loop-session-observe` bundle
(spec `loops.cortex-loop-bundle` Rule 2) — behaviour, CLI verbs, and report paths are unchanged.

## When to use

Session-observation loop — the v3 successor to v2's insight-gaps, and the
primary producer of automatic, ungated project learning. Use for the scheduled
**daily** bundle's session-observe member, or when the user says "run the
session-observe loop", "what did we learn this session", or "capture session
observations".

Runs `cortex loop-session-observe --collect`, reads the unobserved sessions from
the shared corpus, infers durable knowledge (project context stated in passing,
user corrections, gotchas hit, non-obvious behaviour, patterns established),
classifies each with a prefer-ungated tiebreaker, and enriches directly with no
approval — project-wide context into `insight/observations/`, per-file facts
into insight per-file entries — carrying claude-sessions provenance. Only the
minority that should bind future work becomes a rule-candidate or
decision-candidate pulse proposal. Then runs `cortex loop-session-observe
--apply --proposals <file>` and summarises
`.cortex/pulse/reports/session-observe.md`.

## Discipline

You are the judgment middle between two deterministic Core bookends (spec
insight.session-observe Rule 10). The CLI collects the worklist and audits
the result; you — this session — do the observation, classification, and
enrichment judgment. You already ARE a Claude session:
**never spawn a nested `claude` subprocess.**

**The hierarchy inverts from how this loop first shipped.** Being useful is
the fast, ungated path: what a session teaches lands directly in
`.cortex/insight/` with no per-item approval — that is this loop's *primary*
job now. Graduation to a hard rule or decision is the slow, gated path,
reserved for the minority that must genuinely bind future work.

**The loop-write invariant (RULES 7, spec Rule 7):** your only direct writes
are `.cortex/insight/observations/*.md` (and `_index.md`), the `## Insights`
/ `## Query pointers` sections of existing insight per-file entries
(machine-owned, ungated), and the proposals JSON scratch file. Everything
gated — compass, atlas, RULES.md — goes through the pulse gate as a typed
proposal, with no exception.

1. From the project root, run `cortex loop-session-observe --collect`. Read
   `.cortex/pulse/state/session-observe-worklist.json` — the sessions not yet
   observed. If the worklist is empty, run
   `cortex loop-session-observe --apply` anyway (it records the run in the
   report) and tell the user there was nothing new to observe.
2. Read each worklist session's messages from
   `.cortex/pulse/state/session-corpus.json` (the shared corpus — the same file
   `cortex-pulse-distil` reads; never rebuild it yourself). Infer **durable**
   knowledge from how each session actually went:
   - project context stated in passing (audience, scale, deployment shape,
     working style, stated intent — anything about the project as a whole,
     not one file);
   - corrections the user made;
   - gotchas hit (things that cost investigation time);
   - non-obvious behaviour discovered in the codebase;
   - patterns or conventions established.
   Be conservative: session noise is not knowledge. Skip anything an
   unexpired entry in `.cortex/pulse/dismissed.md` already covers.
3. Classify every observation into **exactly one** of four routes (spec Rule
   1), applying the **tiebreaker**: when in doubt between an ungated
   observation and a gated rule, classify it ungated (spec Rule 4). The gate
   is for knowledge *confirmed* to bind future work — something said once,
   however important it sounds, is observation, not law.
   - **Project-context observation** (about the project as a whole, not any
     one file — spec Rule 2): read existing entries under
     `.cortex/insight/observations/` first to check whether a themed entry
     already exists (`audience.md`, `scale.md`, `deployment.md`,
     `working-style.md`, `stated-intent.md`, or another kebab-case theme you
     name) —
     - **new theme:** create the entry (and `observations/_index.md`, if the
       directory doesn't exist yet) with frontmatter `kind:
       insight-observation`, `updated: <now, ISO-8601 UTC>`, `salient`
       (below), `sessions: [claude-sessions/<user>/<session-id>]`, and
       current-truth prose body — no log, no bullet list;
     - **re-encounter** (the same fact restated or reconfirmed): append the
       session id to `sessions:`, bump `updated`, and only touch the body if
       the newer session sharpens the wording — never create a second entry
       or a second bullet;
     - **contradiction** (a session superseding the entry's current truth):
       rewrite the body in place to the newer truth (newest session wins),
       append the session id to `sessions:` (the trail is additive — earlier
       ids are never dropped), bump `updated`;
     - **salience is your judgment, not Core's:** set `salient: true` only
       when the observation was stated forcefully — an "ALWAYS"/"never", an
       explicit imperative, a forceful correction — never mechanically from
       recurrence alone. Leave `salient: false` for anything stated in
       passing, even on a first mention.
   - **Per-file codebase observation** (a fact about a specific file — a
     quirk, a convention it exemplifies, navigation guidance): append it
     DIRECTLY to that file's insight entry
     (`.cortex/insight/anatomy/<path>.md` or
     `.cortex/insight/scopes/<scope>/anatomy/<path>.md`):
     - non-obvious observations and quirks → `## Insights`;
     - "if you need to X, also read Y" navigation guidance → `## Query
       pointers`;
     - every appended line MUST end with a provenance trailer naming the
       session it came from: `... (claude-sessions/<user>/<session-id>)`
       (`<user>` = your OS username);
     - NEVER touch `## Purpose`, `## Main players`, `## File map`,
       `## Connections`, or the frontmatter — those are extraction-owned
       (spec Rule 3), and the apply bookend will fail the run if they change;
     - do not duplicate an item the entry already carries;
     - **if the file has no insight entry, skip it with a note in your
       summary — never create entries; creation is extraction's job**
       (`cortex-extract-insight`).
   - **Gated convention or rule** (confirmed to bind future work, not just
     describe one file or project context): a `rule-candidate` object in
     your proposals JSON — never a direct compass write.
   - **Decision** (the reasoning behind a choice worth preserving): a
     `decision-candidate` object in your proposals JSON — never a direct
     atlas write.
4. **The distil boundary, resolved (spec Rule 8):** distil mines
   *cross-session repetition* over a wider window; you capture *in-context,
   per-session* observations. Enrich the observation once — into
   `insight/observations/` or a per-file entry, whichever grain fits — and
   stop there. Do not propose a `rule-candidate` yourself just because a
   pattern feels repetitive: the `sessions:` trail you're building on the
   observations entry (or the provenance trailers on a per-file entry) *is*
   the shared evidence `cortex-pulse-distil` reads for cross-session
   recurrence; it proposes graduation from that trail on its own schedule,
   not you, and not here.
5. Write the gated candidates to a scratchpad JSON array (empty array when
   none), each object one of:
   ```json
   {"type": "rule-candidate", "pattern": "<the observed convention, verbatim enough for dismissal matching>",
    "title": "<a short display title for the rule>",
    "governedGlobs": ["<glob(s) of files/paths this rule should govern>"],
    "proposedText": "<the rule body text>",
    "sessionIds": ["<session-id>"]}
   ```
   ```json
   {"type": "decision-candidate", "title": "<the decision>",
    "reasoning": "<the narrative: on DATE we chose X because Y>",
    "sessionIds": ["<session-id>"]}
   ```
   Neither shape needs a target or frontmatter — Core computes the `R-NNN` id
   and drafts the schema-valid `.cortex/compass/rules/R-NNN-<slug>.md` (resp.
   `atlas/decisions/YYYY-MM-DD-<slug>.md`) proposal file from it, carrying the
   claude-sessions provenance. `governedGlobs` is the one judgment call Core
   can't make (R-001: no LLM judgment in Core) — infer it from the rule's
   content and the codebase layout; omit it only when you're not confident,
   Core falls back to `["**/*"]`.
6. Run `cortex loop-session-observe --apply --proposals <file>` (plain
   `--apply` when there were no gated candidates). The deterministic close
   audits your entry writes (section boundaries, provenance trailers, and
   observations frontmatter shape), verifies compass/atlas are untouched,
   allocates S-ids from the shared counter, drafts the schema-conformant
   rule/decision file for each gated candidate and writes the typed proposal
   sections into `.cortex/pulse/reports/session-observe.md`, and advances the
   observed-session state. A non-zero exit means you violated a write
   boundary — fix the entries (revert the offending sections) and re-run
   apply.
7. Read `.cortex/pulse/reports/session-observe.md` and summarise to the user:
   sessions observed, project-context observations created or updated (with
   theme and whether it was a fresh entry, a re-encounter, or a
   contradiction), per-file entries enriched, proposals written (their S-ids
   and types), any files skipped for lack of an entry, and any violations.

Gated proposals are reviewed with `cortex pulse-list` / `pulse-accept` /
`pulse-reject` — never apply them yourself.
