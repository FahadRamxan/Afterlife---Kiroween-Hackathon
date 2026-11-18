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
| `pnpm screen:capture`   | Record the VGA fonts and real js-dos frames of the sample apps (screen decoder fixtures)   |
| `pnpm smoke:prod <url>` | The `@smoke` Playwright tests against a deployed site                                      |

## How we test

GitHub Actions is off for this repo, so every check runs locally. The workflow files in `.github/workflows` stay as documentation.

1. **pre-commit** (Husky): ESLint and Prettier on staged files, `pnpm typecheck`, then the whole Vitest suite.
2. **commit-msg**: commitlint, Conventional Commits.
3. **pre-push**: `pnpm verify` (lint, typecheck, unit and property tests, Playwright e2e). A red test means nothing is pushed.
4. **Before merging a PR**: `pnpm ci:local`. It also runs every property test with `FC_NUM_RUNS=2000`, Playwright against the production build, and the API and worker Docker builds with a smoke test.
5. **Nightly**: a Kiro Crew scheduled job runs `pnpm ci:local` on `main` and sends the result.
6. **After a deploy**: `pnpm smoke:prod <url>`.

Current counts: 1052 unit and property tests in 63 files (integration tests included), and 87 Playwright tests (Prompt 30, after the review fixes). The worker integration tests and several e2e tests run the real sample apps in js-dos (headless Chromium), so a test run boots DOS dozens of times.

## Coverage

Package code coverage from `pnpm test:coverage` (HTML report in `coverage/`). This table is refreshed with each README update (every 20 prompts).

| Metric     | %   | Covered   |
| ---------- | --- | --------- |
| Lines      | 87% | 1411/1623 |
| Statements | 87% | 1717/1966 |
| Functions  | 92% | 402/437   |
| Branches   | 88% | 948/1072  |

As of Prompt 30 (it covers ten times more code than at Prompt 20). Property tests run with `FC_NUM_RUNS=100` in the git hooks and 2000 in `pnpm ci:local`.

## Status

Prompts 1 to 30 are merged.

- **1 to 10, foundation:** the monorepo, steering and hooks, the Haunted Ledger design system, the app shell (English and Urdu), the deploy skeleton.
- **11 to 21, the Graveyard and data:** the DOS toolchain, three sample dead apps (Shifa Medical Store, Iqra School Fees, Barkat Kiryana Ledger) with their legacy bugs, the Graveyard page, the `.DBF` reader, writer, snapshot, diff and viewer, and the DBF inspector API behind the upload card.
- **22 to 25, reading the screen:** a text-mode decoder that reads DOS screens back from emulator pixels by VGA glyph matching (no OCR), screen semantics (menus, fields, tables, messages), a layout fingerprint, and the live `CrtScreen` component.
- **26 to 30, driving the old app:** the `EmulatorController` interface and key language, js-dos v8 in the browser and in a headless worker pool, the action recorder that turns a key press into an observation (screens before and after, and the data diff), and repeatable runs from a fresh state.

`/design` boots the real Shifa EXE in js-dos: you can press keys, record what an action changed in the data files, and replay it from a fresh state. Details are in [docs/progress.md](docs/progress.md).

## Screenshots

Taken by `pnpm screenshots` from the real app.

| Graveyard                                       | Graveyard in Urdu                                            | DBF diff                                              |
| ----------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------- |
| ![Graveyard](docs/screenshots/02-graveyard.png) | ![Graveyard in Urdu](docs/screenshots/04-graveyard-urdu.png) | ![DBF diff](docs/screenshots/08-dbf-diff-tooltip.png) |

| The real Shifa running in js-dos, read back by the decoder | An observation: saving a bill                       |
| ---------------------------------------------------------- | --------------------------------------------------- |
| ![Live js-dos](docs/screenshots/11-live-jsdos.png)         | ![Observation](docs/screenshots/12-observation.png) |

All shots are in [docs/screenshots](docs/screenshots).

## License

MIT, Matrix AE.
