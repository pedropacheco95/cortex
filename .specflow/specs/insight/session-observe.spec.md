---
id: insight.session-observe
status: implemented
depends_on:
  - insight.extract-skill
  - insight.storage-format
  - provenance.frontmatter-check
implements: ../../specs-business/insight/assistant-learns-from-sessions.business.md
governed_by:
  - R-001
governs:
  - "src/insight/session-observe.ts"
  - "skills/cortex-loop/references/session-observe.md"
---

# Session-Observe Loop — the v3 successor to insight-gaps

## Intent

`cortex-loop-session-observe` reads the shared Claude Code session-transcript corpus (the same corpus `cortex-pulse-distil` reads) and infers durable knowledge from how a session actually went — corrections the user made, gotchas hit, non-obvious behaviour discovered, patterns established, and project context stated in passing (v3 design §9; schema §4.10.11). The loop's hierarchy inverts from how it first shipped: **the primary output is ungated, automatic learning** — what a session teaches lands directly in `.cortex/insight/`, with no per-item approval, because insight is machine-owned and ungated by design (RULES 7's machine-owned-ungated allowance, the same basis as `insight.refresh-loops`). The pulse gate is secondary, reserved for the minority of candidates that must *bind* future work — a convention, a decision. Graduation to a hard rule is the slow, gated path; being useful to the next session is the fast, ungated one.

Ungated learning itself has two grains. A fact about one file still enriches that file's insight entry directly, as it always has (Rule 3, below). A fact about the *project* — audience, scale, deployment shape, working style, stated intent, anything that isn't about a specific file — has no per-file home to enrich; it lands instead in `insight/observations/`, the session-learned project-context surface new at schema 3.1 (§4.10.11), of which this loop is the sole writer. Both are ungated, both carry `claude-sessions/<user>/<id>` provenance (schema addendum A6). Only conventions and decisions still travel through the pulse gate to compass and atlas (Rules 6–7), reusing the salvaged v2 typed pulse-gate/promotion machinery (design §8.2).

This spec is re-pointed at `assistant-learns-from-sessions.business.md` — automatic, ungated learning is now this loop's primary promise, not a secondary enrichment of the codebase-understanding outcome it used to sit under (see that business spec's Notes for the cross-reference). `status: draft` reflects where the code stands relative to this reframe: the per-file enrichment route, the `rule-candidate`/`decision-candidate` gated routes, dismissal suppression, and the RULES 7 write-boundary invariant are all implemented as of the previous draft; the project-context observation route this draft adds (Rules 2 and 4, and their acceptance criteria) is not yet built.

## Entities

- **READS:** the shared session-transcript corpus (this project's recent Claude Code sessions, coordinated with `cortex-pulse-distil`'s corpus machinery and the read-time purpose capture folded into insight extraction metadata, design §5.10); existing per-file insight entries under `anatomy/`/`scopes/<scope>/anatomy/` (to locate the right `## Insights`/`## Query pointers` target and to avoid duplicate enrichment); existing `insight/observations/*.md` entries (to find the matching themed entry, or decide none exists yet, and to tell a re-encounter from a contradiction); `pulse/dismissed.md` (suppression); `pulse/state/suggestion-counter`; `cortex.config.json`.
- **WRITES:** the `## Insights` and `## Query pointers` sections of existing per-file insight entries (direct rewrite/append, never touching `## Purpose`, `## Main players`, or `## File map`, which are extraction-owned); `insight/observations/<theme>.md` entry files — created, appended to, or rewritten in place per Rule 2; `insight/observations/_index.md`, scaffolded by this loop on its first observation (`cortex init` never scaffolds this directory, schema §4.10.11 — the loop is this surface's sole producer, index included); `pulse/reports/session-observe.md` (its report, plus `rule-candidate`/`decision-candidate` proposal sections carrying S-ids from the shared counter); `pulse/state/suggestion-counter`; the transient session corpus. Never `compass/`, `atlas/`, or `RULES.md` directly.
- **CREATES:** typed pulse proposal sections per schema §4.5.1 (as amended for v3 target roots — compass replacing cerebrum); the first `insight/observations/<theme>.md` entry and `insight/observations/_index.md` for a project whose loop has never observed project context before (the directory is absent until then, schema §4.10.11).

## Rules

1. **Collect → classify → route, mirroring the shared-corpus idiom.** The loop reads the session corpus (shared machinery with `cortex-pulse-distil`) and classifies each candidate observation into exactly one of four routes: a project-context observation, a per-file codebase observation, a gated convention/rule, or a decision. The first two are ungated and direct; the last two are gated proposals (Rules 6–7).
2. **Project-context observations enrich `insight/observations/` directly (schema §4.10.11).** A candidate that is about the project as a whole rather than any one file — audience, scale, deployment shape, working style, stated intent, or any other theme the loop identifies — lands in a themed entry file (`audience.md`, `scale.md`, `deployment.md`, `working-style.md`, `stated-intent.md`, or a new kebab-case `<theme>.md` the loop names): current-truth prose, never a log. Each entry carries required frontmatter `kind: insight-observation`, `updated` (bumped on every write), `salient` (bool), and `sessions:` (the list of every `claude-sessions/<user>/<id>` that stated or re-confirmed it).
   - **First mention** creates the entry (and `insight/observations/_index.md` if the directory doesn't exist yet) with `sessions:` holding the one session id.
   - **Re-encounter** — the same observation stated or confirmed again — appends the new session id to `sessions:`, bumps `updated`, and refines the prose only if the newer session sharpens it; it never duplicates the entry or adds a second bullet.
   - **Contradiction** — a session stating something that supersedes the entry's current truth — rewrites the body in place to the newer truth (newest session wins) and appends its session id; the `sessions:` trail is kept in both the re-encounter and contradiction case, because it **is** the evidence record that frequency (the digest's importance signal, schema §4.10.11) reads directly off.
   - **Salience is an LLM judgment made at capture time, not Core's.** `salient: true` is set only when the observation was stated forcefully — an "ALWAYS"/"never", an explicit imperative, or a forceful correction of a prior assumption — never mechanically. A single forceful session can outrank a dozen mild ones; nothing computes or stores a combined importance score (schema §4.10.11) — that derivation belongs to the consumer (the SessionStart digest, `hooks.session-start`), not to this loop's writes.
3. **Per-file ungated codebase observations enrich insight directly (design §9, addendum A7.3).** These land as appends or targeted rewrites in the relevant per-file entry's `## Insights` (non-obvious observations, quirks, conventions the file exemplifies) or `## Query pointers` (intent-scoped "if you need to X, also read Y" guidance) section — never in `## Purpose`, `## Main players`, or `## File map`, which belong to extraction (`insight.extract-skill`) and would be silently clobbered by a differently-scoped writer if this loop touched them. Every write carries `claude-sessions/<user>/<id>` provenance (schema addendum A6.1) so the enrichment traces back to the session that produced it.
4. **The classification tiebreaker: when in doubt, prefer ungated.** The pulse gate exists for knowledge *confirmed* to bind future work — not for anything that merely sounds important. A candidate that could plausibly be read either as a project-context observation (or a per-file one) or as a gated convention/rule is classified ungated unless it is unambiguously a rule that should constrain future work or a decision whose reasoning must be preserved. Something said once in conversation is observation; it earns gated status only by recurring or by being stated as a binding instruction, at which point Rule 6 or 7 applies.
5. **Gated conventions/rules are proposed to compass, never written directly, as a Core-computed CREATE (B-010).** A candidate that names a project convention or rule (something that should bind future work, not just describe the current file or project context) is emitted as a typed `pulse/` proposal using the existing `rule-candidate` suggestion type (schema §4.5.1, re-rooted cerebrum→compass by the v3 addendum, A0.1/A1), targeting `.cortex/compass/`. Because a fresh convention almost always targets a brand-new rule file, not an existing one, Core — not the LLM — computes a real, unused `.cortex/compass/rules/R-NNN-<slug>.md` target and drafts it as a `**Proposed file:**` (create) carrying schema-conformant frontmatter (`id`/`title`/`source`/`governs`/`provenance`), mirroring exactly how `decision-candidate` drafts its atlas file (Rule 6). The candidate supplies the judgment Core cannot make — the rule's text and the glob(s) it should `governs:` — never a target path. It is never written to `compass/` directly by this loop.
6. **Decisions are proposed to atlas, never written directly.** A candidate that captures a decision (the reasoning behind a choice, not just an observable convention) is emitted as a typed `pulse/` proposal with `**Type:** decision-candidate` (schema addendum §A7.4 — additive to the v2.0 enum, parallel to `rule-candidate` but targeting `atlas/decisions/` instead of `compass/`) targeting `.cortex/atlas/decisions/`. It is never written to `atlas/` directly by this loop. **(3.4) Core seeds the drafted decision's `bears_on`** (schema §4.3, §6 rule 6): `--apply` reads each `sessionIds` entry's read ledger `pulse/state/reads/<session-id>` in candidate order, keeps every line starting with `.cortex/` or `.specflow/`, deduplicates in first-seen order, caps the list at 12, and passes it to `decisionFilePayload`'s optional `bearsOn` argument — the same seed `pulse.threads` Rule 4 takes for a thread. Absent ledgers (hygiene deletes them after 14 days) yield an empty seed and no `bears_on` key; the skill supplies nothing (the candidate shape is unchanged) and may not override the seed. Once accepted, a seedless decision carries `check.atlas`'s "bears on nothing" warning until a human adds one — the field is Core-seeded or human-added, never LLM-guessed.
7. **Never mutate gated content directly (RULES 7, the loop-write invariant).** The loop's only direct writes are to `.cortex/insight/` (per-file entries, Rule 3, and `observations/`, Rule 2) and to `pulse/`. Every `compass/` or `atlas/` change is a human-reviewed typed proposal, with no exception.
8. **Boundary with `cortex-pulse-distil` — resolved via a shared evidence trail (schema §4.10.11).** Distil mines **cross-session repetition** into rule/decision candidates over a wider window; session-observe captures **in-context, per-session** observations from how one session went. Both read the same corpus at a different altitude, and both now read the same evidence: an `insight/observations/` entry's `sessions:` trail (Rule 2) *is* the frequency signal distil looks for. There is no separate double-proposal mechanism to design — an observation this loop enriches once is left as ungated context; if it recurs across enough further sessions, distil reads that same entry's `sessions:` trail and proposes graduation through the existing `rule-candidate`/`decision-candidate` gate, citing the entry's own provenance as evidence. One evidence trail, one gate, no second index to keep in sync.
9. **S-ids and suppression are the existing shared machinery.** Proposal S-ids are acquired from the shared `pulse/state/suggestion-counter` (global, monotonic, never reused, schema §4.5). A previously-dismissed candidate (matched via `pulse/dismissed.md`, unexpired) is not re-proposed.
10. **Deterministic Core bookends (R-001).** Corpus collection is pure file I/O and runs in Core (or a Core-adjacent deterministic step, same convention as distil's collect half); only the classification/routing judgment and the enrichment-text drafting are LLM work, never inside Core.
11. **Corpus freshness — collect refreshes the shared corpus instead of reusing it stale.** `--collect` never treats an on-disk `pulse/state/session-corpus.json` as current merely because it exists. It builds the corpus via distil's `collectCorpus` only when absent; otherwise it calls the shared `refreshCorpus` helper (`pulse.distil` Rule 11), which appends every session whose transcript mtime is at-or-after the corpus's `generated` stamp (upserting by id — a session already present is replaced by its fresher messages) and re-stamps `generated`. The corpus's `since` and distil's `state/distil-last-run` are never touched by this loop, so distil's own since-window semantics (`pulse.distil` Rules 1 and 7) are unchanged. The worklist records `corpus_reused: true` and how many sessions the refresh added (`corpus_appended`).
12. **Kind tagging — every corpus session carries `kind: 'scheduled' | 'interactive'`.** Detected deterministically in Core from the session's first `user` message: `scheduled` when that text starts with `Base directory for this skill:` or contains `<scheduled-task`; `interactive` otherwise (including a session with no user message). A corpus written before this rule (no `kind`) still loads, each session read as `interactive`. The worklist exposes `kind` per session and orders interactive sessions first (corpus order preserved within each kind), so the skill reads the human-driven sessions before the loop-driven ones.
13. **Claimed observation — `--apply` advances observed-state only for sessions the skill claims it read.** The proposals file accepts two shapes: the legacy bare JSON array of gated candidates, which (for backward compatibility) claims every worklist session; and the object `{ "observed": ["<session-id>", ...], "candidates": [ ... ] }`, which claims exactly the listed worklist ids (`observed` absent → nothing claimed; `candidates` absent → no gated candidates; ids not in the worklist are ignored). Plain `--apply` with no proposals file behaves like the bare array (claims all — the legacy empty-worklist path). A worklist session left unclaimed increments its `attempts` counter in `session-observe-state.json` (`attempts: { "<id>": n }`, absent in older state files → 0) and stays in the next worklist; on its third unclaimed apply it is marked observed anyway, its counter dropped, and the report lists it under "expired unobserved" so the loss is visible rather than silent.

## Acceptance Criteria

### An ungated codebase observation enriches the right file's Insights section with provenance

- **Given** a session where Claude discovered that `src/billing/retry.ts` silently swallows a specific network error class — a non-obvious quirk not recorded anywhere
- **When** the loop classifies this as an ungated codebase observation and routes it
- **Then** the observation is appended to `insight/anatomy/src/billing/retry.ts.md`'s `## Insights` section with a `claude-sessions/<user>/<session-id>` provenance trailer
- **And** no `pulse/` proposal is written for it, and no `compass/` or `atlas/` file is touched

### An ungated observation lands in Query pointers when it's navigation guidance

- **Given** a session where the user told Claude "when touching retry logic, also check `src/billing/backoff.ts` first"
- **When** the loop routes this observation
- **Then** the guidance is appended to `src/billing/retry.ts`'s `## Query pointers` section (not `## Insights`), carrying the same session provenance

### Extraction-owned sections are never touched by this loop

- **Given** any ungated observation destined for a per-file entry
- **When** the loop writes it
- **Then** the entry's `## Purpose`, `## Main players`, and `## File map` sections are byte-identical before and after the write — only `## Insights`/`## Query pointers` change

### A project-context observation lands in `insight/observations/` with provenance, no proposal

- **Given** a session where the user mentioned in passing "this is for about a thousand users" — context about the project, not about any one file
- **When** the loop classifies this as a project-context observation and routes it
- **Then** `insight/observations/scale.md` is created (or updated) with frontmatter `kind: insight-observation`, `salient: false`, `sessions: [claude-sessions/<user>/<session-id>]`, and body prose stating the ~1000-user target
- **And** no `pulse/` proposal is written for it, and no `compass/` or `atlas/` file is touched

### A forcefully-stated observation is captured as salient from a single session

- **Given** a session where the user said "we ALWAYS deploy on port 4501" — stated as an imperative, not a passing remark
- **When** the loop classifies and routes this observation
- **Then** the resulting `insight/observations/deployment.md` (or equivalent theme) entry carries `salient: true` from this one session alone, with no requirement that it recur

### A re-encountered observation appends provenance instead of duplicating

- **Given** an existing `insight/observations/scale.md` entry with `sessions: [claude-sessions/pedro/aaa111]`, and a later session restating the same ~1000-user context
- **When** the loop routes the restated observation
- **Then** the entry gains the new session id in `sessions:` (now listing both ids), its `updated` timestamp advances, and no second entry or duplicate bullet is created
- **And** the body prose is refined only if the newer session sharpens it — otherwise it is left as-is

### A contradicting observation rewrites the body in place, newest wins

- **Given** an existing `insight/observations/scale.md` entry stating a ~1000-user target, and a later session stating the target is now ~10,000 users
- **When** the loop routes the contradicting observation
- **Then** the entry's body is rewritten to the ~10,000-user truth, the new session id is appended to `sessions:` (the earlier id is kept, not dropped), and `updated` advances
- **And** no second file or a bullet-per-version log is created — the entry stays one current-truth prose block

### The classification tiebreaker prefers ungated when in doubt

- **Given** a candidate observation that could plausibly read as either a project-context/per-file observation or a rule that should bind future work, stated once and not framed as an imperative or a recurring pattern
- **When** the loop classifies it
- **Then** it is routed as an ungated observation (project-context or per-file, whichever grain applies), not as a `rule-candidate` — the gate is reserved for what's confirmed to bind, and this candidate isn't yet

### `insight/observations/` is absent until the loop's first observation

- **Given** a project whose session-observe loop has never produced a project-context observation
- **When** the project's `.cortex/insight/` module is inspected
- **Then** no `observations/` directory exists, and this is not a validation failure (`check.insight-observations` tolerates its absence)
- **And** the first project-context observation this loop ever routes creates both `observations/_index.md` and the first themed entry file in the same write

### A gated convention becomes a compass-targeted proposal, never a direct write

- **Given** a session where the user established "all new API routes must validate input with the shared schema validator" — a rule that should bind future work, not just describe one file
- **When** the loop classifies this as gated and routes it
- **Then** `pulse/reports/session-observe.md` gains an `S-NNN` section with `**Type:** rule-candidate` and `**Target:**` under `.cortex/compass/`
- **And** `.cortex/compass/` itself is unchanged — the gate applies it, not this loop

### A rule-candidate proposal is actually acceptable (B-010)

- **Given** a project whose `.cortex/compass/rules/` directory does not yet exist (the common case — a fresh convention almost always targets a brand-new rule, not an existing file)
- **When** the loop routes a gated convention as a `rule-candidate` and the run applies
- **Then** Core (not the LLM) computes a `**Target:**` of a real, unused `.cortex/compass/rules/R-NNN-<slug>.md` and emits `**Proposed file:**` (create), never `**Proposed addition:**` — the payload carries schema-conformant frontmatter (`id` matching `R-NNN` and the filename, `title`, a resolvable `source`, `governs`)
- **And** `cortex pulse-accept <S-NNN>` succeeds against that empty `rules/` directory, and the landed file passes `check.rules` and `check.provenance`
- **And** two `rule-candidate` proposals accepted from the same apply batch land as distinct, non-colliding `R-NNN` files

### A decision becomes an atlas-targeted proposal, never a direct write

- **Given** a session where the user explained why the team chose polling over webhooks for a specific integration, with reasoning worth preserving as a decision record
- **When** the loop classifies this as a decision and routes it
- **Then** `pulse/reports/session-observe.md` gains an `S-NNN` section with `**Type:** decision-candidate` targeting `.cortex/atlas/decisions/`, carrying the reasoning and session provenance
- **And** no file under `.cortex/atlas/` is modified directly

### A decision-candidate's `bears_on` is seeded from the session's read ledger (3.4)

- **Given** a `decision-candidate` with `sessionIds: ["s1"]` and `pulse/state/reads/s1` listing, in order, `src/pulse/usage.ts`, `.cortex/compass/rules/R-001-core-no-llm-calls.md`, `.specflow/specs/pulse/usage.spec.md`, `.cortex/compass/rules/R-001-core-no-llm-calls.md` and eleven further distinct `.cortex/` paths
- **When** `--apply --proposals <file>` runs
- **Then** the proposed decision file's frontmatter carries `bears_on` with exactly 12 entries, the first two being the two `.cortex/`/`.specflow/` ledger lines in ledger order (the duplicate collapsed, `src/pulse/usage.ts` excluded), and `cortex pulse-accept` of that section lands a file that passes `check.atlas` and `check.bears-on` with no "bears on nothing" warning
- **And given** the same candidate with no ledger on disk, **then** the proposed file has no `bears_on` key and the section is otherwise identical

### A dismissed candidate is not re-proposed

- **Given** `pulse/dismissed.md` holds an unexpired entry for a suggestion matching a candidate the loop would otherwise propose again
- **When** the loop runs
- **Then** the matching candidate is skipped and no new `S-NNN` section is created for it

### Distil and session-observe do not double-propose the same pattern

- **Given** an `insight/observations/working-style.md` entry this loop has enriched, whose `sessions:` trail has grown to meet distil's own recurrence threshold across a wider window
- **When** distil's judgment runs over the same corpus and reads `insight/observations/` alongside its session-corpus scan (schema §4.10.11)
- **Then** distil proposes graduation through the existing `rule-candidate`/`decision-candidate` gate, citing the entry's own `sessions:` trail as evidence — it does not independently re-derive the pattern from scratch, and only one live proposal results
- **And** an entry whose `sessions:` trail has not yet met distil's recurrence threshold is left alone — read as evidence, not proposed

### Collect refreshes a stale corpus with sessions newer than its `generated` stamp

- **Given** an existing `pulse/state/session-corpus.json` generated at T holding session `old-1`, and a fake home whose transcript directory holds `old-1` (mtime before T) plus a new session `new-1` (mtime after T)
- **When** `cortex loop-session-observe --collect` runs
- **Then** the corpus now holds both `old-1` and `new-1`, its `generated` advances past T, its `since` is unchanged, `state/distil-last-run` is untouched, and the worklist lists `new-1` with `corpus_reused: true` and `corpus_appended: 1`
- **And** an `old-1` transcript rewritten after T is replaced in place (one entry per id, fresher messages), never duplicated

### Every corpus session carries a deterministic `kind`, and older corpora still load

- **Given** a fake home with one session whose first user message begins `Base directory for this skill:`, one whose first user message contains `<scheduled-task name="cortex-daily"`, and one whose first user message is ordinary prose
- **When** the corpus is collected and the worklist written
- **Then** the first two sessions carry `kind: scheduled` and the third `kind: interactive`, both in the corpus and in the worklist
- **And given** a pre-existing corpus file whose sessions have no `kind` field, **when** `--collect` reuses it, **then** it loads and every session is treated as `interactive`

### The worklist lists interactive sessions before scheduled ones

- **Given** a corpus holding, in order, sessions `sched-1` (scheduled), `human-1` (interactive), `sched-2` (scheduled), `human-2` (interactive), none yet observed
- **When** `--collect` writes the worklist
- **Then** the worklist order is `human-1`, `human-2`, `sched-1`, `sched-2` — interactive first, corpus order preserved within each kind

### Apply advances observed-state only for claimed sessions

- **Given** a worklist of `sess-1` and `sess-2`, and a proposals file `{ "observed": ["sess-1"], "candidates": [] }`
- **When** `--apply --proposals <file>` runs
- **Then** `session-observe-state.json` lists `sess-1` under `observed` and `sess-2` under `attempts` with a count of 1, the report says one session was observed and one left unobserved, and the next `--collect` lists `sess-2` again
- **And given** the legacy bare-array proposals file (or plain `--apply` with no file), **then** every worklist session is claimed, exactly as before

### An unclaimed session expires after three unclaimed applies

- **Given** a session `sess-stuck` that stays in the worklist and is left unclaimed by three consecutive `--apply` runs using the object shape
- **When** the third apply completes
- **Then** `sess-stuck` is marked observed, its `attempts` entry is removed, and the report lists it under "expired unobserved"
- **And** after only two unclaimed applies it is neither observed nor expired — `attempts` reads 2 and it is still in the next worklist

### The loop never writes gated content directly under any classification

- **Given** a run producing at least one of each route (ungated, gated-convention, decision)
- **When** the run's write set is inspected
- **Then** every direct write lands under `.cortex/insight/` or `.cortex/pulse/`, and every `compass/`/`atlas/` change exists only as a pending, unaccepted `pulse/` proposal section

## Notes

- The session-observation *role* is preserved from v2's `insight-gaps`; only the v2 mechanism — the five-gap-signal framing (investigation load, misjudgment, user explanation, correction, memory-commit request) and its writes into `insight/map/` prose — is retired (design §8.3). v3's routing is by **type** (ungated observation / gated convention-or-rule / decision), not by the old five signals; there is no forced mapping between the two framings and this spec does not attempt one.
- **Resolved:** the atlas-decision proposal uses `**Type:** decision-candidate`, a new pulse-suggestion type added by the schema 3.0 addendum (§A7.4) specifically for this producer — additive to the v2.0 `**Type:**` enum (`rule-candidate | skill-proposal | promotion | gated-layer-update | user-directed-capture`, §4.5.1), parallel to `rule-candidate` in shape and fields but targeting `atlas/decisions/` instead of `compass/`. Neither `rule-candidate` (scoped to compass by convention) nor `promotion`/`gated-layer-update` (both about correcting or graduating *existing* gated/insight content, not proposing a fresh decision) fit this producer, hence the new value.
- **Resolved (previously OPEN):** the distil/session-observe non-double-proposal boundary named as "a spec-pass detail" by the v3 design (§9) is settled by schema §4.10.11 — there is no second mechanism to build. `insight/observations/`'s `sessions:` provenance trail (Rule 2) *is* the shared evidence surface: session-observe writes it per-session, and `cortex-pulse-distil` reads it alongside its own corpus scan as promotion evidence for exactly the same `rule-candidate`/`decision-candidate` gate (`pulse.distil`'s own spec owns the recurrence threshold it applies to that trail, which may differ from the SessionStart digest's display threshold, `hooks.session-start`). One evidence trail, one gate — this closes the boundary this spec previously left open.
- Journey-layer tests are expected to defer to v1.1 pending the test-runner loop, per the project-wide convention established for the v2 `insight-gaps` loop this draft succeeds.
