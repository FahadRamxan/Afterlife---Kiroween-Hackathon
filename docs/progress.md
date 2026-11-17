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
| 7   | Kiro agent hooks          | F     | merged  | PR #7. Fires in the IDE since the workspace was trusted: 22 real runs (`docs/kiro-usage.md`)           |
| 8   | Design system             | Q     | merged  | PR #8. 8 components, `/design`, 9 snapshots (win32 + linux), reduced-motion e2e, AA contrast tests     |
| 9   | Web app shell             | Q     | merged  | PR #9. 7 routes, top bar, next-intl EN/UR (cookie, RTL), tabs synced to `?tab=`, axe on every route    |
| 10  | Deploy skeleton           | F     | partial | PR #10. `/health`, status chip, Dockerfiles, render.yaml, docs/deploy.md. Not deployed yet             |
| fix | Local CI and review fixes | F     | merged  | Branch `chore/local-ci`. From `review-prompts-01-10.md`, findings 1, 2, 4, 5, 7, 8, 9, 10, 12, 15, 16  |

## Phase 2: The Graveyard

| #   | Prompt                | Owner | Status | Notes                                                                                                                                                                                                                                                                                                                                                                 |
| --- | --------------------- | ----- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11  | DOS toolchain         | F     | merged | Open Watcom v2 (pinned, checksummed) + DOSBox + faketime image. `dbf3` C library, 381 checks on gcc and 16-bit DOS. `HELLO.EXE` runs in DOSBox, output repeatable byte for byte. `pnpm graveyard:test` in `ci:local`                                                                                                                                                  |
| 12  | Shifa Medical Store   | F+Q   | merged | 40 medicines. All 7 rules and 3 legacy bugs pinned by C tests (44 gcc / 46 DOS checks) and 13 DOSBox scenarios. Bug 3 (32-bit discount overflow) added in the 11-20 review (65 Vitest checks on screens and DBFs). DOSBox hang fixed (fixed cycles)                                                                                                                   |
| 13  | Iqra School Fees      | Q     | merged | 60 students, 48 families. Fee by class, 15% sibling discount, Rs 50/week late fee capped at Rs 500, sequential receipts; calendar-week legacy bug. 45 C checks, 13 DOSBox scenarios, 37 Vitest checks incl. a TS reference implementation                                                                                                                             |
| 14  | Barkat Kiryana Ledger | S     | merged | 25 parties (romanised Urdu names), 80 ledger entries. Running balance, credit limit, no advance payments, monthly interest-free reminders; N(8,2) overflow bug (balance becomes ******** then 0). 34 C checks, 12 DOSBox scenarios, 32 Vitest checks                                                                                                                  |
| 15  | Manifests and bundles | F     | merged | 3 zod-validated manifests (hidden rules/bugs each linked to a scenario). Repeatable js-dos bundles in `apps/web/public/graveyard`, public catalogue with no hidden data. CP437 decoder in `packages/screen`. Bundle boot in js-dos is tested in Prompt 27                                                                                                             |
| 16  | Graveyard page        | Q     | merged | 3 tombstones from the catalogue, real first-screen CRT previews under a dormant fog (stops under reduced motion), Raise -> `/raise/<id>`, upload card that checks only the file name and size (the content check comes in Prompt 21, sending in 40), 360 px, English and Urdu. 9 e2e tests                                                                            |
| 17  | DBF reader            | F     | merged | C/N/F/D/L/M, deletion flag, code page byte, CP437 text, ******** kept. Matches all 9 sample DBFs field for field and HELLO.DBF from DOSBox. Round-trip property 1,000 runs (writer included, hardened in 18). No UI yet: viewer in 20, API in 21                                                                                                                      |
| 18  | DBF writer            | F     | merged | Byte-exact vs the C library on all 9 files; typed WIDTH/BAD_VALUE/BAD_FIELD errors. Golden: all 37 DOS scenarios run in DOSBox on TypeScript-written DBFs with identical results, every ci:local (`docs/dbf-golden.md`). Mutations caught                                                                                                                             |
| 19  | DBF snapshot and diff | F     | merged | SHA-256 snapshots, key detection (name-like + unique) with record-number fallback, field changes with exact decimal.js deltas. 4 properties (empty self-diff, apply gives b, antisymmetry, exact deltas) + real DOSBox data. Mutations caught. Viewer comes in 20                                                                                                     |
| 20  | DBF viewer component  | Q     | merged | `DbfTable` and `DbfDiffView` in `@afterlife/ui` (TanStack Table v9 + Virtual): typed headers, right-aligned exact numbers, arrow-key cell focus, 10k rows virtualised; diff colours by kind with old-to-new tooltips. On `/design` with Shifa data. 13 e2e tests, 2 snapshots (win32 + linux). Urdu RTL fixes on the Graveyard. Screenshot tour in `docs/screenshots` |
| fix | Review fixes 11 to 20 | F     | merged | PR #22 (Fahad's fixes) and `fix/review-11-20-kiro`: Raise page shows the app name and title, 404 for unknown ids; Shifa legacy bug 3; dev-mode e2e warm-up project; DbfGrid keeps one tab stop; /design uses catalogue years                                                                                                                                          |

Prompts 21 to 100 are all `todo`.

README updated at Prompt 20 (counts, coverage, screenshots). Update this file in the same commit as each prompt.

## Open steps (need a person, outside the repo)

- [ ] Prompt 4: ask Kiro to finish a task without tests, and record that it refuses (`docs/kiro-usage.md`).
- [ ] Prompt 5: screenshot of a blocked commit, saved as `docs/git-hooks-proof.png`.
- [ ] Prompt 7: hooks fire in the IDE (confirmed). Still to do: a screenshot of the Hooks panel, and the timeout it shows, in `docs/kiro-usage.md`.
- [ ] Prompt 10: deploy (Neon, Render, Vercel) using `docs/deploy.md`, then `pnpm smoke:prod <vercel-url>`.
- [ ] Turn GitHub Actions off: repo Settings → Actions → General → Disable actions.
- [ ] Sheheryar: schedule the Kiro Crew nightly `pnpm ci:local` job (text in `docs/kiro-formats.md`).

## Review findings not done yet (by choice)

- Finding 13: ESLint React Hooks and Next.js rules. Add them before the prompts that write a lot of client code, after checking ESLint 10 support.
- Finding 14: switch `design-system.md` and `crew.md` to `fileMatch` inclusion.

## Notes

- Node on this machine is v26. Docker and deploys use Node 22, and `.node-version` says 22.
- TypeScript is pinned to 5.9 because `typescript-eslint` does not support TypeScript 7 yet.
