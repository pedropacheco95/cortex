---
id: anatomy.contributor-gets-a-legible-codebase
status: draft
implemented_by:
  - ../../specs/anatomy/scanner.spec.md
---

# A contributor gets a codebase Claude can read without manual documentation

## Outcome

When this works, a developer can point Cortex at a codebase and — without writing a single document — get a map where every file has a plain-language purpose, a size estimate, and links to the specs that govern it. Claude, and any teammate, can then understand what each file is for and how the files connect, without reading the whole codebase or relying on knowledge that lives only in someone's head.

## Who this is for

Developers and freelancers picking up, maintaining, or handing over a codebase — and the AI assistant working alongside them, which uses the map to stay grounded and to avoid reading files it doesn't need.

## User Journey

1. A developer sets Cortex up on a codebase.
2. Cortex reads the code and builds a map: what each file is for, how big it is, and which specs govern it.
3. The map keeps up as files change — nobody hand-writes or hand-updates documentation.
4. When the developer or Claude needs to understand a file, the map answers in a line instead of requiring a full read.

## Business Rules

1. The map is built from the code itself — no manual documentation step is required.
2. Files the developer has excluded (build output, dependencies, generated files) stay out of the map.
3. Where the code already explains itself, the map uses that explanation; a description is only generated for files that lack one.
4. The map reflects the current state of the code, not a stale snapshot.

## Success Metrics

- A developer can learn what any file does in one line, without opening it.
- Standing up the map requires zero hand-written documentation.
- Description generation runs only for files that lack their own description, and only when those files change — keeping the running cost low.

## Out of Scope

- Deep semantic analysis beyond which files import or are imported by which — call graphs and behavioural analysis are not part of this outcome.
- Non-code materials such as call transcripts or briefs — those are project knowledge, a separate outcome.
- The visual, human-browsable map — that is the constellation, a separate outcome.

## Notes

- The "use the code's own explanation first, generate one only when missing" rule (Business Rule 3) is a deliberate cost choice, carried through to the developer spec.
