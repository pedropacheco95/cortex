# Reporting: what you require, and what you send

## What you require from a session

Every report of finished work must carry, without being asked:

1. **What ran, and what did not.** Named.
2. **What is claimed on someone else's word.** A heading, *Claimed by X, NOT re-verified by
   me*, with a reason per item.
3. **The commit it ran against.** A report that does not say what it ran against is not
   evidence.
4. **Expectation separated from observation.** "I expect this to pass and I have not seen
   it pass" is the correct shape.
5. **Every contract clause touched:** each validator, schema or spec change, audited against
   the diff (RULES.md rule 19).

## What you require *before* a result exists

For anything that gates a decision, require the reading rule **in advance**: what green
means, what red means, and what the surprising outcome would mean. A limitation written
after a green has been negotiated with the green.

## Stop and tell

A session must stop and tell you, rather than push through, when:

- a result is red for a reason that is not the reason it was testing;
- a fix would need small print to explain;
- the item turns out to be wrong, or smaller, or larger than written;
- the work would contradict a recorded owner decision.

Make it explicit that stopping is cheap and that you will back it.

## What you send a session

Short. Decision first. Reasoning only where it changes what they do.

Name what they did well **specifically and briefly**, especially when they corrected you or
retracted their own claim. Keep it to a line.

## What you send the owner

**Decision first, then the evidence, then everything else.** The ordering principle is *what
changes the answer*, not what is most rigorous.

- **Name defects the way the people affected would describe them**, not as a count.
- **Say what is not verified**, and say plainly when a recommendation is something the repo
  cannot enforce.
- **Answer the question they will actually ask**: if this goes wrong, what is the way back?
- **Carry your own corrections upward**, promptly, before they become load-bearing.

## When the owner asks "status?"

One message, in this order, and short; the owner reads it on a phone:

1. **Headline:** the round you are on out of how many, and one ETA for the whole run.
2. **One table, one row per session:**

   | Session | Doing | % | ETA |
   |---|---|---|---|
   | Core | `cortex check` rule (b); tests written, implementing | 80% | 20 min |

   "Doing" is the item and the concrete step. An idle session says `idle` and why. The
   percentage is your estimate of that item.
3. **Blocked on the owner**, only if something is: one line each, with exactly what you need.
4. **Anything they should know that doesn't fit above**, at most two lines.

Nothing else. Give real ETAs and correct them next time if they slip.

## Keeping the record

Keep one plan file per run in `drafts/`, with a timestamped line per event and every decision
marked. Write the reasoning, not just the outcome: the next coordinator inherits an argument,
not a verdict.

`drafts/` is gitignored, so anything that must outlive the machine belongs in `cortex/`
(tracked) or in this skill, with client names kept out.
