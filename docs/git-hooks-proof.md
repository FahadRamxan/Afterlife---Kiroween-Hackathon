# Git hooks proof (Prompt 5)

Recorded on the `chore/git-hooks` branch. Both attempts below were blocked, and `HEAD` stayed at `85304cd` each time.

A screenshot still needs to be taken by hand and saved as `docs/git-hooks-proof.png`. The terminal output below is the exact text from the run.

## 1. A commit with a failing test is blocked by `pre-commit`

The test that was staged, `tests/deliberate-fail.test.ts`:

```ts
import { expect, it } from 'vitest';

it('deliberately fails', () => {
  expect(1 + 1).toBe(3);
});
```

Command:

```bash
git add tests/deliberate-fail.test.ts
git commit -m "test: this commit must be blocked"
```

Output (trimmed):

```text
 Tasks:    14 successful, 14 total          # pnpm typecheck
 Tasks:    13 successful, 13 total          # turbo run test --filter=...[HEAD]
 ❯ tests/deliberate-fail.test.ts (1 test | 1 failed) 16ms
   × deliberately fails 14ms
 FAIL  tests/deliberate-fail.test.ts > deliberately fails
AssertionError: expected 2 to be 3 // Object.is equality
 Test Files  1 failed | 6 passed (7)
      Tests  1 failed | 79 passed (80)
husky - pre-commit script failed (code 1)
```

`git commit` exited with code 1. No commit was created.

## 2. A non-conventional message is blocked by `commit-msg`

```bash
git commit --allow-empty -m "added stuff"
```

```text
✖   subject may not be empty [subject-empty]
✖   type may not be empty [type-empty]
husky - commit-msg script failed (code 1)
```

## Note on the pre-commit command

Prompt 5 asks for `pnpm lint --filter=...[HEAD]`. Our `lint` script runs ESLint once from the root, which has no `--filter` flag. So `pre-commit` runs lint-staged (ESLint with zero warnings on the staged files, then Prettier) instead. Tests use `turbo run test --filter=...[HEAD]` as asked, plus the root `tests/` suite.
