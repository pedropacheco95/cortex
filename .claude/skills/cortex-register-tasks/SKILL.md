---
name: cortex-register-tasks
description: 'Register or activate this project''s cortex scheduled tasks in the Claude Desktop app.'
disable-model-invocation: true
---

# cortex-register-tasks

## When to use

Typed as `/cortex-register-tasks` in a Claude Desktop session, after `cortex sync`
or `cortex tasks verify` says tasks are not registered. Plain words do not start
this skill.

Registers a Cortex project's three scheduled tasks (`learn`, `fresh`, `quality`)
with the Claude Desktop app, **from inside a Claude Desktop session**, using the
app's own scheduled-tasks tools: reads the plan from `cortex tasks plan --json`,
diffs it against `mcp__scheduled-tasks__list_scheduled_tasks`, creates and updates
only this project's tasks, removes its superseded ones, and confirms with
`cortex tasks verify`.

## What you do

You register this project's three Cortex scheduled tasks with the Claude Desktop
app the sanctioned way: through the app's own internal MCP tools, from inside a
Desktop-spawned session. You never write the app's `scheduled-tasks.json`
yourself, and you never touch tasks that belong to another project.

## 0. Preflight — this MUST be a Claude Desktop session

The `mcp__scheduled-tasks__*` tools (`create_scheduled_task`,
`update_scheduled_task`, `list_scheduled_tasks`, and a delete/remove tool if
the app exposes one) are an internal MCP server the Desktop app exposes ONLY to
sessions it spawns. Check that they are available to you.

**If they are not available: stop.** Do not fall back to editing any file.
Tell the user: "This skill needs the Desktop app's own scheduled-tasks tools,
which exist only in Claude Desktop sessions. Open this repository in the
Claude Desktop app (new session) and type `/cortex-register-tasks` there, or
quit the app fully and run `cortex tasks register`."

Why file-editing is forbidden here: the app loads `scheduled-tasks.json`
into memory once per launch and rewrites the whole file from memory on every
task event — an external edit is clobbered while the app runs, and a single
malformed field makes the app treat the entire file as empty and wipe ALL
tasks on its next flush.

**Warn the user before you start creating.** The app demands a live approval
for every `create_scheduled_task` call and does NOT offer "always allow" for
task creation. Tell the user up front: "The app will ask you to approve each
task registration — one prompt per task (3 total). Stay at the keyboard and
approve each." Then proceed; if a prompt is declined or times out, record that
task as skipped and continue with the rest, listing skipped tasks in the
final report so the user can re-run for just those.

## 1. Get the authoritative plan from Core

From the project root, run:

```bash
cortex tasks plan --json
```

This is the single source of truth — never hardcode ids, cron expressions,
models, paths, or counts. The JSON shape (`planVersion: 3`):

```json
{
  "planVersion": 3,
  "projectRoot": "/abs/path",
  "taskCount": 3,
  "tasks": [
    {
      "id": "<scoped id — also the payload dir name>",
      "canonical": "<task name: learn | fresh | quality>",
      "cronExpression": "0 2 * * *",
      "model": "claude-opus-5-5",
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

**When `taskCount` is not 3, stop.** The project is on the 3.x roster, which has
nothing to register. Tell the user to migrate first: `cortex migrate`, then
`cortex migrate --accept`.

Check that each plan entry's `payloadPath` exists on disk. If a payload is
missing, do not register that entry: report it and tell the user to
run `cortex sync`, which writes the payloads, then type `/cortex-register-tasks` again.

## 2. Diff against what the app already has

Call `mcp__scheduled-tasks__list_scheduled_tasks` and classify every app task:

- **Missing** — a plan `id` with no app task of that id → create it (step 3).
- **Drifted** — an app task with a plan `id` but whose cron, model, or enabled
  flag differs from the plan → update it (step 4).
- **In sync** — plan `id` present, enabled, cron and model match → leave it.
- **This project's superseded task** — an app task that is NOT one of the plan
  ids but clearly belongs to THIS project: its `cwd` (working directory / folder)
  equals the plan's `projectRoot`, and/or its id is one of this project's old
  registrations under this project's slug, in either the plain
  `<slug>-<canonical>` grammar or the older `<slug>-<hash6>-<canonical>` grammar:
  the 3.x bundles (`<slug>-daily`, `<slug>-weekly-curation`, `<slug>-weekly-quality`,
  `<slug>-test-runner`, `<slug>-monthly-review`) and the old standalone loops
  (`<slug>-cortex-pulse-hygiene`, `<slug>-cortex-loop-skill-suggest`,
  `<slug>-specflow-verify`, …). **Delete it** (delete/remove tool if present;
  otherwise disable it) so it doesn't linger as a duplicate. Once a task is
  deleted, remove its payload directory `~/.claude/scheduled-tasks/<id>/`. Leave
  the directory of a task you could only disable: the app still points at it.
- **Not ours** — any app task whose `cwd` is a DIFFERENT project root (or that
  carries no Cortex ownership signal at all): NEVER create, update, disable, or
  delete it. Same-name tasks of other projects are protected by their `cwd`.

## 3. Create each missing task

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

**Do NOT invent instructions/prompt content.** The task's SKILL.md payload
already exists at the id-derived path (`~/.claude/scheduled-tasks/<id>/SKILL.md`
— the plan's `payloadPath`). If the create tool requires a prompt/instructions
text field, pass the body of that existing payload file verbatim.

## 4. Update each drifted task

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

- a table: task (canonical) | scoped id | cron | model | action taken
  (created / updated / replaced-superseded / in sync) | verify result;
- the `cortex tasks verify` bottom line (all three registered, or the named
  failures);
- the reminder: **Desktop app updates have wiped this registry before** — if
  `cortex tasks verify` ever fails after an app update, type
  `/cortex-register-tasks` in a Desktop session to re-register.
