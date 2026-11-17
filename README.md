# Afterlife

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> Software that outlives its source code.

Afterlife brings dead DOS business software (Clipper/dBase/FoxPro era) back to life without source code. It drives the old app in an emulator, learns its rules from `.DBF` data diffs, writes a typed "Soul" and a Kiro spec, runs it as an offline-first PWA, and proves the new app behaves like the old one with differential property-based tests.

Built for Kiroween 2026 (category: Resurrection) by Matrix AE.

## Layout

- `apps/web`, `apps/api`, `apps/worker`: the Studio, the API and the job worker
- `packages/*`: soul, vessel, dbf, screen, emulator, oracle, crew, certificate, mcp-emulator, ui
- `powers/afterlife`, `samples/graveyard`, `e2e`, `docs`

See [plan.md](plan.md) for the plan and [prompt.md](prompt.md) for the build prompts. Progress is tracked in [docs/progress.md](docs/progress.md). Deployment steps are in [docs/deploy.md](docs/deploy.md).

## Commands

| Command                 | What it does                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm dev`              | Run all apps in dev mode                                                                   |
| `pnpm build`            | Build everything                                                                           |
| `pnpm test`             | Vitest across the workspace                                                                |
| `pnpm e2e`              | Playwright end-to-end tests                                                                |
| `pnpm lint`             | ESLint                                                                                     |
| `pnpm typecheck`        | TypeScript strict checks                                                                   |
| `pnpm verify`           | lint, typecheck, test and e2e, all of them                                                 |
| `pnpm ci:local`         | Everything CI did: verify with 2000 property runs, production e2e, Docker builds and smoke |
| `pnpm screenshots`      | Retake the UI tour in `docs/screenshots`                                                   |
| `pnpm smoke:prod <url>` | The `@smoke` Playwright tests against a deployed site                                      |

## How we test

GitHub Actions is off for this repo, so every check runs locally. The workflow files in `.github/workflows` stay as documentation.

1. **pre-commit** (Husky): ESLint and Prettier on staged files, `pnpm typecheck`, then the whole Vitest suite.
2. **commit-msg**: commitlint, Conventional Commits.
3. **pre-push**: `pnpm verify` (lint, typecheck, unit and property tests, Playwright e2e). A red test means nothing is pushed.
4. **Before merging a PR**: `pnpm ci:local`. It also runs every property test with `FC_NUM_RUNS=2000`, Playwright against the production build, and the API and worker Docker builds with a smoke test.
5. **Nightly**: a Kiro Crew scheduled job runs `pnpm ci:local` on `main` and sends the result.
6. **After a deploy**: `pnpm smoke:prod <url>`.

Current counts: 671 unit and property tests in 39 files, and 63 Playwright tests (Prompt 20).

## Coverage

Package code coverage from `pnpm test:coverage` (HTML report in `coverage/`). This table is refreshed with each README update (every 20 prompts).

| Metric     | %   | Covered |
| ---------- | --- | ------- |
| Lines      | 91% | 415/456 |
| Statements | 90% | 493/545 |
| Functions  | 90% | 111/123 |
| Branches   | 88% | 321/363 |

As of Prompt 20. Property tests run with `FC_NUM_RUNS=100` in the git hooks and 2000 in `pnpm ci:local`.

## Status

Prompts 1 to 20 are merged: the monorepo, steering and hooks, the Haunted Ledger design system, the app shell (English and Urdu), the deploy skeleton, the DOS toolchain, three sample dead apps (Shifa Medical Store, Iqra School Fees, Barkat Kiryana Ledger), the Graveyard page, and the `.DBF` reader, writer, snapshot, diff and viewer. Details are in [docs/progress.md](docs/progress.md).

## Screenshots

Taken by `pnpm screenshots` from the real app.

| Graveyard                                       | Graveyard in Urdu                                            | DBF diff                                              |
| ----------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------- |
| ![Graveyard](docs/screenshots/02-graveyard.png) | ![Graveyard in Urdu](docs/screenshots/04-graveyard-urdu.png) | ![DBF diff](docs/screenshots/08-dbf-diff-tooltip.png) |

All shots are in [docs/screenshots](docs/screenshots).

## License

MIT, Matrix AE.
