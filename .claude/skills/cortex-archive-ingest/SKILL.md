---
name: cortex-archive-ingest
description: 'Ingest a transcript, RFP, brief or contract into project memory. "add this to project memory".'
---

# cortex-archive-ingest

## When to use

Use when the user drops **any** raw document into the session, or says "ingest
this transcript", "ingest this RFP", "ingest this brief", "ingest this email",
"ingest this design doc", "ingest this client spec", "ingest this contract",
"add this to project memory", "capture this call", "remember this decision", or
"log these stakeholders".

Document types in scope: client specs, contracts, regulatory/compliance
documents, technical specs from stakeholders, meeting transcripts, interview
recordings, call notes, RFCs/architecture docs, existing codebase documentation,
user research and feedback. **One skill, internal type routing** by
`archive/types/*.yaml` — a new document type never requires a new skill.

**Boundaries.** Sibling of `specflow-ingest`, which owns requirement-shaped
sources destined for the spec trees. This skill replaces the retired
`cortex-ingest` (atlas-only ingestion is now the `atlas` extraction strategy
inside this skill).

## What you do

You turn any ingested document into durable, authoritative Cortex memory under
`.cortex/archive/` (schema §4.4), then — only if the user asks — draft a
change plan that proposes downstream rule/decision updates through the
existing pulse gate (schema §4.5/§4.5.1). **Ingested documents are
authoritative by definition** — the user chose to ingest them — so extraction
writes structured content directly into the document's own `extracted/`
directory. Pulse is touched only at the yes/no gate (step 6), never as a side
effect of capture.

Everything you write MUST conform to `cortex-schema.md` §4.4 (archive
contract) and, on the yes-path, §4.5/§4.5.1 (pulse suggestion types). Cite
them when in doubt. There is **no `cortex archive` CLI command** — `archive/`
is written directly by this skill, the same way `atlas/` was written directly
by the skill this one replaces. Do not reference a CLI subcommand that
doesn't exist.

Run the 8 steps below, in order (design §6.4).

## Step 1 — Invocation

The user hands you a document (path, pasted text, or upload) and, optionally,
names its type by the `id` of an `archive/types/<id>.yaml` file.

## Step 2 — Classify

Read every `archive/types/*.yaml` file. Each parses to this exact shape
(`src/archive/formats.ts` `ArchiveTypeDef` — use these field names, no others):

```yaml
id: client-spec              # type id == filename stem; becomes metadata.yaml `kind`
label: Client specification
classification:
  extensions: [.pdf, .docx, .md]   # optional
  hints: ["requirement", "the client shall"]  # optional
  explicit: true                    # optional, default true
extraction:
  strategy: <strategy-id>          # e.g. generic | atlas | <other declared strategy>
  outputs:
    - kind: summary
      path: extracted/summary.md
      item_pattern: "GT-<SRC>-NNN-<slug>.md"   # optional
```

- **Declared type:** if the user names a type, select that `types/<id>.yaml`
  directly — but only if `classification.explicit` is not `false`. A type
  file with `classification.explicit: false` is inference-only; if the user
  names it anyway, tell them and fall back to inference.
- **Inferred type:** otherwise, match the document's extension against each
  type's `classification.extensions` and its content against each type's
  `classification.hints`.
- **No match:** if no declared type applies and nothing matches by
  inference, **ask the user which type this is** (or whether a new
  `archive/types/*.yaml` should be added first). Never guess silently — a
  wrong `kind` misroutes extraction and corrupts `metadata.yaml`.
- Adding a new document type is a new `archive/types/<id>.yaml` file, never a
  change to this skill's own instructions.

## Step 3 — Store the source + initial metadata

Pick a short, unique, lowercased-hyphenated `<slug>` (unique within
`documents/`). Create `archive/documents/<slug>/`:

- `source.<ext>` — the document, byte-for-byte verbatim (gitignored — same
  sensitivity treatment as the old `atlas/sources/`).
- `metadata.yaml` — a standalone YAML file (**not** frontmatter). Exact
  fields, matching `ArchiveMetadata` in `src/archive/formats.ts` — no
  invented field names:

```yaml
id: archive.<slug>                 # required — matches the directory
kind: <type-id>                    # required — the classified type's id
ingested_at: <iso-datetime>        # required
version: <string>                  # required — the document's own version label
status: active                     # required — active | superseded
supersedes:                        # optional — only on a version update (step 7)
  - documents/<prior-slug>/
source_filename: <string>          # optional
origin: <string>                   # optional
```

`extracted/` starts empty here — step 4 populates it.

## Step 4 — Run extraction

Read the classified type's `extraction.strategy` and `extraction.outputs`.
For each declared output (`kind`, `path` under `extracted/`, optional
`item_pattern`), produce that content:

- **`strategy: generic`** (or any non-`atlas` strategy) — write the declared
  outputs directly (e.g. `extracted/summary.md`, `extracted/requirements/*.md`
  per `item_pattern`) by reading and structuring the source. Use the type's
  `label` and `outputs` as your only contract — don't invent output kinds or
  paths the type file doesn't declare.
- **`strategy: atlas`** — this is the folded-in former `cortex-ingest`
  behaviour (design §6.6). Follow **`references/atlas-strategy.md`** in
  full — it extracts stakeholders/decisions/domain-terms into this
  document's own `extracted/`, cross-linked back here instead of a bare
  `atlas/sources/` copy.

Every output path you write MUST start with `extracted/` and MUST match one
of the type's declared `outputs` (this is what `check.archive-layout` and the
type's own contract expect).

## Step 5 — Inline clarifying questions

If the document is materially ambiguous (conflicting statements, an
unresolvable reference, a requirement that could mean two things), **ask the
user directly, in conversation** — right now, not as a pulse suggestion.
Design §6.4 step 5 is explicit that this is direct conversation, never a
proposal artefact.

## Step 6 — The yes/no change-plan gate

Ask the user: **"Do you want me to draft a change plan (rules to add/update
in compass, decisions to record in atlas) from this document?"**

### No

Stop here. The document and its `extracted/` content are stored and
referenceable. Go straight to step 8 (register update). Write nothing to
`.cortex/pulse/`.

### Yes

1. Analyze the extracted content and draft a change plan: for each candidate
   change, cite the exact `extracted/` file/line that motivates it, and state
   whether it is a **new** rule/decision (`promotion`-shaped) or a
   **correction to an existing one** (`gated-layer-update`-shaped, only when
   the extracted content clearly supersedes what an existing rule/decision
   says).
2. Present the plan for review. Let the user adjust or drop entries. Do not
   proceed past this point without explicit approval.
3. Apply the **approved** plan by proposing through the **existing pulse
   gate** — never write to `compass/`, `atlas/`, or `RULES.md` directly
   (RULES.md rule 7). Schema §4.5.1's table names **archive ingestion** as
   the v3.0 producer of exactly two suggestion types for this purpose:

   | Type | Use for | Target root | Payload |
   |---|---|---|---|
   | `promotion` | brand-new gated content drafted from this document | `.cortex/compass/`, `.cortex/atlas/`, `RULES.md` | append or create |
   | `gated-layer-update` | editing existing gated content a new document version changes | same | edit (`current:`/`replacement:` blocks) |

   These are the correct types — not `rule-candidate` (reserved for the
   distil/rule-decay loops) and not `decision-candidate` (reserved for
   `cortex-loop-session-observe`). Do not use those two here.

   **Provenance stamping (schema §6 / addendum A6, mandatory):** every
   rule/decision the plan creates or updates carries `provenance:` frontmatter
   in the proposed payload, with one `- derives_from:
   archive/documents/<slug>/extracted/<file>` entry per motivating extracted
   file (the same file the plan entry cites). `check.provenance` validates
   these references on the landed artefact — a dangling one is an error — and
   they are what the backward-traversal index (step 7) reads to answer "what
   derives from this document."

4. **Write the suggestion section(s) yourself**, directly, into
   `.cortex/pulse/archive-ingestion.md` (a new pulse report this skill owns,
   alongside `reports/bug-triage.md`, `reports/rule-candidates.md`, etc. — schema §4.5:
   "Proposal sections may appear in any `pulse/*.md` loop report"). There is
   no Core CLI for this step; you perform it directly, the same way you write
   `archive/` and `register.md` directly:
   - Read `.cortex/pulse/state/suggestion-counter` (a plain integer; missing file
     = `0`). Allocate the next id(s) as `S-<counter+1>` (zero-padded to 3
     digits), then write the advanced counter back — this is the single
     shared S-namespace across all pulse artefacts; never reuse an id.
   - Preserve any existing `pending` sections already in
     `archive-ingestion.md` (parse it first if it exists) and append your new
     section(s) below them, then rewrite the file with a fresh `generated`
     header (`kind: pulse-archive-ingestion`, `generated: <iso-datetime>`,
     `loop: cortex-archive-ingest`) — the always-write convention (schema
     §4.5): if there is nothing new this run, the header still refreshes.
   - Each suggestion section:
     ```markdown
     ## S-042: <short title>

     **Type:** promotion
     **Source:** cortex-archive-ingest — archive/documents/<slug>/extracted/<file>
     **Target:** .cortex/compass/rules/R-NNN-<slug>.md
     **Proposed file:**
     ```` `
     ---
     id: R-NNN
     title: ...
     source:
       - ../../archive/documents/<slug>/extracted/<file>
     governs:
       - "<glob>"
     confidence: EXTRACTED
     provenance:
       - derives_from: archive/documents/<slug>/extracted/<file>
     ---

     # R-NNN — ...
     ` ````
     ```
     Use `**Proposed addition:**`/`**Proposed edit:**` instead of
     `**Proposed file:**` when appending to or editing an existing target
     (schema §4.5.2); an edit's `current:`/`replacement:` blocks must match
     the target byte-exact or accept will refuse.
   - Fence rule: any payload containing its own fenced code (like the rule
     example above) must be wrapped in an outer fence strictly longer than
     the longest fence inside it (schema §4.5, longer-fence grammar).
5. Tell the user the proposal is now `pending` in `.cortex/pulse/` and
   requires `cortex pulse-accept` (a human running the review CLI) before it
   lands — you never write the gated target yourself.
6. **A drafted plan may include spec changes** (new/changed dev or business
   specs). Schema §4.5.1's permitted target roots for `promotion` and
   `gated-layer-update` are `.cortex/compass/`, `.cortex/atlas/`, and
   `RULES.md` only — **`.specflow/specs/` is not a permitted pulse target**.
   Do not invent a specs/ target root for the pulse gate. Instead, flag any
   spec-shaped item in your plan separately: "this also looks like a spec
   change — route it to `specflow-ingest`/`specflow-spec-editor` outside this
   gate," and do not include it in the `.cortex/pulse/archive-ingestion.md`
   write. When you hand a spec-shaped item off, pass its
   `archive/documents/<slug>/extracted/<file>` reference along so the created
   spec carries the same `provenance: - derives_from:` entry (schema §4.6/§4.7
   allow it on both trees).

## Step 7 — Document version updates

When the user ingests a new version of an already-active document (e.g.
`client-spec-v2.1` after `client-spec-v2.0`):

1. Run steps 2–4 for the new version under its own `<slug>` (e.g.
   `client-spec-v2-1`), with `metadata.yaml` `supersedes: [documents/<prior-slug>/]`.
2. Diff the new version's `extracted/` content against the prior version's.
   Surface inline: "new: …", "changed: …", "removed: …".
3. For changed/removed items, identify downstream artefacts via the
   **provenance backward-traversal index** (schema §6 / addendum A6,
   `provenance.frontmatter-check`): search the four provenance-bearing
   artefact kinds — `compass/rules/R-*.md`, `.specflow/specs/**/*.spec.md`,
   `.specflow/specs-business/**/*.business.md`, `atlas/decisions/*.md` — for
   frontmatter `derives_from:` entries pointing into the prior version's
   `archive/documents/<prior-slug>/...` paths (the changed/removed extracted
   files in particular). `check.provenance` keeps these entries well-formed
   and resolving, so a frontmatter search is exact — this is the same reverse
   map Core computes in `src/schema/provenance-index.ts`. Surface every
   citing rule/spec/decision for review in the update plan; none may silently
   continue enforcing a superseded requirement.
4. Run the same yes/no gate as step 6 for an **update plan**.
5. Update the **prior** version's `metadata.yaml` to `status: superseded` —
   its directory is kept, never deleted or overwritten. The new version's
   directory becomes the active one.

## Step 8 — Update `register.md`

Always run this step, on every ingestion or version update, whether or not
step 6/7's gate was accepted. `archive/register.md` is free markdown (no
frontmatter contract, schema §4.4) — append or update the document's entry
in the same style as the starter template:

```markdown
- `<slug>` — active, kind `<kind>`, ingested <date>.
```

On a version update, update the existing entry to show the new active/
superseded pair, e.g.:

```markdown
- `<slug-v2.0>` — superseded, kind `<kind>`, ingested <date>.
- `<slug-v2.1>` — active, kind `<kind>`, ingested <date>, supersedes `<slug-v2.0>`.
```

## Closing summary

Report: the document stored (path + `id` + `kind`), every `extracted/` file
written, any clarifying questions asked and answered, the yes/no gate outcome
(and if yes: the `S-NNN` ids written to `.cortex/pulse/archive-ingestion.md`
and their types), any spec-shaped items flagged for `specflow-ingest`/
`specflow-spec-editor` instead, the version-update diff and superseded status
change (if applicable, including the downstream artefacts the provenance
reverse-lookup surfaced), and the `register.md` update.
