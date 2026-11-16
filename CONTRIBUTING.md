# Contributing to Afterlife

Every change follows one loop: **test, implement, wire, test again, commit, push.** The full rule is in [.kiro/steering/testing-rule.md](.kiro/steering/testing-rule.md), which Kiro follows on every task.

## Setup

```bash
pnpm install          # also installs the git hooks (husky)
pnpm exec playwright install chromium
pnpm verify           # lint, typecheck, unit + property tests, e2e
```

Use Node 22 and pnpm 10.

## The loop

1. **Test first.** Write Vitest unit tests and fast-check property tests for the logic. Run them and watch them fail.
2. **Make it pass.** Implement until `pnpm test` is green.
3. **Wire into the UI.** Connect the feature to a real screen in `apps/web`. No hidden features.
4. **Test the UI.** Add or extend a Playwright test in `/e2e`.
5. **Commit.** Only when `pnpm verify` is green. Use a Conventional Commit message.
6. **Push.** Push the feature branch, open a PR, wait for CI to go green, then merge to `main`.

## What the git hooks enforce

| Hook         | Runs                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `pre-commit` | lint-staged (ESLint with zero warnings, Prettier), `pnpm typecheck`, tests for packages changed since `HEAD`, repo tests |
| `commit-msg` | commitlint (Conventional Commits)                                                                                        |
| `pre-push`   | `pnpm verify`, including Playwright e2e                                                                                  |

Do not bypass hooks with `--no-verify`. If a hook is wrong, fix the hook in a separate commit.

## Commit messages

`<type>(<scope>): <summary>`, for example `feat(dbf): reader`, `fix(oracle): shrink money cases`, `chore(kiro): hooks`.

Types: `feat`, `fix`, `docs`, `test`, `chore`, `ci`, `perf`, `refactor`, `build`, `style`, `revert`.

## Checklist for every prompt or PR

- [ ] Tests written first, and seen failing
- [ ] Property tests for any pure logic (round-trip, invariant or differential)
- [ ] All tests pass, none skipped
- [ ] Feature wired into a real UI screen (or the PR says why it has no UI yet)
- [ ] Playwright e2e added or extended
- [ ] `pnpm verify` is green
- [ ] `docs/progress.md` updated
- [ ] Conventional Commit message
- [ ] Branch pushed, PR opened, CI green
