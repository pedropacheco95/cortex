---
name: cortex-register-tasks
description: >-
  Register a Cortex project's fourteen scheduled tasks with the Claude
  Desktop app, from inside a Claude Desktop session, using the app's own
  scheduled-tasks tools. Use when the user says "register the cortex
  scheduled tasks", "run cortex-register-tasks", "set up the cortex loops in
  the app", "activate the cortex tasks", or after `cortex init` / `cortex
  tasks verify` reports tasks not yet registered. Reads the authoritative
  plan from `cortex tasks plan --json`, diffs it against
  mcp__scheduled-tasks__list_scheduled_tasks, creates/updates only this
  project's tasks, and confirms with `cortex tasks verify`.
---

# cortex-register-tasks

You register this project's Cortex scheduled tasks with the Claude Desktop
app the sanctioned way: through the app's own internal MCP tools, from inside
a Desktop-spawned session. You never write the app's `scheduled-tasks.json`
yourself, and you never touch tasks that are not this project's.

## 0. Preflight — this MUST be a Claude Desktop session

The `mcp__scheduled-tasks__*` tools (`create_scheduled_task`,
`update_scheduled_task`, `list_scheduled_tasks`) are an internal MCP server
the Desktop app exposes ONLY to sessions it spawns. Check that they are
available to you.

**If they are not available: stop.** Do not fall back to editing any file.
Tell the user: "This skill needs the Desktop app's own scheduled-tasks tools,
which exist only in Claude Desktop sessions. Open this repository in the
Claude Desktop app (new session) and say `run cortex-register-tasks` there."

Why file-editing is forbidden here: the app loads `scheduled-tasks.json`
into memory once per launch and rewrites the whole file from memory on every
task event — an external edit is clobbered while the app runs, and a single
malformed field makes the app treat the entire file as empty and wipe ALL
tasks on its next flush.

## 1. Get the authoritative plan from Core

From the project root, run:

```bash
cortex tasks plan --json
```

This is the single source of truth — never hardcode ids, cron expressions,
paths, or counts. The JSON shape (`planVersion: 1`):

```json
{
  "planVersion": 1,
  "projectRoot": "/abs/path",
  "taskCount": 14,
  "tasks": [
    {
      "id": "<scoped id — also the payload dir name>",
      "canonical": "<canonical task name>",
      "cronExpression": "0 2 * * *",
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

Sanity-check that each plan entry's `payloadPath` exists on disk (the payload
SKILL.md is written by `cortex init`). If any payload is missing, do not
register that entry — report the missing payloads and tell the user to re-run
`cortex init` (non-force) to restore them, then re-invoke this skill.

## 2. Diff against what the app already has

Call `mcp__scheduled-tasks__list_scheduled_tasks` and compare with the plan
**by `id`**:

- **Missing** — plan entry with no app task of that id → create it (step 3).
- **Drifted** — app task exists but its cron/schedule differs from the plan's
  `cronExpression`, or it is disabled → update it (step 4).
- **In sync** — id present, enabled, cron matches → leave untouched.
- **Not ours** — any app task whose id is not in the plan (other projects,
  the user's own tasks): NEVER create, update, disable, or delete it.

## 3. Create each missing task

For each missing plan entry, call
`mcp__scheduled-tasks__create_scheduled_task`. You do not know the tool's
exact argument names ahead of time — **read the tool's input schema at
runtime** and map plan fields onto it sensibly:

- id / name / task identifier → the plan `id` (the scoped name). This is
  load-bearing: the app recomputes the payload file path from the id, so the
  id MUST equal the payload directory name — which the plan guarantees.
- schedule / cron → the plan `cronExpression`.
- folder / directory / cwd → the plan `cwd` (the project root).
- permission mode → the plan `permissionMode`.
- worktree flag, if present → the plan `useWorktree` (false).
- enabled flag, if present → true.

**Do NOT invent instructions/prompt content.** The task's SKILL.md payload
already exists at the id-derived path (`~/.claude/scheduled-tasks/<id>/SKILL.md`
— the plan's `payloadPath`). If the create tool requires a prompt/instructions
text field, pass the body of that existing payload file verbatim.

## 4. Update each drifted task

For each existing-but-drifted task (wrong cron, disabled), call
`mcp__scheduled-tasks__update_scheduled_task` with that task's id, setting
only what drifted: the plan's `cronExpression` and/or enabled = true. Change
nothing else on the entry.

## 5. Verify and report

The whole flow is idempotent — re-running it against an already-registered
project makes no create/update calls.

Finish by running, from the project root:

```bash
cortex tasks verify
```

Report to the user:

- a table: canonical task | scoped id | cron | action taken (created /
  updated / in sync) | verify result;
- the `cortex tasks verify` bottom line (all N registered, or the named
  failures);
- the reminder: **Desktop app updates have wiped this registry before** — if
  `cortex tasks verify` ever fails after an app update, re-run this skill in
  a Desktop session to re-register.
