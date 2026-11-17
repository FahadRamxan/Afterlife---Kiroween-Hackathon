# Kiro formats

Confirmed against the official docs at kiro.dev/docs (pages dated Aug to Nov 2026). Every later prompt uses these formats. Last checked: when this file was committed.

## Steering

- **Location:** `.kiro/steering/*.md` (workspace), `~/.kiro/steering/*.md` (global). Workspace wins on conflict.
- **Frontmatter** (YAML, first lines of the file) sets `inclusion`: `always`, `fileMatch` (needs `fileMatchPattern`), `manual` (used as `#name` or `/name`), or `auto` (needs `name` and `description`).
- A file with no frontmatter loads as always-included.
- File references: `#[[file:path]]`, `#[[folder:path]]`.
- `AGENTS.md` at the repo root is also read, and is always included.
- Custom agents do not get steering automatically. Add `"resources": ["file://.kiro/steering/**/*.md"]`.

```markdown
---
inclusion: always
---

# Testing rule

Write tests first. Never mark a task done with a failing or skipped test.
```

```markdown
---
inclusion: fileMatch
fileMatchPattern: ['packages/**/*.ts']
---

Use Vitest and fast-check in this package.
```

## Specs

- **Location:** `.kiro/specs/<feature-name>/`.
- **Files:** `requirements.md` (user stories, EARS acceptance criteria), `design.md`, `tasks.md`. A bugfix spec uses `bugfix.md` instead of `requirements.md`.
- **Workflows:** Requirements-First, Design-First, Quick Spec.
- Tasks are checkbox lists that Kiro updates as it runs them. Independent tasks run in parallel waves.

```markdown
<!-- .kiro/specs/dbf-reader/requirements.md -->

# Requirements

## User story

As a developer, I want to read a .DBF file so that I can inspect legacy data.

## Acceptance criteria

1. WHEN a valid dBASE III buffer is passed THE SYSTEM SHALL return its fields and records.
2. WHEN a record has the deletion flag set THE SYSTEM SHALL mark it as deleted.
```

```markdown
<!-- .kiro/specs/dbf-reader/tasks.md -->

- [ ] 1. Write round-trip property test
- [ ] 2. Implement readDbf
```

## Hooks

- **Location:** `.kiro/hooks/<name>.json` (workspace), `~/.kiro/hooks/` (global, CLI V3).
- **Schema:** `{ "version": "v1", "hooks": [ { name, description?, trigger, matcher?, action, timeout?, enabled? } ] }`.
- **Timeout:** the docs put `timeout` (seconds, default 60) on the hook. Kiro's own `createHook` tool writes it inside `action`. Our hook files set both to the same value. Check which one the Hooks panel shows and record it in `docs/kiro-usage.md`.
- **Triggers** (PascalCase): `PromptSubmit`, `Stop` (agent finished its turn), `SessionStart`, `PreToolUse`, `PostToolUse`, `PreTask` and `PostTask` style task triggers, `FileCreate`, `FileSave`, `FileDelete`, `PreCompaction`, `PostCompaction`. The docs example uses `PostFileSave`. Check the trigger name in the Hooks panel in the IDE before relying on it. `docs/kiro-usage.md` records the names that worked.
- **matcher:** a regex on the file path for file triggers, or a tool selector for tool triggers.
- **action:** `{ "type": "command", "command": "..." }` (runs in the project root, event JSON on stdin) or `{ "type": "agent", "prompt": "..." }`.
- Hooks activate when a session starts. No registration step.

```json
{
  "version": "v1",
  "hooks": [
    {
      "name": "test-on-save",
      "trigger": "PostFileSave",
      "matcher": "^packages/.+/src/.+\\.ts$",
      "action": { "type": "command", "command": "pnpm test" },
      "timeout": 120
    }
  ]
}
```

## Custom agents

- **Location:** `.kiro/agents/<name>.md` (Markdown with YAML frontmatter, body is the system prompt) or `.kiro/agents/<name>.json`. Global: `~/.kiro/agents/`.
- **Fields:** `name`, `description`, `prompt`, `model`, `tools`, `excludedTools`, `mcpServers`, `includeMcpJson`, `includePowers`, `resources`, `permissions.rules`, `hooks`, `welcomeMessage`.
- `tools` takes selectors: `read`, `write`, `shell`, `web`, `@builtin`, `@mcp`, `@server`, `@server/tool`, `*`.
- `permissions.rules` entries are `{ capability, match, effect }` where effect is `allow`, `ask` or `deny`.

```markdown
---
name: possessor-dev
description: Works on the Possessor agent in packages/crew
tools: ['read', 'write', 'shell']
includeMcpJson: true
resources:
  - file://.kiro/steering/**/*.md
permissions:
  rules:
    - capability: shell
      match: ['pnpm *', 'git status']
      effect: allow
    - capability: shell
      match: ['rm -rf *']
      effect: deny
---

You work on the Possessor agent. Follow the testing rule. Tests first.
```

## Kiro Crew

- Kiro Crew is an open-source personal agent. It runs locally or on a remote machine, with a desktop app, a web dashboard (`http://localhost:5476`) and a CLI.
- **Install and run:** `kirocrew setup`, `kirocrew doctor`, `kirocrew gateway`.
- **Features:** persistent sessions and memory, scheduled jobs described in natural language, heartbeats that watch a system, parallel subagents, a Projects panel that turns a spec into unattended runs, and channels such as Slack and Telegram.
- It uses kiro-cli underneath, so it reads the same `.kiro/` folder.
- **Crew Apps** (the App Kit, kiro.dev/docs/crew/apps): an app is a package that adds any mix of agents, skills, MCP servers, cron jobs, dashboard UI pages and backend processes to Crew.
  - The manifest is `app.json`. Fields include `name`, `agents`, `skills`, `backend.entryPoint`, `ui.entry`, `ui.pages`, `permissions` and `minKiroCrewVersion`. Subpages: build your first app, manifest reference, SDK (TypeScript and Python), publishing.
  - Apps live in their own git repo. Crew clones the repo, runs `npm install && npm run build`, then copies it into `~/.kiro/crew/apps/<name>/`.
  - Develop with live reload: `kirocrew app dev <app>`. Install a local copy through `POST /api/apps/install`.
  - Publish by a pull request that adds the app to the KiroCrew app registry (the built-in App Store).
- Our nightly check (GitHub Actions is off) is a Crew scheduled job, see the text below.

```text
# In the Crew chat or Schedule panel
Every night at 2 AM Pakistan time, in the Afterlife repo: switch to main, pull, run `pnpm ci:local`,
and send me a one-line result. If a step fails, include the step name, the failing test names and
the last 20 lines of output.
```

```json
{
  "name": "afterlife-crew",
  "agents": ["agents/ghost-twin.json"],
  "skills": ["skills/daily-summary"],
  "permissions": { "cron": true, "network": true }
}
```

## MCP

- **Location:** `.kiro/settings/mcp.json` (workspace) and `~/.kiro/settings/mcp.json` (user). Workspace wins on a name clash. Saving the file reloads servers.
- **Local server:** `command`, `args`, `env`, `disabled`, `autoApprove`, `disabledTools`.
- **Remote server:** `url`, `headers`, `oauth`, plus the same flags.
- Use `${VAR}` for secrets. Kiro only expands variables you approve in settings.

```json
{
  "mcpServers": {
    "afterlife-emulator": {
      "command": "pnpm",
      "args": ["--filter", "@afterlife/mcp-emulator", "start"],
      "env": { "AFTERLIFE_BUNDLE_DIR": "${AFTERLIFE_BUNDLE_DIR}" },
      "autoApprove": ["read_screen"]
    }
  }
}
```

## Powers

- A power is a folder that follows the Agent Plugins specification.
- **Required:** `plugin.json` with `$schema`, `name` (kebab-case), `version`, `description`, `author.name`, `keywords` (the words that activate it).
- **Optional:** `mcp.json` (same shape as MCP config, with `"type": "stdio"`), and `skills/<skill>/SKILL.md` with `name` and `description` frontmatter, plus `scripts/` and `references/`.
- Install in Kiro: Powers panel, Add Custom Power, import from a folder or a GitHub URL.
- A power does not carry hooks or steering files. Put those in skills or in the project's `.kiro/`.

```text
powers/afterlife/
├── plugin.json
├── mcp.json
└── skills/
    └── resurrect/
        └── SKILL.md
```

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "afterlife",
  "version": "0.1.0",
  "description": "Resurrect legacy DOS apps from Kiro chat",
  "author": { "name": "Matrix AE" },
  "keywords": ["dos", "dbf", "legacy", "resurrect", "foxpro", "clipper"]
}
```

## Property-based testing

- It is a Kiro IDE spec feature. Kiro extracts properties from the EARS lines in `requirements.md`, lists them in `design.md`, and generates and runs tests when you choose to run them. PBT tasks are optional by default.
- A failing property is shrunk to a minimal counterexample, and Kiro offers to fix the code, the test or the spec.
- Our tests use fast-check with Vitest. The Kiro feature links a requirement to a property. fast-check runs it.

```ts
import fc from 'fast-check';
import { expect, it } from 'vitest';

it('round-trips', () => {
  fc.assert(
    fc.property(fc.array(fc.integer()), (xs) => {
      expect(JSON.parse(JSON.stringify(xs))).toEqual(xs);
    }),
  );
});
```

## Differences from plan.md

| plan.md says                                    | Docs say                                                                                                                                                                                                             | What we do                                                                                     |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Hooks in `.kiro/hooks`                          | Correct folder. Format is JSON (`version: "v1"`) with PascalCase triggers                                                                                                                                            | Write JSON hooks (Prompt 7)                                                                    |
| "pre-commit-check: a manual hook"               | The IDE has no new Manual trigger. For on-demand work, use a `inclusion: manual` steering file (a `/name` slash command)                                                                                             | Make it a manual steering file, plus a `pnpm verify` script                                    |
| "spec-sync: when a tasks.md task is completed"  | A task trigger exists (Post Task Execution)                                                                                                                                                                          | Use that trigger                                                                               |
| Powers bundle "hooks, steering, spec templates" | A power has `plugin.json`, `skills/`, `mcp.json` only                                                                                                                                                                | Put steering and templates in skills as reference files (Prompt 91). Hooks stay in the project |
| Power folder `powers/afterlife`                 | Any folder works for import                                                                                                                                                                                          | Keep the path, add `plugin.json`                                                               |
| Crew App "built with the Crew App SDK"          | Correct. The Crew App Kit is documented at kiro.dev/docs/crew/apps: an `app.json` manifest, a TypeScript/Python SDK, `kirocrew app dev` for live reload, and publishing by pull request to the KiroCrew app registry | Build `afterlife-crew` as a Crew app in its own repo                                           |
| Custom agents in `.kiro/agents`                 | Correct. Markdown or JSON                                                                                                                                                                                            | Use Markdown                                                                                   |
| Steering "always-included"                      | `inclusion: always` frontmatter                                                                                                                                                                                      | Use it                                                                                         |
| MCP in `.kiro/settings/mcp.json`                | Correct                                                                                                                                                                                                              | Use it                                                                                         |

## Sources

- https://kiro.dev/docs/steering/
- https://kiro.dev/docs/specs/
- https://kiro.dev/docs/hooks/ and https://kiro.dev/docs/hooks/types/
- https://kiro.dev/docs/custom-agents/configuration-reference/
- https://kiro.dev/docs/crew/
- https://kiro.dev/docs/crew/apps/
- https://kiro.dev/docs/mcp/configuration/
- https://kiro.dev/docs/powers/ and https://kiro.dev/docs/powers/create/
- https://kiro.dev/docs/specs/correctness/
