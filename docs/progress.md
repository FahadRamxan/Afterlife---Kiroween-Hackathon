# Progress tracker

Source of truth for what is done. Prompts come from [prompt.md](../prompt.md). Each prompt follows the loop in plan.md Rule 2: tests first, make them pass, wire into UI, e2e, `pnpm verify`, commit, push.

Status: `done` (verified, committed), `in review` (committed locally, not pushed or merged), `todo`.

## Phase 1: Foundation

| #   | Prompt                    | Owner | Status    | Branch                    | Notes              |
| --- | ------------------------- | ----- | --------- | ------------------------- | ------------------ |
| 0   | Master context            | all   | n/a       |                           | Pasted per session |
| 1   | Monorepo scaffold         | F     | in review | `chore/scaffold-monorepo` | See below          |
| 2   | Read Kiro docs            | S     | todo      |                           |                    |
| 3   | Steering docs             | S     | todo      |                           |                    |
| 4   | Testing rule steering doc | F     | todo      |                           |                    |
| 5   | Husky and commitlint      | F     | todo      |                           |                    |
| 6   | GitHub Actions CI         | F     | todo      |                           |                    |
| 7   | Kiro agent hooks          | F     | todo      |                           |                    |
| 8   | Design system             | Q     | todo      |                           |                    |
| 9   | Web app shell             | Q     | todo      |                           |                    |
| 10  | Deploy skeleton           | F     | todo      |                           |                    |

Prompts 11 to 100 are all `todo`. Update this file in the same commit as each prompt.

## Prompt 1 notes

- Verified: `pnpm verify` (lint, typecheck, test, e2e) passes. Scaffold test: 25 tests. Playwright: 1 smoke test.
- Node on this machine is v26.13.0. The plan says Node 22. `engines` is `>=22`, and `@types/node` is pinned to 22. Use Node 22 in CI and deploys.
- TypeScript is pinned to 5.9 because `typescript-eslint` does not support TypeScript 7 yet.
- The web app has a placeholder landing page so the e2e loop has something to test.
