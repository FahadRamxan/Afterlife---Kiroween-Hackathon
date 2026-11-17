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

Each hook was fired once by piping it a save event. Hooks become active in the IDE at the next session start, so the firing inside the IDE still needs confirming in a new session. Add a line here when you see it.

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

### Still to confirm in the IDE

| Check                                                                                        | Result          |
| -------------------------------------------------------------------------------------------- | --------------- |
| Save `packages/dbf/src/index.ts` in a new session, `test-on-save` appears in the Hooks panel | not checked yet |
| Timeout the Hooks panel shows for `a11y-check` (300 s is set at hook and action level)       | not checked yet |

## IDE vs CLI vs Crew

GitHub Actions is off for this repo. The nightly check is a Kiro Crew scheduled job that runs `pnpm ci:local` on `main` (job text in `docs/kiro-formats.md`). Fill in the first nightly result here.
