# Compass rules — index

**Read this when:** you are about to write or edit files under `src/` or `specs/`, or the user asks why a convention exists.

**What's here:** one file per rule (R-NNN). Currently: `R-001` — Core makes no LLM calls (governs all `src/` Core dirs, regex predicate over SDK imports); `R-002` — bug ledger entries use the seven-type taxonomy; `R-003` — dev spec `implements:` is singular, never a list.

**How to navigate:** match a write's path against each rule's `governs:`; follow `source:` to the design/schema docs that justify it; `related_specs:` names the specs it touches. Rules with `check:` predicates are enforced at write time by the PreWrite hook — only when the predicate fires.
