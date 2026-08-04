# Specflow — Overview

## What this is

Confidence that the product does what it should. The outcome is that every intended behaviour is specified, traceable from a user outcome all the way down to a test, and verified across layers — so changes don't quietly break promises.

## What it covers

**Outcomes written:**

- **The developer knows the specs and their tests stay sound — without checking** — daily structural and owed-tests reports, deferrals distinguished from gaps.

- **Spec work draws on everything the project already knows** — plans consult the map/rules/decisions first, generated tests enforce recorded conventions, problems land in the shared ledger.

- **Nothing is built before it is agreed, and nothing broken is called done** — an idea becomes an agreed spec, then a plan a fresh agent could execute, then code; a defect that resists five rounds stops the work instead of shipping.

- **Code the next person can work with, without review becoming a second gate** — tests decide correctness and block; craft review advises and does not, and feedback is verified before it is applied.

- **What someone specifically asked for is still pinned after the spec absorbs it** — a verbatim ask is anchored by a test, and the spec's own test is checked counterfactually before the anchor is retired.

- **A diagnosis names the cause, and a test proves the behaviour** — bugs are investigated before they are classified, and no test enters the suite that was never watched failing for the right reason.

_Planned outcomes (not yet written):_

- **Every intended behaviour written down** — what the product should do is captured, not assumed.
- **A clear line from outcome to test** — each promise can be traced to the check that proves it.
- **Verification across layers** — behaviour is confirmed at every level, not just spot-checked.
- **No silent broken promises** — when a change would break something intended, it's caught.

## Why it's grouped this way

This group exists because a product is only trustworthy if its intended behaviour is both written down and continuously proven. When every promise is traceable from a user outcome to a test and verified across layers, changes can be made without fear of quietly breaking something. That end-to-end confidence is the outcome that belongs here.

What deliberately does not belong here is the substance of any single feature — each capability's outcomes live in its own group. This group is the connective assurance that those outcomes are specified, traceable, and verified, not a home for the features themselves.

## Related groups

- Engineering specs that implement these outcomes: `../../specs/specflow/`
- The shared contract that makes traceability possible: `../schema/`
- The visible proof of structured understanding: `../constellation/`
- The self-maintaining behaviour that flags drift: `../pulse/`
