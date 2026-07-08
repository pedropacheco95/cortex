# Archive — index

**Read this when:** you need the verbatim source or structured extraction behind
an ingested document — before citing or re-deriving something already captured.

**What's here:**
- `register.md` — human-readable index of every ingested document.
- `documents/<slug>/` — one dir per document: `source.<ext>`, `metadata.yaml`, `extracted/`.
- `types/*.yaml` — document-type schemas: classification hints + extraction contract.

**How to navigate:** start at `register.md`; open a document's `metadata.yaml`
for `kind`/`status`; a document's `kind` names its `types/<kind>.yaml`.
