# Afterlife

[![CI](https://github.com/FahadRamxan/Afterlife---Kiroween-Hackathon/actions/workflows/ci.yml/badge.svg)](https://github.com/FahadRamxan/Afterlife---Kiroween-Hackathon/actions/workflows/ci.yml) [![Nightly PBT](https://github.com/FahadRamxan/Afterlife---Kiroween-Hackathon/actions/workflows/nightly-pbt.yml/badge.svg)](https://github.com/FahadRamxan/Afterlife---Kiroween-Hackathon/actions/workflows/nightly-pbt.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> Software that outlives its source code.

Afterlife brings dead DOS business software (Clipper/dBase/FoxPro era) back to life without source code. It drives the old app in an emulator, learns its rules from `.DBF` data diffs, writes a typed "Soul" and a Kiro spec, runs it as an offline-first PWA, and proves the new app behaves like the old one with differential property-based tests.

Built for Kiroween 2026 (category: Resurrection) by Matrix AE.

## Layout

- `apps/web`, `apps/api`, `apps/worker`: the Studio, the API and the job worker
- `packages/*`: soul, vessel, dbf, screen, emulator, oracle, crew, certificate, mcp-emulator, ui
- `powers/afterlife`, `samples/graveyard`, `e2e`, `docs`

See [plan.md](plan.md) for the plan and [prompt.md](prompt.md) for the build prompts. Progress is tracked in [docs/progress.md](docs/progress.md).

## Commands

| Command          | What it does                               |
| ---------------- | ------------------------------------------ |
| `pnpm dev`       | Run all apps in dev mode                   |
| `pnpm build`     | Build everything                           |
| `pnpm test`      | Vitest across the workspace                |
| `pnpm e2e`       | Playwright end-to-end tests                |
| `pnpm lint`      | ESLint                                     |
| `pnpm typecheck` | TypeScript strict checks                   |
| `pnpm verify`    | lint, typecheck, test and e2e, all of them |

## Coverage

Package code coverage from `pnpm test:coverage`. Every CI run writes the live numbers to its job summary and uploads the full HTML report as the `coverage` artifact. This table is refreshed with each README update (every 20 prompts).

| Metric    | %   | Covered |
| --------- | --- | ------- |
| Lines     | 0%  | 0/12    |
| Functions | n/a | 0/0     |

As of Prompt 6. The packages are still empty stubs, so there is nothing to cover yet. Property tests run with `FC_NUM_RUNS=100` locally and 2000 in the nightly job.

## License

MIT, Matrix AE.
