# How we use Kiro

A running log of how Kiro builds Afterlife. Prompt 98 turns this into the final write-up.

## Steering

Files in `.kiro/steering/`, all `inclusion: always` except `pre-commit-check.md` (manual).

| File                  | Purpose                                                                          |
| --------------------- | -------------------------------------------------------------------------------- |
| `product.md`          | What Afterlife is, the users, the six Crew agents, the demo flow                 |
| `tech.md`             | The stack, and "always prefer these libraries"                                   |
| `structure.md`        | Repo layout and naming rules                                                     |
| `crew.md`             | Each agent's role, inputs and outputs                                            |
| `testing-rule.md`     | Tests first, then UI, then e2e, then commit and push. The rule that matters most |
| `pre-commit-check.md` | On-demand `/pre-commit-check`: runs `pnpm verify` and summarises it              |

Check from Prompt 3: asked "what stack do we use for queues?", Kiro answered pg-boss, from `tech.md`. `tests/steering.test.ts` also checks that `tech.md` names pg-boss as the queue.

## Hooks

Hook files are in `.kiro/hooks/`. We created them with Kiro's own hook tool, which writes the `version: "v1"` format. Each hook runs `node scripts/hooks/run.mjs <name>`. The script reads the event JSON from stdin, and its logic is unit-tested in `tests/hooks-lib.test.ts` and `tests/hooks.test.ts`. Each run is appended to `.kiro/.hook-runs.jsonl`, which is git-ignored.

| Hook                   | Trigger           | Matcher                                    | What it does                                                                                |
| ---------------------- | ----------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `test-on-save`         | `PostFileSave`    | `packages/*/src/**.ts(x)`                  | Runs that package's Vitest project                                                          |
| `pbt-on-oracle-change` | `PostFileSave`    | `packages/oracle/**`, `packages/vessel/**` | Runs the oracle and vessel property suites                                                  |
| `spec-sync`            | `PostTaskExec`    | none                                       | Checks every `- [x]` task in `.kiro/specs/*/tasks.md` has a test tagged `@spec <spec>#<id>` |
| `a11y-check`           | `PostFileSave`    | `apps/web/app/**/page.tsx`                 | Runs `e2e/a11y.spec.ts` (axe) on that page's route                                          |
| `pre-commit-check`     | manual (steering) | n/a                                        | `/pre-commit-check` runs `pnpm verify` and summarises the result                            |

`pre-commit-check` is a manual steering file because Kiro IDE 1.0 has no manual hook trigger (see `docs/kiro-formats.md`).

### First firing (Prompt 7)

Each hook was fired once by piping it a save event. Firing inside the IDE was confirmed later, once the workspace was trusted (see "Confirmed in the IDE" below).

Real firings are logged to `.kiro/.hook-runs.jsonl` with `"source": "kiro"`. Test runs go to a temp file with `"source": "test"`, so that log only holds real firings.

| Hook                   | Event                                              | Result                                                   |
| ---------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| `test-on-save`         | save `packages/dbf/src/index.ts`                   | `PASS @afterlife/dbf`                                    |
| `test-on-save`         | save a deliberately failing test in `packages/dbf` | exit 1, `FAIL @afterlife/dbf`, `× broken on purpose`     |
| `pbt-on-oracle-change` | save `packages/oracle/src/index.ts`                | `PASS oracle + vessel property suites`                   |
| `spec-sync`            | task finished, no specs yet                        | `All 0 completed spec task(s) are referenced by a test.` |
| `spec-sync`            | a temporary spec with `- [x] 1.` and no test       | exit 1, `tmp-demo#1 Something done without a test`       |
| `a11y-check`           | save `apps/web/app/page.tsx`                       | `PASS axe on /`                                          |

## MCP

Filled in by Prompts 32 and 33 ("MCP: Kiro driving a 1998 app").

## Specs

Filled in as feature specs are created in `.kiro/specs/`.

### Bug found and fixed: paths with spaces (local-CI fix)

The review found that a hook given a full path reported "nothing to test" and exited 0. The cause: `looksLikeFile` rejected paths with spaces, and this repo lives in `Matrix AE Hackathons`. Reproduced before the fix:

```text
[test-on-save] No package source file in the event, nothing to test.   (exit 0, tested nothing)
```

After the fix, the same event gives `PASS @afterlife/dbf`. `file://` URIs are decoded. An event with no usable path now runs every package (or every route for `a11y-check`) and names the event's keys, so a hook can never look green without testing.

### Confirmed in the IDE (Prompts 15 to 20)

The hooks did not fire at first because Kiro IDE had the repo folder in Restricted Mode (VS Code
Workspace Trust, banner hidden in our settings). An untrusted workspace disables v2 hooks, skips the
workspace steering files, and asks before every shell command even when `permissions.yaml` allows
it. Kiro's log said `hooks.v2.executionDisabledUntrustedWorkspace` at session start. After
**Workspaces: Manage Workspace Trust → Trust** and a restart (17 Nov, 20:11 PKT), the hooks fired on
their own while Kiro built Prompts 15 to 20. `.kiro/.hook-runs.jsonl` holds 22 real firings
(`"source": "kiro"`) between 15:11 and 19:13 UTC on 17 Nov:

| Hook           | Package or route      | Pass | Fail |
| -------------- | --------------------- | ---- | ---- |
| `test-on-save` | `@afterlife/dbf`      | 1    | 9    |
| `test-on-save` | `@afterlife/ui`       | 3    | 4    |
| `test-on-save` | `@afterlife/screen`   | 1    | 1    |
| `test-on-save` | `@afterlife/emulator` | 0    | 2    |
| `a11y-check`   | axe on `/design`      | 1    | 0    |

The failures are the red step of test-first work: Kiro saved a new test before the code that makes
it pass, the hook reported the failure, and the next save went green.

| Check                                                                                  | Result                  |
| -------------------------------------------------------------------------------------- | ----------------------- |
| `test-on-save` runs by itself when Kiro saves a package file                           | confirmed, 21 firings   |
| `a11y-check` runs by itself when a page file is saved                                  | confirmed, `/design`    |
| Timeout the Hooks panel shows for `a11y-check` (300 s is set at hook and action level) | not checked yet         |
| Screenshot of the Hooks panel for the write-up                                         | still to take (a human) |

## IDE vs CLI vs Crew

GitHub Actions is off for this repo. The nightly check is a Kiro Crew scheduled job that runs `pnpm ci:local` on `main` (job text in `docs/kiro-formats.md`). Fill in the first nightly result here.
