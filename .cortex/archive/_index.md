# Archive — index

**Read this when:** you need the verbatim source or structured extraction behind
an ingested document (a client spec, contract, transcript, RFP, or similar) —
before citing or re-deriving something that was already captured.

**What's here:**
- `register.md` — human-readable index of every ingested document, active and superseded.
- `documents/<slug>/` — one dir per ingested document: `source.<ext>` (gitignored,
  may be sensitive), `metadata.yaml` (kind, version, status), `extracted/` (structured content).
- `types/*.yaml` — document-type schemas: classification hints + the extraction-output contract.

**How to navigate:** start at `register.md` to find a document; open its
`metadata.yaml` for `kind`/`status`/`supersedes`; read `extracted/` before the raw
`source.<ext>`. A document's `kind` names the `types/<kind>.yaml` that shaped its extraction.
