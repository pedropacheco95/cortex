---
id: insight.session-observe
status: implemented
depends_on:
  - insight.extract-skill
  - insight.storage-format
  - provenance.frontmatter-check
implements: ../../specs-business/insight/assistant-understands-codebase.business.md
governed_by:
  - R-001
governs:
  - "src/insight/session-observe.ts"
  - "skills/cortex-loop-session-observe/**"
---

# Session-Observe Loop — the v3 successor to insight-gaps

## Intent

`cortex-loop-session-observe` reads the shared Claude Code session-transcript corpus (the same corpus `cortex-pulse-distil` reads) and infers durable knowledge from how a session actually went — corrections the user made, gotchas hit, non-obvious behaviour discovered, patterns established (v3 design §9). It is the re-homed successor to v2's `cortex-loop-insight-gaps`: the session-observation *role* survives, but the mechanism is refocused from v2's five-gap-signal framing to **type routing**. Ungated codebase observations enrich the relevant insight per-file entry **directly** — insight is machine-owned and ungated (RULES 7's machine-owned-ungated allowance, the same basis as `insight.refresh-loops`) — carrying `claude-sessions/<user>/<id>` provenance (schema addendum A6). Gated conventions/rules are proposed to **compass** and decisions to **atlas**, both through the pulse gate (human-reviewed, RULES 7), reusing the salvaged v2 typed pulse-gate/promotion machinery (design §8.2).

## Entities

- **READS:** the shared session-transcript corpus (this project's recent Claude Code sessions, coordinated with `cortex-pulse-distil`'s corpus machinery and the read-time purpose capture folded into insight extraction metadata, design §5.10); existing per-file insight entries under `anatomy/`/`scopes/<scope>/anatomy/` (to locate the right `## Insights`/`## Query pointers` target and to avoid duplicate enrichment); `pulse/dismissed.md` (suppression); `pulse/.suggestion-counter`; `cortex.config.json`.
- **WRITES:** the `## Insights` and `## Query pointers` sections of existing per-file insight entries (direct rewrite/append, never touching `## Purpose`, `## Main players`, or `## File map`, which are extraction-owned); `pulse/session-observe.md` (its report, plus `rule-candidate`/decision-proposal sections carrying S-ids from the shared counter); `pulse/.suggestion-counter`; the transient session corpus. Never `compass/`, `atlas/`, or `RULES.md` directly.
- **CREATES:** typed pulse proposal sections per schema §4.5.1 (as amended for v3 target roots — compass replacing cerebrum).

## Rules

1. **Collect → classify → route, mirroring the shared-corpus idiom.** The loop reads the session corpus (shared machinery with `cortex-pulse-distil`) and classifies each candidate observation into exactly one of three routes: an ungated codebase observation, a gated convention/rule, or a decision.
2. **Ungated codebase observations enrich insight directly (design §9, addendum A7.3).** These land as appends or targeted rewrites in the relevant per-file entry's `## Insights` (non-obvious observations, quirks, conventions the file exemplifies) or `## Query pointers` (intent-scoped "if you need to X, also read Y" guidance) section — never in `## Purpose`, `## Main players`, or `## File map`, which belong to extraction (`insight.extract-skill`) and would be silently clobbered by a differently-scoped writer if this loop touched them. Every write carries `claude-sessions/<user>/<id>` provenance (schema addendum A6.1) so the enrichment traces back to the session that produced it.
3. **Gated conventions/rules are proposed to compass, never written directly.** A candidate that names a project convention or rule (something that should bind future work, not just describe the current file) is emitted as a typed `pulse/` proposal targeting `.cortex/compass/` — reusing the existing `rule-candidate` suggestion type and its append payload shape (schema §4.5.1, re-rooted cerebrum→compass by the v3 addendum, A0.1/A1). It is never written to `compass/` directly by this loop.
4. **Decisions are proposed to atlas, never written directly.** A candidate that captures a decision (the reasoning behind a choice, not just an observable convention) is emitted as a typed `pulse/` proposal with `**Type:** decision-candidate` (schema addendum §A7.4 — additive to the v2.0 enum, parallel to `rule-candidate` but targeting `atlas/decisions/` instead of `compass/`) targeting `.cortex/atlas/decisions/`. It is never written to `atlas/` directly by this loop.
5. **Never mutate gated content directly (RULES 7, the loop-write invariant).** The loop's only direct writes are to `.cortex/insight/` per-file entries (Rule 2) and to `pulse/`. Every `compass/` or `atlas/` change is a human-reviewed typed proposal, with no exception.
6. **Boundary with `cortex-pulse-distil` (design §9).** Distil mines **cross-session repetition** into rule candidates over a wider window; session-observe captures **in-context, per-session** observations from how one session went. Both read the same corpus at a different altitude. Coordination prevents double-proposing the same pattern: a pattern this loop has already enriched into an insight entry is treated by distil's already-covered filter as a candidate for a `promotion`-style reference to the insight content rather than a fresh independent rule candidate (mirroring the v2 gaps/distil coordination, v2 design §6) — the precise mechanism (a shared already-covered index, or distil reading this loop's provenance trailers) is this spec's implementation detail, but the outcome (no double-proposal) is the contract.
7. **S-ids and suppression are the existing shared machinery.** Proposal S-ids are acquired from the shared `pulse/.suggestion-counter` (global, monotonic, never reused, schema §4.5). A previously-dismissed candidate (matched via `pulse/dismissed.md`, unexpired) is not re-proposed.
8. **Deterministic Core bookends (R-001).** Corpus collection is pure file I/O and runs in Core (or a Core-adjacent deterministic step, same convention as distil's collect half); only the classification/routing judgment and the enrichment-text drafting are LLM work, never inside Core.

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

### A gated convention becomes a compass-targeted proposal, never a direct write

- **Given** a session where the user established "all new API routes must validate input with the shared schema validator" — a rule that should bind future work, not just describe one file
- **When** the loop classifies this as gated and routes it
- **Then** `pulse/session-observe.md` gains an `S-NNN` section with `**Type:** rule-candidate` and `**Target:**` under `.cortex/compass/`
- **And** `.cortex/compass/` itself is unchanged — the gate applies it, not this loop

### A decision becomes an atlas-targeted proposal, never a direct write

- **Given** a session where the user explained why the team chose polling over webhooks for a specific integration, with reasoning worth preserving as a decision record
- **When** the loop classifies this as a decision and routes it
- **Then** `pulse/session-observe.md` gains an `S-NNN` section with `**Type:** decision-candidate` targeting `.cortex/atlas/decisions/`, carrying the reasoning and session provenance
- **And** no file under `.cortex/atlas/` is modified directly

### A dismissed candidate is not re-proposed

- **Given** `pulse/dismissed.md` holds an unexpired entry for a suggestion matching a candidate the loop would otherwise propose again
- **When** the loop runs
- **Then** the matching candidate is skipped and no new `S-NNN` section is created for it

### Distil and session-observe do not double-propose the same pattern

- **Given** an observation this loop already enriched into `insight/anatomy/src/billing/retry.ts.md`'s `## Insights` section, and the same pattern recurring across multiple sessions in distil's wider window
- **When** distil's already-covered filter runs over the same corpus
- **Then** distil does not independently propose a fresh `rule-candidate` for the already-enriched pattern — it either skips it or references the existing insight content, and only one of the two loops produces a live proposal for it

### The loop never writes gated content directly under any classification

- **Given** a run producing at least one of each route (ungated, gated-convention, decision)
- **When** the run's write set is inspected
- **Then** every direct write lands under `.cortex/insight/` or `.cortex/pulse/`, and every `compass/`/`atlas/` change exists only as a pending, unaccepted `pulse/` proposal section

## Notes

- The session-observation *role* is preserved from v2's `insight-gaps`; only the v2 mechanism — the five-gap-signal framing (investigation load, misjudgment, user explanation, correction, memory-commit request) and its writes into `insight/map/` prose — is retired (design §8.3). v3's routing is by **type** (ungated observation / gated convention-or-rule / decision), not by the old five signals; there is no forced mapping between the two framings and this spec does not attempt one.
- **Resolved:** the atlas-decision proposal uses `**Type:** decision-candidate`, a new pulse-suggestion type added by the schema 3.0 addendum (§A7.4) specifically for this producer — additive to the v2.0 `**Type:**` enum (`rule-candidate | skill-proposal | promotion | gated-layer-update | user-directed-capture`, §4.5.1), parallel to `rule-candidate` in shape and fields but targeting `atlas/decisions/` instead of `compass/`. Neither `rule-candidate` (scoped to compass by convention) nor `promotion`/`gated-layer-update` (both about correcting or graduating *existing* gated/insight content, not proposing a fresh decision) fit this producer, hence the new value.
- **OPEN:** the exact mechanism proving the distil/session-observe non-double-proposal boundary (a shared already-covered index keyed on insight provenance, vs. distil parsing this loop's `claude-sessions/*` trailers) is named as "a spec-pass detail" by the v3 design (§9) and is not resolved here; the acceptance criterion above asserts the outcome (no double-proposal), not the mechanism.
- Journey-layer tests are expected to defer to v1.1 pending the test-runner loop, per the project-wide convention established for the v2 `insight-gaps` loop this draft succeeds.
