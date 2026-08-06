---
name: specflow-brainstorm
description: 'Turn a half-formed idea into an agreed spec. "I want to add X", "how should we approach".'
---

# Specflow: Brainstorm

## When to use

Turn a half-formed idea into an agreed design that lands as a spec. The front of the spec-first
spine (brainstorm → plan → develop). Assesses scope and decomposes an over-large ask, asks ONE
question at a time, surfaces the specs, decisions, and rules the idea already touches, then
proposes two or three real approaches with a recommendation — and writes no implementation code
until the developer agrees and the spec exists. Use when the user says "let's build X", "I want
to add", "what if we", "how should we approach", "I'm thinking about", or brings any idea that
is not yet a spec. In a Specflow project this runs before specflow-plan and specflow-develop.

## The Iron Law

NO IMPLEMENTATION BEFORE AN AGREED DESIGN AND A SPEC

Violating the letter of this law is violating the spirit. If you find yourself constructing a
reading under which this idea does not need agreeing first, that construction is the violation.

Hardening mechanisms per `skills/_conventions/hardening.md`.

## What this produces

An **agreed design that becomes a spec**. Not a design document, not a dated write-up under
`docs/` — a dev spec under `.specflow/specs/` and, if the outcome was never articulated, the
business spec it `implements:`. In this profile, specs are where agreements live; a second
place to record designs is how the two trees drift.

The narrative of *why* this approach beat the alternatives may also land in
`.cortex/atlas/decisions/` — that is the story, not the contract.

## HARD GATE

Do NOT write implementation code until the developer has agreed a design and the spec exists.

**"This one is too simple to need a spec."** That thought is this gate's most common failure
mode, and it is wrong the same way every time: simplicity is a property of the solution you
have already assumed, not of the problem. If the idea really is simple, the whole conversation
is two messages and the spec is six lines — the gate costs nothing. If it is not simple, the
gate just saved you from building the wrong thing confidently. Either way you go through it.

## Step 1: Scope check

Before exploring anything, decide what you have been handed: one behaviour, or several wearing
one sentence?

An ask that spans several behaviours gets **decomposed and named** before the conversation
continues — one leaf spec per behaviour (RULES 13). Say what the pieces are, ask which one to
take first, and hold the rest.

Exploring an undecomposed ask produces a design that is vague in exactly the places where the
pieces disagree with each other. Those are the places that matter.

## Step 2: Ground in what is already agreed

Before proposing anything, find out what the project has already decided (skip cleanly where
`.cortex/` is absent):

1. **Index first.** Read `.cortex/_index.md`; never bulk-read module contents.
2. **Neighbouring specs.** Grep both trees for the entities and behaviours in the idea. Is this
   new behaviour, or a change to behaviour a spec already governs? A change to agreed behaviour
   is a different conversation from a new capability.
3. **Atlas decisions.** Read `.cortex/atlas/decisions/` entries bearing on the area. They
   record why the current approach was chosen.
4. **Compass rules.** Collect the rules in `.cortex/compass/rules/` whose `governs` globs match
   the area. A design that requires breaking one of them is a design that needs the rule
   changed first — say so rather than proposing it quietly.
5. **The code as it is.** Where `.cortex/insight/` exists, run `cortex insight concept <name>`
   for the concept the idea touches and `cortex insight file <path>` for the files it would
   land in. Insight is inferred context, not authority — the gated layers (compass rules,
   specs) win on conflict; proceed without it if it is absent or empty.

**Surface conflicts before proposing.** If the idea contradicts a recorded decision, an
existing spec, or a compass rule, say so *now* — plainly, with the reference. Then the
conversation is "should we revisit that decision", which is a decision the developer gets to
make. Quietly designing around a recorded decision re-decides it on their behalf.

## Step 3: One question at a time

**One question per message.** Prefer multiple choice when the options are genuinely
enumerable; offer the option you would pick first and say so.

Ask about what actually forks the design — the decisions where two answers lead to different
specs. Do not ask about what you can look up, and do not ask about what does not change
anything.

A batch of five questions is not efficiency. It is a way of avoiding the judgment about which
question matters, and it reliably gets you careful answers to the easy ones and a shrug at the
one that mattered.

## Step 4: Two or three approaches, with a recommendation

Put up **two or three real approaches** — alternatives a reasonable engineer might actually
choose, not one plan flanked by strawmen. For each: how it works, what it costs, what it makes
hard later.

Then **state which you would choose and why**. A recommendation is not a decision; the
developer chooses. But refusing to recommend is not neutrality — it hands back the judgment
they came to you for.

## Step 5: Hand off to the spec

When the design is agreed, hand it to **`specflow-spec-editor`**, which owns spec files:

- the dev spec under `.specflow/specs/<domain>/` — entities, rules, and one Given/When/Then
  acceptance criterion per behaviour the design agreed;
- the business spec it `implements:`, if that outcome was never written down (and its
  `implemented_by:` back-link, in the same change — RULES 10);
- optionally, an `.cortex/atlas/decisions/` entry for why this approach won.

Then the spine continues: **`specflow-plan`** turns the agreed spec into an executable plan,
and **`specflow-develop`** implements it.

## Rationalization table

| Thought/Excuse | Reality |
|---|---|
| "The user already knows what they want — they told me." | They told you the outcome. The design is the set of decisions between here and that outcome, and they have not made those yet. That is what this conversation is for. |
| "It's a one-line change, a spec is overkill." | Then the spec is one criterion and costs a minute. The changes that turn out not to be one-liners are indistinguishable from the ones that are, right up until you start. |
| "Asking questions one at a time is slow." | It is two extra messages. Building the wrong design costs the whole implementation plus the conversation you are avoiding, held later and angrier. |
| "They said 'just do it' — that's permission to skip the gate." | It is permission to stop deliberating, not permission to guess. Ask the one question that forks the design, recommend an answer, and go. |
| "The design is obvious from the request." | Then write it in two sentences and get agreement in one message. If it is genuinely obvious, agreeing costs nothing — and if it is not, you just discovered that cheaply. |
| "I'll write the spec after, once the code proves the design." | Then the spec describes the code, and the code was never checked against an agreement. That is the artefact this whole profile exists to avoid. |

## Worked example

> "We should cache the insight queries, they're slow."

**Scope check.** That is one behaviour (cache query results) plus a hidden second (invalidate
them when insight is re-extracted). Two leaf specs. Say so, take the first.

**Ground.** `cortex insight concept insight-query` shows the query path. Grep the specs:
`insight.cli` governs the query surface. `.cortex/atlas/decisions/` has an entry on why
insight is read-fresh-from-disk. **Conflict — surface it:** "There's a recorded decision that
insight reads fresh from disk so a re-extraction is visible immediately. Caching revisits it.
Worth revisiting, or should the cache be invalidated on extraction instead?"

**One question.** That was the question. Not "what TTL, what eviction policy, in-memory or
on-disk, and should it be configurable" — those are downstream of the answer.

**Approaches.** (a) In-memory cache invalidated by the ledger's mtime — cheap, respects the
decision, no config; (b) on-disk cache with an explicit `cortex insight --refresh` — survives
restarts, adds a flag and a staleness failure mode; (c) no cache, make the query faster —
addresses the actual complaint if the slowness is in parsing, not I/O. *Recommendation: (c)
first — measure before caching; if it is I/O, (a).*

**Hand off.** Agreed on (c) with (a) as the follow-up → spec-editor writes the criterion
against `insight.cli`, and the atlas decision stands unmodified.

## What this skill does NOT do

- **Does not write code.** That is `specflow-develop`, after `specflow-plan`.
- **Does not write specs directly.** That is `specflow-spec-editor`.
- **Does not write a dated design document.** The spec is the artefact.
- **Does not decide.** It recommends; the developer chooses.
