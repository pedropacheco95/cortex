# Cortex Business Specs — Overview

## What this is

This is the stakeholder-facing tree. It describes what Cortex does and why it matters to the developer using it — the outcomes they get, the journeys they go through, and what success looks like. It deliberately stays out of the "how": no schemas, no commands, no internal mechanics live here.

## What it covers

Cortex helps a developer (and the AI assistant working alongside them) genuinely understand a codebase — its structure, its rules, its history, and its intended behaviour — so that work stays grounded and knowledge compounds instead of evaporating. The outcomes are organised into fifteen groups:

- **A single, stable contract** — every part of the system and every contributor agrees on how project knowledge is shaped and named, so artefacts compose instead of drifting.
- **A fast, predictable command-line tool** — set Cortex up in one step and run everyday operations without surprises or waiting on an AI.
- **An always-current map of the code** — see what every file is for and how files connect, without reading the whole codebase.
- **Conventions that get enforced** — rules, decisions, and known problems are captured once and applied automatically, so the same mistake can't recur silently.
- **The project's memory of why** — decisions, people, domain language, and source materials stay preserved and traceable even after the people who knew them move on.
- **Just-in-time guardrails** — the assistant gets the right nudge at the right moment, without blocking the work.
- **Cortex that actually gets used** — from the first session the assistant knows Cortex exists and when to consult it, so answers stay grounded.
- **A system that keeps itself honest** — the knowledge layer stays current on its own and proposes changes for approval rather than changing things silently.
- **Knowledge that compounds across autonomous runs** — unattended work builds on what previous runs learned instead of starting cold.
- **Visible proof the project is understood** — anyone can open a navigable map and see the project is understood in a structured, traceable way.
- **Confidence that the product does what it should** — every intended behaviour is specified, traceable from outcome to test, and verified.
- **An assistant that already understands the codebase** — a persistent, queryable, inferred understanding of the source code itself builds up and keeps itself current, so no session starts cold.
- **Every authoritative document captured, once** — client specs, transcripts, and contracts enter through one pipeline, kept verbatim forever, with superseded versions preserved.
- **Every rule traces to its authority** — ask why a rule exists and the answer is one hop away; ask what depends on a changed source and the full list comes back.
- **Modules named for what they hold** — anyone reading the knowledge layer can tell what each part is for from its name, and every fact lives in exactly one place.

Each outcome is linked to the engineering specs that deliver it, so a reader can move sideways from "what we promise" to "how it's built".

_Outcomes are being written domain by domain — each domain folder's overview says what is written so far and what is planned._

## Why it's grouped this way

Each group is one promise a developer would name in a sentence, kept separate so it can be delivered, verified, and discussed on its own. The groups mirror the engineering domains one-to-one, so a reader can always move sideways between a promise and the work that delivers it without translation.

What deliberately does not live here: anything about *how* the promises are kept — internal mechanics, formats, and tooling belong to the engineering tree.

## Related groups

- Engineering specs that implement these outcomes: `../specs/`
