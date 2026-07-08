---
id: decision.2026-07-07-decisions-single-home-atlas
title: Atlas is the single home for decisions; the duplicate cerebrum/decisions.md is removed
date: 2026-07-07T12:00:00Z
sources:
  - ../sources/cortex-v3-reframe.md
---

# Atlas is the single home for decisions

On 2026-07-07 we chose to make **atlas the single home for decisions**
(`atlas/decisions/`) and to **remove the duplicate `cerebrum/decisions.md`**
that v1 carried. v1 justified the duplicate as "the same data, two views," but
that framing accumulates drift. Compass (the renamed cerebrum) in the new
architecture holds **no decisions** — only rules, conventions, and bugs.
**Compass rules that derive from atlas decisions cite them via provenance**
(`derives_from: atlas/decisions/<...>.md`) rather than restating them.

We chose this because two homes for the same decision data inevitably drift out
of sync; one canonical home plus provenance links gives compass everything it
needs without duplication.

See source: atlas/sources/cortex-v3-reframe.md ("The five-module architecture" —
"One v1 cleanup carried into v2", "Provenance").
