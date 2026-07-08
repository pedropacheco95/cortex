# v3 spec drafts — promoted

The 13 v3 spec drafts that lived here (9 dev specs under `specs/{insight,archive,provenance,migration}/`
and 4 business specs under `specs-business/`) were promoted into the live Specflow trees on **2026-07-08**:

- Dev specs → `.specflow/specs/{insight,archive,provenance,migration}/`
- Business specs → `.specflow/specs-business/{insight,archive,provenance,migration}/`

All were promoted at `status: implemented` (every build-order-v3 step had shipped). Promotion notes:
the v3 `insight.cli` draft replaced the v2 `cli.spec.md` in place; `insight.storage-format` supersedes
the v2 `insight.module-contract` (bannered); a minimal `insight.l1-structural` spec was authored at
promotion time (built at step 5a without a dedicated spec, but load-bearing via `depends_on`); business
spec ids were normalised to match their filenames; and the `.specflow` `cerebrum/` spec dirs were renamed
to `compass/` in the same pass.

This directory is kept only so stale links to it fail loudly with this explanation rather than silently.
