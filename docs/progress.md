# Progress tracker

Source of truth for what is done. Prompts come from [prompt.md](../prompt.md). Each prompt follows plan.md Rule 2: tests first, make them pass, wire into the UI, e2e, `pnpm verify` green in the pre-push hook, `pnpm ci:local` before merging, then merge to `main`.

GitHub Actions is off for this repo (billing lock), so there is no remote CI. Every branch starts from the latest `main`.

Status:

- `merged`: verified locally and merged into `main`
- `partial`: code merged, a step outside the repo is still open (see "Open steps")
- `todo`: not started

## Phase 1: Foundation

| #   | Prompt                    | Owner | Status  | Notes                                                                                                  |
| --- | ------------------------- | ----- | ------- | ------------------------------------------------------------------------------------------------------ |
| 0   | Master context            | all   | n/a     | Pasted per session                                                                                     |
| 1   | Monorepo scaffold         | F     | merged  | PR #1                                                                                                  |
| 2   | Read Kiro docs            | S     | merged  | PR #2. Crew Apps section corrected in the local-CI fix                                                 |
| 3   | Steering docs             | S     | merged  | PR #3. product, tech, structure, crew; all `inclusion: always`                                         |
| 4   | Testing rule steering doc | F     | partial | PR #4. Property examples run in `tests/testing-rule-examples.prop.test.ts`. Refusal check not recorded |
| 5   | Husky and commitlint      | F     | partial | PR #5. Blocked-commit proof in `docs/git-hooks-proof.md`. Screenshot missing                           |
| 6   | GitHub Actions CI         | F     | merged  | PR #6. Actions is off, replaced by `pnpm ci:local` (see below). Workflow files kept as documentation   |
| 7   | Kiro agent hooks          | F     | partial | PR #7. Path-with-spaces bug fixed in the local-CI fix. Firing inside the IDE not confirmed yet         |
| 8   | Design system             | Q     | merged  | PR #8. 8 components, `/design`, 9 snapshots (win32 + linux), reduced-motion e2e, AA contrast tests     |
| 9   | Web app shell             | Q     | merged  | PR #9. 7 routes, top bar, next-intl EN/UR (cookie, RTL), tabs synced to `?tab=`, axe on every route    |
| 10  | Deploy skeleton           | F     | partial | PR #10. `/health`, status chip, Dockerfiles, render.yaml, docs/deploy.md. Not deployed yet             |
| fix | Local CI and review fixes | F     | merged  | Branch `chore/local-ci`. From `review-prompts-01-10.md`, findings 1, 2, 4, 5, 7, 8, 9, 10, 12, 15, 16  |

## Phase 2: The Graveyard

| #   | Prompt                | Owner | Status | Notes                                                                                                                                                                                                                |
| --- | --------------------- | ----- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11  | DOS toolchain         | F     | merged | Open Watcom v2 (pinned, checksummed) + DOSBox + faketime image. `dbf3` C library, 381 checks on gcc and 16-bit DOS. `HELLO.EXE` runs in DOSBox, output repeatable byte for byte. `pnpm graveyard:test` in `ci:local` |
| 12  | Shifa Medical Store   | F+Q   | todo   |                                                                                                                                                                                                                      |
| 13  | Iqra School Fees      | Q     | todo   |                                                                                                                                                                                                                      |
| 14  | Barkat Kiryana Ledger | S     | todo   |                                                                                                                                                                                                                      |
| 15  | Manifests and bundles | F     | todo   |                                                                                                                                                                                                                      |
| 16  | Graveyard page        | Q     | todo   |                                                                                                                                                                                                                      |
| 17  | DBF reader            | F     | todo   |                                                                                                                                                                                                                      |
| 18  | DBF writer            | F     | todo   |                                                                                                                                                                                                                      |
| 19  | DBF snapshot and diff | F     | todo   |                                                                                                                                                                                                                      |
| 20  | DBF viewer component  | Q     | todo   |                                                                                                                                                                                                                      |

Prompts 21 to 100 are all `todo`. Update this file in the same commit as each prompt.

## Open steps (need a person, outside the repo)

- [ ] Prompt 4: ask Kiro to finish a task without tests, and record that it refuses (`docs/kiro-usage.md`).
- [ ] Prompt 5: screenshot of a blocked commit, saved as `docs/git-hooks-proof.png`.
- [ ] Prompt 7: open a new Kiro session, save a file in `packages/dbf/src`, check the Hooks panel, record it and the timeout it shows in `docs/kiro-usage.md`.
- [ ] Prompt 10: deploy (Neon, Render, Vercel) using `docs/deploy.md`, then `pnpm smoke:prod <vercel-url>`.
- [ ] Turn GitHub Actions off: repo Settings → Actions → General → Disable actions.
- [ ] Sheheryar: schedule the Kiro Crew nightly `pnpm ci:local` job (text in `docs/kiro-formats.md`).

## Review findings not done yet (by choice)

- Finding 13: ESLint React Hooks and Next.js rules. Add them before the prompts that write a lot of client code, after checking ESLint 10 support.
- Finding 14: switch `design-system.md` and `crew.md` to `fileMatch` inclusion.

## Notes

- Node on this machine is v26. Docker and deploys use Node 22, and `.node-version` says 22.
- TypeScript is pinned to 5.9 because `typescript-eslint` does not support TypeScript 7 yet.
