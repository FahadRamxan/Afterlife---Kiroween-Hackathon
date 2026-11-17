---
inclusion: manual
---

# Pre-commit check

Run this before you commit. Use it with `/pre-commit-check` or `#pre-commit-check` in chat.

Kiro IDE has no manual hook trigger, so this check is a manual steering file (see `docs/kiro-formats.md`). The same gate runs automatically in the git `pre-push` hook.

1. Run `node scripts/hooks/run.mjs verify`. It runs `pnpm verify` (lint, typecheck, unit and property tests, Playwright e2e) and prints the last lines of output.
2. Summarise the result in one short list:
   - lint: pass or the first errors
   - typecheck: pass or the first errors
   - tests: the passed and failed counts
   - e2e: the passed and failed counts
3. If anything failed, do not commit. Name the failing file and test, and propose the fix.
4. If everything passed, check that `docs/progress.md` is updated, then suggest the Conventional Commit message.
