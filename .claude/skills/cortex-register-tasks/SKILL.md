---
name: cortex-register-tasks
description: 'Register or activate this project''s cortex scheduled tasks in the Claude Desktop app.'
---

# cortex-register-tasks

## When to use

Use when the user says "register the cortex scheduled tasks", "run
cortex-register-tasks", "set up the cortex loops in the app", "activate the
cortex tasks", or after `cortex init` / `cortex tasks verify` reports tasks not
yet registered.

Registers a Cortex project's five scheduled-task bundles with the Claude Desktop
app, **from inside a Claude Desktop session**, using the app's own
scheduled-tasks tools: reads the authoritative plan from `cortex tasks plan
--json`, diffs it against `mcp__scheduled-tasks__list_scheduled_tasks`,
creates/updates only this project's tasks (replacing its own superseded legacy
tasks), and confirms with `cortex tasks verify`.

## What you do

You register this project's five Cortex scheduled-task bundles with the Claude
Desktop app the sanctioned way: through the app's own internal MCP tools, from
inside a Desktop-spawned session. You never write the app's
`scheduled-tasks.json` yourself, and you never touch tasks that belong to
another project.

## 0. Preflight — this MUST be a Claude Desktop session

The `mcp__scheduled-tasks__*` tools (`create_scheduled_task`,
`update_scheduled_task`, `list_scheduled_tasks`, and a delete/remove tool if
the app exposes one) are an internal MCP server the Desktop app exposes ONLY to
sessions it spawns. Check that they are available to you.

**If they are not available: stop.** Do not fall back to editing any file.
Tell the user: "This skill needs the Desktop app's own scheduled-tasks tools,
which exist only in Claude Desktop sessions. Open this repository in the
Claude Desktop app (new session) and say `run cortex-register-tasks` there."

Why file-editing is forbidden here: the app loads `scheduled-tasks.json`
into memory once per launch and rewrites the whole file from memory on every
task event — an external edit is clobbered while the app runs, and a single
malformed field makes the app treat the entire file as empty and wipe ALL
tasks on its next flush.

**Warn the user before you start creating.** The app demands a live approval
for every `create_scheduled_task` call and does NOT offer "always allow" for
task creation. Tell the user up front: "The app will ask you to approve each
task registration — one prompt per bundle (5 total). Stay at the keyboard and
approve each." Then proceed; if a prompt is declined or times out, record that
bundle as skipped and continue with the rest, listing skipped bundles in the
final report so the user can re-run for just those.

## 1. Get the authoritative plan from Core

From the project root, run:

```bash
cortex tasks plan --json
```

This is the single source of truth — never hardcode ids, cron expressions,
models, paths, or counts. The JSON shape (`planVersion: 2`):

```json
{
  "planVersion": 2,
  "projectRoot": "/abs/path",
  "taskCount": 5,
  "tasks": [
    {
      "id": "<scoped id — also the payload dir name>",
      "canonical": "<bundle name: daily | weekly-curation | weekly-quality | test-runner | monthly-review>",
      "cronExpression": "0 2 * * *",
      "model": "claude-sonnet-5",
      "cwd": "/abs/path",
      "enabled": true,
      "useWorktree": false,
      "permissionMode": "bypassPermissions",
      "payloadPath": "~/.claude/scheduled-tasks/<id>/SKILL.md (absolute)",
      "description": "one line"
    }
  ]
}
```

There are FIVE bundles, each a single scheduled task that runs its member
loops in sequence. Sanity-check that each plan entry's `payloadPath` exists on
disk (written by `cortex init`). If any payload is missing, do not register
that entry — report the missing payloads and tell the user to re-run
`cortex init` (non-force) to restore them, then re-invoke this skill.

## 2. Diff against what the app already has

Call `mcp__scheduled-tasks__list_scheduled_tasks` and classify every app task:

- **Missing** — a plan `id` with no app task of that id → create it (step 3).
- **Drifted** — an app task with a plan `id` but whose cron, model, or enabled
  flag differs from the plan → update it (step 4).
- **In sync** — plan `id` present, enabled, cron and model match → leave it.
- **This project's legacy/superseded task** — an app task that is NOT one of
  the five plan ids but clearly belongs to THIS project: its `cwd` (working
  directory / folder) equals the plan's `projectRoot`, and/or its id is one of
  this project's fourteen old standalone loop registrations under this
  project's slug — in either the plain `<slug>-<canonical>` grammar or the
  older `<slug>-<hash6>-<canonical>` grammar (e.g. `<slug>-cortex-pulse-hygiene`,
  `<slug>-cortex-loop-skill-suggest`, `<slug>-specflow-verify`, …). These are
  superseded by the five bundles → **delete them** (delete/remove tool if
  present; otherwise disable them) so they don't linger as duplicates. Then
  create the five bundles. Never leave the old fourteen running alongside the
  new five.
- **Not ours** — any app task whose `cwd` is a DIFFERENT project root (or that
  carries no Cortex ownership signal at all): NEVER create, update, disable, or
  delete it. Same-name tasks of other projects are protected by their `cwd`.

## 3. Create each missing bundle

For each missing plan entry, call
`mcp__scheduled-tasks__create_scheduled_task`. You do not know the tool's
exact argument names ahead of time — **read the tool's input schema at
runtime** and map plan fields onto it sensibly:

- id / name / task identifier → the plan `id` (the scoped name). This is
  load-bearing: the app recomputes the payload file path from the id, so the
  id MUST equal the payload directory name — which the plan guarantees.
- schedule / cron → the plan `cronExpression`.
- model → the plan `model`. The create tool exposes an optional `model` string
  field (per its zod schema); pass the plan's `model` straight through. If the
  tool has no model field at all, skip it — the payload SKILL.md carries a
  `model:` frontmatter key the app falls back to.
- folder / directory / cwd → the plan `cwd` (the project root).
- permission mode → the plan `permissionMode`.
- worktree flag, if present → the plan `useWorktree` (false).
- enabled flag, if present → true.

**Do NOT invent instructions/prompt content.** The bundle's SKILL.md payload
already exists at the id-derived path (`~/.claude/scheduled-tasks/<id>/SKILL.md`
— the plan's `payloadPath`). If the create tool requires a prompt/instructions
text field, pass the body of that existing payload file verbatim.

## 4. Update each drifted bundle

For each existing-but-drifted task (wrong cron, wrong model, disabled), call
`mcp__scheduled-tasks__update_scheduled_task` with that task's id, setting only
what drifted: the plan's `cronExpression`, `model`, and/or enabled = true.
Change nothing else on the entry.

## 5. Verify and report

The whole flow is idempotent — re-running it against an already-registered
project makes no create/update/delete calls.

Finish by running, from the project root:

```bash
cortex tasks verify
```

Report to the user:

- a table: bundle (canonical) | scoped id | cron | model | action taken
  (created / updated / replaced-legacy / in sync) | verify result;
- the `cortex tasks verify` bottom line (all five registered, or the named
  failures);
- the reminder: **Desktop app updates have wiped this registry before** — if
  `cortex tasks verify` ever fails after an app update, re-run this skill in
  a Desktop session to re-register.
