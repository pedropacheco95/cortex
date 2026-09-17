---
id: schema.visibility
status: implemented
depends_on:
  - schema.validator
  - core-cli.init
governs:
  - "src/schema/checks/visibility.ts"
implements: ../../specs-business/schema/contributor-trusts-project-knowledge.business.md
governed_by:
  - R-001
provenance:
  - derives_from: archive/documents/parallel-wave-brief-2026-09-14/extracted/asks.md
---

# Repository Visibility — `visibility` in `cortex.config.json` and `check.visibility`

## Intent

RULES.md rule 12 says compass holds pointers, never secrets, and nothing in the brief's project
broke it: no credential ever reached `environment.md`. What reached it, by reasonable increments,
was a production map — a VM address, a project and zone, an SSH command, container ports, the
identity accounts — in a repository that is public. No single line was a secret; the aggregate
was reconnaissance (brief §6, claim C-18, ask A-15). Cortex cannot know whether a repository is
public, so the project declares it once in `cortex.config.json`, and when it says `public` the
validator reads every tracked file under `compass/` and `atlas/` for the five shapes operational
specifics take and warns with the line. A warning, not an error: the check is a reviewer that
names what it saw, and an `allow` list of globs silences a file the human has judged. Schema 3.4,
fifth revision in place (§10.1 `visibility`, Appendix A `check.visibility`, RULES.md rule 20).

## Entities

- **READS:** `.cortex/cortex.config.json` (`visibility.repo`, `visibility.allow`); the root
  `.gitignore` and `.cortex/.gitignore` when present (what "tracked" means without `git`);
  every `.md` and `.yaml` file under `.cortex/compass/` and `.cortex/atlas/` that those ignore
  files do not exclude.
- **WRITES:** nothing. **CREATES:** nothing.

## Rules

1. **The config key (schema §10.1).** `visibility` is an optional object:
   `{ "repo": "public" | "private" | "unknown", "allow": string[] }`. `repo` defaults to
   **`unknown`**; `allow` defaults to `[]` and holds project-relative globs (picomatch, the
   `governs` grammar). `cortex init` writes `"visibility": { "repo": "unknown", "allow": [] }`
   explicitly on fresh projects so the config self-documents and the question is visible;
   `cortex sync` does not add it to an existing config (the `hooks.readDefer` precedent —
   `core-cli.sync` Rule 2 touches `schemaVersion` only). `check.config` validates the shape:
   `repo` outside the enum or `allow` not a list of strings → `error`; the key absent → nothing.
   Its sibling `placement: { "localNotesDir": string }` (optional, no default — the untracked
   prose directory the generated CLAUDE.md placement paragraph names, `core-cli.init` Rule 10)
   is checked the same way: `localNotesDir` present but not a string → `error`.

2. **Tracked means not ignored.** Core spawns no `git` (R-001), so a file is *tracked* for this
   check when the root `.gitignore` (and `.cortex/.gitignore`, if present), evaluated with the
   `ignore` package already in the dependency set, does not exclude it. `atlas/sources/` is
   therefore out by default; a negated pattern that re-includes a source (this repo's
   `!.cortex/atlas/sources/cortex-v3-reframe.md`) puts that file back in scope. A project with no
   `.gitignore` treats everything as tracked.

3. **When it runs.** Only when `visibility.repo` is `public`. `private` and `unknown` produce no
   violation and no scan — the check is silent, not advisory, so a project that has not answered
   the question is not nagged by every validate run; the CLAUDE.md placement paragraph
   (`core-cli.init` Rule 10) is where `unknown` is surfaced to a human.

4. **The five shapes, pinned as exported constants in `src/schema/checks/visibility.ts`
   (`VISIBILITY_PATTERNS`, one entry per family, each `{ name, regex }`; tests pin them):**
   - `ipv4` — `/\b(?:\d{1,3}\.){3}\d{1,3}\b/`, excluding the exact strings `0.0.0.0` and
     `127.0.0.1` and any match preceded by `v` or followed by `-` (version strings);
   - `host` — a hostname `/\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+\.(?:com|net|org|io|dev|cloud|app|run|internal|local|corp|lan)\b/i`
     on a line that also carries a context word from `VISIBILITY_CONTEXT_WORDS`
     (`ssh host hostname server vm instance cluster endpoint url database db port ip address`,
     whole-word, case-insensitive), or that is preceded by `@` or `://`; hosts in
     `VISIBILITY_SAFE_HOSTS` (`github.com`, `gitlab.com`, `npmjs.com`, `example.com`,
     `example.org`, `localhost`, `anthropic.com`, `claude.ai`) never match — a remote name is
     a pointer, not a target;
   - `port` — `/\b(?:(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9.-]+\.[a-z]{2,}):\d{2,5}\b/i` — a host or
     address with a port; `localhost:PORT` and `schema:§` never match; a match whose host label
     ends in a source-file extension from `VISIBILITY_CODE_REFERENCE_EXTENSIONS` (`.ts`, `.tsx`,
     `.js`, `.mjs`, `.cjs`, `.json`, `.md`, `.yaml`, `.yml`, `.py`, `.sh`) is a code reference
     (`file.ts:74`, the bug ledger's evidence lines), not a port, and never warns;
   - `ssh` — `/\bssh\s+(?:-\S+\s+)*[A-Za-z0-9._-]+@[A-Za-z0-9.-]+/`;
   - `account` — any of `/\b\d{12}\b/` (a cloud account number), `/\barn:aws:\S+/`,
     `/\b[a-z][a-z0-9-]{4,28}@[a-z0-9-]+\.iam\.gserviceaccount\.com\b/`,
     `/--project(?:=|\s+)[a-z][a-z0-9-]{4,28}\b/`, `/\bprojects\/[a-z][a-z0-9-]{4,28}\b/`.
   A line is scanned once per family; fenced code blocks are **not** exempt (the brief's SSH
   command was in one). Frontmatter is scanned like body text.

5. **The violation.** One `warning` per matching line: `check.visibility`, clause `§10.1`,
   `location: { path, line }`, message
   `visibility: repo is public and <path>:<line> carries a <family> (<matched text cut to 40>) — move it to an untracked note or add the file to visibility.allow`.
   At most **20** warnings per file, then one more saying `… and N more lines`; the cap keeps a
   pasted inventory from drowning the report. Files matched by any `visibility.allow` glob are
   skipped entirely and counted in the report's `notes` as `allowed by visibility.allow`.

6. **Never an error, never a fix.** The check does not redact, does not edit, and never
   escalates to `error` — a public repo with a host in compass validates *conformant* with
   warnings (`schema.contributor-trusts-project-knowledge` business rule 3: worth a second look,
   not must-fix), because whether a given host is sensitive is a judgment the human makes by
   allowing it or moving it. Two runs over the same tree emit identical warnings.

7. **Deterministic Core** (R-001): config read, ignore-file evaluation, regex scan. No LLM, no
   network, no subprocess.

## Acceptance Criteria

### Silent unless the repo is declared public

- **Given** `compass/environment.md` containing `ssh deploy@10.20.30.40` and a config whose
  `visibility` is, in turn, absent, `{ "repo": "unknown" }`, and `{ "repo": "private" }`
- **When** `cortex validate` runs under each
- **Then** no run carries a `check.visibility` violation

### A public repo warns with the line, per family

- **Given** `visibility.repo: "public"` and `compass/environment.md` whose lines 5–9 are
  `VM: 10.20.30.40`, `Host: app-prod.internal.acme.cloud (ssh)`, `API at api.acme.com:8443`,
  `ssh deploy@app-prod.internal.acme.cloud`, and `Account 123456789012`
- **When** `cortex validate` runs
- **Then** the report carries exactly five `check.visibility` warnings, one per line 5–9, each
  naming the family (`ipv4`, `host`, `port`, `ssh`, `account`) and ending `visibility.allow`,
  and `conformant` is `true`

### Safe hosts and dev ports never match

- **Given** `visibility.repo: "public"` and a file with the lines
  `GitHub remote: github.com/acme/app (private)`, `Dev server: localhost:3000`, `Version
  3.4.0.1 shipped`, and `Bind 0.0.0.0`
- **When** `cortex validate` runs
- **Then** no `check.visibility` warning is emitted

### A code reference is not a port

- **Given** `visibility.repo: "public"` and a compass bug whose lines carry
  `src/hooks/post-read.ts:74`, `B-019 … the check at validate.ts:119`, and
  `app-prod.internal.acme.cloud:8443`
- **When** `cortex validate` runs
- **Then** exactly one `check.visibility` warning is emitted, for the `.cloud:8443` line, and
  none names a `.ts` reference

### Ignored files are out of scope, re-included ones are in

- **Given** `visibility.repo: "public"`, `atlas/sources/notes.md` and
  `atlas/sources/reframe.md` both containing `ssh ops@db.acme.net`, and a `.gitignore` with
  `.cortex/atlas/sources/*` and `!.cortex/atlas/sources/reframe.md`
- **When** `cortex validate` runs
- **Then** exactly one `check.visibility` warning is emitted, for `reframe.md`

### An allow glob silences a file and is reported

- **Given** the environment file from the second criterion and
  `visibility.allow: [".cortex/compass/environment.md"]`
- **When** `cortex validate` runs
- **Then** no `check.visibility` warning names that file and the report's notes carry
  `allowed by visibility.allow: .cortex/compass/environment.md`

### The per-file cap holds

- **Given** `visibility.repo: "public"` and a compass file with 30 lines each carrying a
  distinct IPv4 address
- **When** `cortex validate` runs
- **Then** the file yields 20 line warnings plus one `… and 10 more lines` warning

### The config shape is checked

- **Given** `visibility: { "repo": "open" }` and, separately, `visibility: { "repo": "public",
  "allow": "compass/*" }`
- **When** `cortex validate` runs against each
- **Then** each report carries one `check.config` error naming `visibility.repo` and
  `visibility.allow` respectively

### Init writes the key explicitly; sync leaves an old config alone

- **Given** a fresh `cortex init --no-llm` and, separately, an existing project whose config
  lacks `visibility`
- **When** init runs, then `cortex sync` runs on the second project
- **Then** the first project's config carries `"visibility": { "repo": "unknown", "allow": [] }`
  and the second project's config still lacks the key after sync

## Notes

- **Why the config and not a per-module declaration.** The brief offered "a `visibility:`
  declaration per module". Every committed module of one repository has the same visibility —
  the repository's — so one key answers the question, and the per-file `allow` list covers the
  case the module-level flag was for (a file that is fine to publish).
- **Why regex families and not a secret scanner.** Secrets are rule 12's job and their scanners
  exist. This check is for the *aggregate* the brief described — hosts, addresses, ports,
  accounts that are each public-safe and together are a map — and a fixed, pinned, small set of
  shapes is what makes the warning explainable ("this line carries a host") and stable across
  runs. Widening a family is a spec edit.
- **Why not scan `insight/` or `archive/extracted/`.** Insight is derived from the code, which
  is already public if the repo is; archive extractions derive from documents a human chose to
  ingest and are the ingestion skill's judgment. Compass and atlas are the two surfaces sessions
  *write* operational facts into by hand, which is where the accretion happened.
- Journey-layer tests deferred to v1.1 pending the test-runner loop (project-wide convention).
