---
id: discipline.hardening-convention
status: implemented
depends_on: []
implements: ../../specs-business/discipline/the-developer-can-trust-done.business.md
governed_by: []
governs:
  - "skills/_conventions/**"
---

# The hardening convention — Iron Law, rationalization table, HARD-GATE

## Intent

One canonical authoring recipe so every hardened skill in this repo is grafted the same way
(plan §3 item 1.2, glossary §2). Without it, each graft invents its own wording and the
mechanism degrades into decoration: an Iron Law that hedges, a rationalization table that lists
excuses nobody actually makes, a gate with no anti-pattern paragraph.

The convention is a reference document, not a skill: `skills/_conventions/hardening.md` carries
no `SKILL.md`, so Claude Code does not register it as an invocable skill. It ships with the
package so that hardened skill bodies referencing it resolve in installed projects too.

## Entities

- **READS:** nothing at runtime. It is read by a human or agent authoring or hardening a skill.
- **WRITES:** nothing.
- **CREATES:** `skills/_conventions/hardening.md` (and its installed copy under
  `.claude/skills/_conventions/`).

## Rules

1. **Three patterns, one file.** The document defines exactly three transplantable patterns —
   **Iron Law**, **rationalization table**, and **HARD-GATE** — each with its purpose, its
   required shape, a worked example, and the failure mode it prevents.
2. **The Iron Law shape is fixed.** One imperative, inviolable line in capitals at the top of
   the skill, followed by the letter-and-spirit clause. No hedging modifiers ("usually",
   "where practical") — a hedged Iron Law is not an Iron Law.
3. **The rationalization table shape is fixed.** A two-column Markdown table with the headers
   `Thought/Excuse` and `Reality`. Rows list excuses an agent actually generates under
   pressure — not strawmen — each answered. The convention states the authoring test: if you
   have never seen an agent (or yourself) make the excuse, it does not belong in the table.
4. **The HARD-GATE shape is fixed.** An explicit "do NOT proceed past X until Y" block plus the
   "this one is too simple to need the gate" anti-pattern paragraph, which is the excuse that
   defeats every gate that lacks it.
5. **The convention is referenced, not duplicated.** A hardened skill points at
   `skills/_conventions/hardening.md` rather than restating the recipe; the skill carries its
   own instantiated Iron Law and table, not the meta-explanation of them.
6. **Not a skill directory.** `skills/_conventions/` contains no `SKILL.md` and declares no
   frontmatter skill metadata; it is a shipped reference directory that sits alongside the
   bundles.

## Acceptance Criteria

### The three patterns are each defined with a shape and a worked example

- **Given** `skills/_conventions/hardening.md`
- **When** it is read
- **Then** it contains a section for each of Iron Law, rationalization table, and HARD-GATE,
  and each names its required shape and shows a worked example

### The rationalization-table headers are pinned

- **Given** the convention document
- **When** its rationalization-table section is checked
- **Then** it pins the two-column form with the headers `Thought/Excuse` and `Reality`

### The HARD-GATE carries the too-simple anti-pattern

- **Given** the convention document
- **When** its HARD-GATE section is checked
- **Then** it requires the "too simple to need this gate" anti-pattern paragraph and explains
  why the gate fails without it

### It is not registered as a skill

- **Given** the shipped package
- **When** `skills/_conventions/` is inspected
- **Then** it contains no `SKILL.md`, and a fresh `cortex init` still installs the directory so
  references from hardened skill bodies resolve in the installed project

## Notes

- Engineering call recorded per standing authorities: the convention ships inside `skills/`
  rather than a repo-only docs path, because hardened skill bodies reference it by path and
  those bodies are installed into user projects. `installSkills` copies every directory under
  the package `skills/` dir, so no Core change was needed — the count pins in
  `tests/spec/specflow/awareness.test.ts` absorb the extra directory instead.
- The plan's §0 "Cut" removed a general `writing-skills` authoring discipline. This convention
  is deliberately narrower: it is the graft recipe for three named mechanisms, not a theory of
  skill authoring.
