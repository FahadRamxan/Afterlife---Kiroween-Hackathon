---
inclusion: always
---

# Repo structure

```
.kiro/            steering, specs, hooks, agents, settings/mcp.json (always committed)
apps/web          Next.js Studio: graveyard, raise, vessel, verify, playground, design
apps/api          Fastify REST + WebSocket API
apps/worker       pg-boss worker, runs the Crew and headless js-dos
packages/         shared libraries, one concern each (see below)
powers/afterlife  the Afterlife Kiro power
samples/graveyard the three sample dead DOS apps (C source, seed DBFs, bundles)
e2e/              Playwright tests, one spec per feature
tests/            repo-level checks (scaffold, steering, docs)
docs/             progress.md, kiro-formats.md, kiro-usage.md, architecture and deploy docs
```

## Packages

- `packages/soul`: Soul IR (zod), rule DSL, Kiro spec writer
- `packages/vessel`: runtime that executes a Soul
- `packages/dbf`: `.DBF` reader, writer, snapshot and diff
- `packages/screen`: text-mode decoder, screen semantics, fingerprint
- `packages/emulator`: `EmulatorController`, browser and headless js-dos, action recorder
- `packages/oracle`: arbitraries from the Soul, differential runner, shrinking
- `packages/crew`: LLM runtime and the six agents
- `packages/certificate`: certificate build, sign, verify
- `packages/mcp-emulator`: MCP server exposing the emulator
- `packages/ui`: "Haunted Ledger" design system and shared components

## Rules

- Packages are named `@afterlife/<folder>` and export from `src/index.ts`.
- Import other packages by name (`@afterlife/dbf`), never by relative path across packages.
- Packages never import from `apps/*`. Apps may import packages.
- Pure logic lives in packages. Apps only wire it to HTTP, jobs or UI.
- Tests sit next to the code: `src/foo.ts` has `src/foo.test.ts`. Property tests use `*.prop.test.ts`.
- E2E specs live in `/e2e` and are named after the feature: `e2e/graveyard.spec.ts`.
- Files: `kebab-case.ts`. React components: `PascalCase.tsx`. Types and components: PascalCase. Functions and variables: camelCase. Constants: `UPPER_SNAKE`.
- One Kiro spec per feature in `.kiro/specs/<feature-name>/`.
- Every prompt updates `docs/progress.md` in the same commit.
- Update `README.md` after every 20 prompts (20, 40, 60, 80, 100).
- Branch per prompt: `<type>/<short-name>`, for example `feat/dbf-reader`. Conventional Commits.
