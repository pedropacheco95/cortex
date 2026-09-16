---
id: scaffolding.coverage-map
status: draft
depends_on:
  - hooks.session-start
  - insight.storage-format
implements: ../../specs-business/scaffolding/assistant-reaches-for-cortex-instead-of-guessing.business.md
governed_by:
  - R-001
---

# Coverage Map — the SessionStart payload says what Cortex holds

> **RETIRED at schema 3.4 fourth revision (2026-09-16), unbuilt.** Decision:
> `.cortex/atlas/decisions/2026-09-16-session-start-coverage-injection-retired.md`.
> The SessionStart coverage map this spec describes was specified in the 3.3 second
> revision and never implemented (`src/hooks/coverage-map.ts` never existed; the
> `governs:` list is removed because its targets do not). Its intent — the assistant
> knows what the project holds knowledge about — is delivered instead at the moment of
> need by `hooks.pre-read-writeback` Rule 6 (the PreRead recall marker),
> `hooks.search-annotate` (the search-time pointer), `recall.index-blocks` (the
> generated atlas index blocks) and `hooks.prompt-route` (open-thread routing), at zero
> cost when nothing matches. Schema §5 no longer carries the map, its budget or the
> concept-names widening; `hooks.session-start` Rule 10 is a retired stub. The idea is
> parked, not rejected — the decision's "Revisit when" names the reopening conditions
> and the re-run that would settle it. Rules and criteria below are retained verbatim as
> the design to reuse if it is reopened.

## Intent

The SessionStart payload currently tells Claude that Cortex exists and names its five modules.
Measured across 55 session transcripts of this project by `pulse.usage`: `cortex insight` was
invoked **2 times** in total, `concept` and `element` **0 times each**, module `_index.md` files
were read **once**, and one session invoked `cortex insight scopes` — a verb that has never
existed. Naming the drawers does not tell anyone whether their question is in one, and the guessed
verb is what "I don't know what's available" looks like from the outside.

This spec makes the payload carry a **coverage map** — the subjects the project actually holds
knowledge about, generated deterministically from frontmatter already on disk. Compass rules with
what they govern, atlas decisions, domain terms, observations, archive documents, and the concept
names the insight layer has already computed. It is a table of contents, never content: enough for
Claude to recognise that a question it is holding has a home, and go to the one small file that
holds it.

**Why the hook and not the CLAUDE.md block.** A hook computes fresh every session, so the map
cannot go stale and needs no `cortex sync` to refresh it — the block route would have required a
regeneration step and would have churned `CLAUDE.md` in git on every knowledge change. Schema §5's
payload text is also asserted by hook-spec tests rather than pinned verbatim by the validator, so
the map can evolve without a literal-for-literal schema edit each time.

## Entities

- **READS:** `.cortex/compass/rules/R-*.md` (frontmatter `id`, `title`, `governs`, `status`);
  `.cortex/compass/bugs/B-*.md` (count and open/resolved split only); `.cortex/compass/environment.md`,
  `preferences.md`, `do-not-repeat.md` (existence, for pointer lines); `.cortex/atlas/decisions/*.md`
  (date, title, `supersedes`); `.cortex/atlas/domain/*.md` (term name);
  `.cortex/atlas/stakeholders/*.md` (name and role); `.cortex/insight/concepts/*.md` (**concept
  name only**); `.cortex/insight/observations/*.md` (theme); `.cortex/archive/register.md`
  (document count); `.cortex/cortex.config.json` (module roster).
- **WRITES:** nothing on disk in the success path. On internal error it appends one structured
  entry to `.cortex/pulse/reports/hook-errors.md` (Rule 9).
- **CREATES:** nothing — the rendered map is a section of the SessionStart `additionalContext`
  payload owned by `hooks.session-start`.

## Rules

1. **The map is generated, never authored.** Every line derives from frontmatter or filenames
   already present under `.cortex/`. No line is hand-written per project, and nothing is inferred,
   summarised, or rephrased by a language model — deterministic Core (R-001). A field the source
   does not carry is omitted, never invented.

2. **Coverage, not content.** Each entry contributes at most a name, an identifier, and where
   applicable the scope it governs or the date it was taken — plus the path that holds it. The body
   of a rule, the reasoning of a decision, the definition of a term, and the text of an observation
   are never included. The map makes a question recognisable as covered and names the file that
   answers it; it answers nothing itself.

3. **Insight appears as concept NAMES only.** The insight layer's per-file entries (81 in this
   project) are never enumerated: they would dominate the payload, they grow linearly with the
   codebase, and the PreRead hook already delivers a file's purpose at read time. The `concepts/`
   directory is the grouping — 21 names here, growing sub-linearly. **Concept bodies are never
   injected**, and neither is any other inferred assertion. This is the exact and only widening of
   schema §5's insight-injection stance (see Notes): a concept *name* is a label, not a claim.

4. **Budget, and what happens past it.** The map is a **separately-budgeted** section of the
   payload — it is never counted against the pointer block's <100-token budget or the observations
   digest's ≤150. When the full rendering fits its own budget it is emitted whole; when it does
   not, categories collapse — in a fixed, documented order — from enumeration to a count-and-pointer
   line (`Decisions: 40 (.cortex/atlas/decisions/)`), never to silent truncation and never to a
   partial list that reads as complete. The collapse order is fixed so the same project always
   renders the same map: observations, then stakeholders, then domain terms, then decisions, then
   concepts. **Compass rules never collapse** — they bind writes, and a rule the assistant does not
   know about is the one failure this map must not produce. The budget value is an
   implementation-time engineering call (standing-authorities), recorded in Notes; the collapse
   *behaviour* is this contract.

5. **Absent modules degrade to silence, not to error.** A project with no `atlas/`, no `insight/`,
   or no `.cortex/` at all renders the map without those sections and without placeholder text
   announcing their absence. A module present but empty (a `rules/` directory holding only
   `_index.md`) contributes nothing rather than a zero-count line. The map of a project that holds
   nothing is omitted entirely, and the rest of the payload still renders.

6. **Retired and superseded entries are excluded.** A rule with `status: retired` is not listed
   (matching `hooks.pre-write` Rule 4 and `hooks.pre-read`'s rule-matching). A decision carrying
   `supersedes:` is listed; the decision it supersedes is not. Listing knowledge that no longer
   binds is worse than omitting it, because the map's whole value is that its claims are true.

7. **Deterministic ordering.** Entries within a category are ordered deterministically — rules and
   bugs by identifier, decisions by date descending, everything else alphabetically — so two
   sessions against an unchanged `.cortex/` render byte-identical maps.

8. **Computed fresh, never cached.** The map is rendered from disk each time the hook fires. There
   is no stored artefact, no staleness window, and no refresh command: adding a rule, a decision, a
   domain term, or a concept is reflected in the very next session with no `cortex sync` in
   between. This is the property the hook placement was chosen for.

9. **Warn-never-block, self-applied.** Any internal error — unreadable directory, unparseable
   frontmatter, malformed config — degrades to omitting the affected category (or the whole map),
   appends a structured entry to `.cortex/pulse/reports/hook-errors.md`, and exits 0. The hook never
   exits 2, never exits non-zero, never throws to the runner, and never blocks a session from
   starting. A failure to render coverage must never be worse than having no coverage.

## Acceptance Criteria

### The map names rules with what they govern

- **Given** a project whose `.cortex/compass/rules/` holds `R-001-core-no-llm-calls.md` with
  `title: Core makes no LLM calls` and `governs: ["src/**/*.ts"]`
- **When** the SessionStart hook renders its payload
- **Then** the payload contains a line naming `R-001`, its title, and `src/**/*.ts`
- **And** the line contains no text from the rule's body

### Concept names are listed; per-file entries and concept bodies are not

- **Given** a project with 21 files in `.cortex/insight/concepts/` (including `hook-safety.md`)
  whose bodies describe each concept, and 81 per-file entries under `.cortex/insight/anatomy/`
- **When** the SessionStart hook renders its payload
- **Then** the payload contains `hook-safety`
- **And** contains no path under `insight/anatomy/` and no prose from any concept file's body

### A retired rule is excluded

- **Given** `.cortex/compass/rules/` holding `R-001` with no `status` field and `R-009` with
  `status: retired`
- **When** the payload is rendered
- **Then** `R-001` appears and `R-009` does not

### Over-budget rendering collapses in the fixed order, keeping rules whole

- **Given** a project whose full map would exceed its budget, holding 3 rules, 40 decisions, and
  60 observations
- **When** the payload is rendered
- **Then** all 3 rules are listed individually
- **And** observations collapse to a count-and-pointer line before decisions do
- **And** no category is emitted as a partial list without its count

### The map is separately budgeted from the pointer block and the digest

- **Given** a project whose coverage map renders at 1,200 tokens
- **When** the payload is rendered
- **Then** the pointer block is still complete and the observations digest is still present
- **And** neither is trimmed to make room for the map

### An absent module contributes nothing, and the rest of the payload still renders

- **Given** a project with `.cortex/compass/` populated and no `.cortex/atlas/` directory at all
- **When** the payload is rendered
- **Then** the payload contains the compass entries, the pointer block, and any hygiene line
- **And** contains no atlas section and no text announcing that atlas is missing

### The payload reflects `.cortex/` at the moment the hook fires, with no sync step

- **Given** a project whose previous session rendered a map without `atlas/decisions/2026-08-05-x.md`
- **When** that decision file is added and a new session starts, with no `cortex sync` run in between
- **Then** the very next payload names that decision

### Rendering is byte-stable across sessions

- **Given** any project with a populated `.cortex/`
- **When** the payload is rendered twice without modifying `.cortex/`
- **Then** the two maps are byte-identical

### A malformed source degrades to silence plus a logged error

- **Given** `.cortex/atlas/decisions/broken.md` whose frontmatter does not parse
- **When** the payload is rendered
- **Then** the hook exits 0, the rest of the map renders, and one structured entry is appended to
  `.cortex/pulse/reports/hook-errors.md`

## Notes

- **Why this replaces awareness rather than adding to it.** The payload already said "Modules:
  compass, atlas, archive, insight, pulse" and it demonstrably changed nothing — it was injected in
  all 55 measured sessions. The failure was not that Claude did not know Cortex existed; it was that
  a module roster gives no basis for predicting whether a question has an answer, so grepping stayed
  the rational move (76 searches into `.cortex/` against 2 CLI invocations). Coverage is the
  smallest thing that changes that calculus.
- **Cost framing.** At this project's size the full map is roughly 1.5k tokens: ~42 curated entries
  plus 21 concept names. One unrelated source file read costs more than that (`src/hooks/pre-read.ts`
  alone is ~2,532 tokens by the insight layer's own count). The map is cheaper than the mistake it
  prevents.
- **Schema §5 amendment (the doctrinal one).** §5 held that insight is "pull-only via the CLI" and
  that the observations digest was "not a precedent for injecting the rest of insight", because
  injecting inferred content would "spend the trust budget on the layer with the weakest trust
  warrant". That stance's premise — that pull works — was falsified by measurement: 2 invocations in
  55 sessions, 0 for the two verbs the stance was protecting, and a guessed verb that does not
  exist. The amendment is narrow by construction: **names only, never bodies, never per-file
  entries** (Rule 3), so no inferred *assertion* is injected and the trust argument stays intact for
  everything it was actually protecting. Recorded in `.cortex/atlas/decisions/`.
- **Deliberately not done:** no search or lookup verb, and no question-answering surface. Both were
  designed during the brainstorm that produced this spec and held back pending `pulse.usage`
  evidence on whether coverage alone changes behaviour. `cortex insight ask` remains forbidden by
  `insight.cli` Rule 7 and deferred by design §11; nothing here relaxes that.
- **OPEN:** the budget value (Rule 4). An engineering call to be recorded at implementation.
- **Steps 3 and 4 of the recall work (2026-09-15/16) deliver the coverage content another way.**
  The PreRead marker (`hooks.pre-read-writeback` Rule 6), the search-time pointer
  (`hooks.search-annotate`), the generated atlas index blocks (`recall.index-blocks`) and the
  open-thread prompt router (`hooks.prompt-route`) surface what is decided, measured and open
  about the thing a session is reading, searching or asking about — at the moment of the read,
  search or prompt, at **zero session-start cost**, from the compiled recall index.
- **Retired 2026-09-16.** This spec's SessionStart map (≤1,800 tokens on every session) was never
  built; Pedro approved removing it from schema §5 and retiring this spec (banner above). `status`
  stays `draft` because the dev-spec status enum (§4.6) has no retired value — the banner is the
  project's retirement marker, as for the `anatomy/` specs. The reopening conditions and the
  experiment that would settle it are in the decision file.
