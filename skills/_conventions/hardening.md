# Skill hardening conventions

The graft recipe for three mechanisms that make a skill hold under pressure: the **Iron Law**,
the **rationalization table**, and the **HARD-GATE**. Every hardened skill in this repo is
built from this file. Reference it from the skill; do not restate it there.

Governed by `.specflow/specs/discipline/hardening-convention.spec.md`.

## Why these three

A skill fails in production not because the agent disagrees with it, but because three hours
into a task, with an obvious-looking change in hand, the agent generates a plausible reason to
skip a step. The reasons are predictable and finite. These three patterns exist to name them
in advance and answer them, so the agent meets a written rebuttal instead of its own
improvisation.

---

## 1. Iron Law

**Shape.** One imperative line, in capitals, at the very top of the skill body — before any
workflow, any context, any preamble. Immediately after it, the letter-and-spirit clause.

**Required form:**

```
## The Iron Law

NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST

Violating the letter of this law is violating the spirit. If you find yourself constructing a
reading under which this does not apply to your case, that construction is the violation.
```

**Rules.**

- Exactly one line, one rule. A skill with three Iron Laws has none.
- No hedging modifiers — no "usually", "where practical", "unless the change is small".
  A hedged Iron Law is not an Iron Law; it is a suggestion with a loud font.
- State it as a prohibition, not an aspiration. `NO X WITHOUT Y` beats `always do Y before X`:
  the prohibition form has no gradient to slide down.
- The letter-and-spirit clause is not optional. Without it, the law is defeated by reading
  rather than by disobedience, which leaves no trace in the transcript.

**Failure mode it prevents.** Loophole-lawyering — the agent obeys a narrowed reading of the
rule it constructed itself, and reports compliance in good faith.

---

## 2. Rationalization table

**Shape.** A two-column Markdown table with exactly these headers:

```
| Thought/Excuse | Reality |
|---|---|
| "This change is too trivial to test." | Trivial changes are where untested assumptions hide. The test costs a minute; the assumption costs a day. |
| "The tests passed earlier." | Earlier was before your edit. You have evidence about a state that no longer exists. |
| "I'll verify everything at the end." | The end is where verification gets cut for time. Verify at the boundary you are crossing now. |
```

**Rules.**

- Rows are excuses an agent **actually generates**. The authoring test:
  if you have never seen an agent — or yourself — make this excuse, it does not belong in the
  table. Strawmen dilute the real rows and teach the reader to skim.
- Write the excuse in the first person, in quotes, in the voice it arrives in. The agent has to
  recognise its own thought to be stopped by it.
- The rebuttal is a fact, not a scolding. It should end the argument, not moralise about having
  had it.
- Three to eight rows. Fewer misses the common cases; more stops being read.
- Every hardened skill gets one. This table is the actual enforcement engine — the Iron Law
  states the rule, the table is what defends it.

**Failure mode it prevents.** Pressure-driven improvisation — the agent invents a
justification in the moment and, having invented it, believes it.

---

## 3. HARD-GATE

**Shape.** An explicit stop block at the point in the workflow where proceeding early is the
expensive mistake, plus the too-simple anti-pattern paragraph.

**Required form:**

```
## HARD GATE

Do NOT proceed to implementation until the design is approved.

**"This one is too simple to need the gate."** That thought is the gate's most common failure
mode, and it is wrong in the same way every time: simplicity is a property of the solution you
have already assumed, not of the problem. If the task were genuinely simple, satisfying the
gate costs one message. If it is not, the gate just saved the work. Either way you pass
through it — you do not step around it.
```

**Rules.**

- Name the exact boundary and the exact condition: *what* must not start, *until what* has
  happened. "Get approval first" is not a gate; "do NOT write code until a spec exists" is.
- The too-simple anti-pattern paragraph is mandatory. It is the single excuse that defeats
  gates, and a gate without it is defeated on its first easy-looking task.
- A gate must be cheap to satisfy when the work really is simple. If passing the gate costs
  more than the work it protects, the gate will be skipped and the skill discredited.

**Failure mode it prevents.** Gate erosion — the gate holds for hard tasks and is quietly
skipped for easy ones, until "easy" covers everything.

---

## Grafting checklist

When hardening an existing skill:

1. Check for a governing spec (`.specflow/specs/<domain>/*.spec.md`). If the graft changes the
   skill's contract or acceptance criteria, update the spec **first**.
2. Add the Iron Law at the top of the body, with its letter-and-spirit clause.
3. Add the rationalization table near the mechanism it defends, not in an appendix.
4. Add a HARD-GATE only where there is a real boundary worth stopping at. Gates everywhere
   means gates nowhere.
5. Add a worked example in the skill body showing the mechanism firing on a realistic case.
6. Reference this file; do not restate the recipe.
7. Copy the whole bundle directory to `.claude/skills/` — the mirror is test-enforced and
   compares file sets and bytes, not just `SKILL.md`.
8. Do not reflow the grafted lines across line breaks. The skill tests regex-match the Iron Law
   line and the table headers on a single line.
