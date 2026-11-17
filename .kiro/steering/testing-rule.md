---
inclusion: always
---

# Testing rule

This rule applies to every task, every prompt and every spec task. No exceptions.

## Workflow

1. Write Vitest unit tests, plus fast-check property tests for any pure logic, before or with the code.
2. Run them, see them fail, then implement until they pass.
3. Wire the feature into a real UI screen in `apps/web`. If the feature has no UI yet, say so and test it through its command or API instead.
4. Add or extend a Playwright e2e test in `/e2e` that clicks through the feature.
5. Run `pnpm verify` (lint, typecheck, test, e2e). All must pass.
6. Commit only when green, with a Conventional Commit message (`feat(dbf): reader`), and push to a feature branch.

Never mark a task done if any test is skipped or failing.

- Do not use `.skip`, `.only`, `.todo` or `it.fails` to make a run green.
- Do not delete or weaken an assertion to make a test pass. Fix the code, or explain why the test was wrong.
- Report what you ran and the result (for example "54 passed, 0 failed").
- Update `docs/progress.md` in the same commit.

## Where tests go

- Unit tests: `src/foo.test.ts` next to `src/foo.ts`.
- Property tests: `src/foo.prop.test.ts`. The run count comes from `FC_NUM_RUNS` (100 locally, 2000 nightly).
- E2E: `e2e/<feature>.spec.ts`.
- Unit tests never touch the network. Use the fake `LlmClient` and `SpeechClient`.
- Money is tested in integer paisa or decimal.js, never floats.

## Property test examples

Each example below runs for real in `tests/testing-rule-examples.test.ts`.

### Round-trip

Encode then decode gives back the input. Use it for the DBF reader and writer, the Soul serializer, the DSL printer and parser, and the key-sequence parser.

```ts
it('round-trip', () => {
  fc.assert(
    fc.property(fc.string(), (s) => {
      expect(decode(encode(s))).toBe(s);
    }),
  );
});
```

### Invariant

Something is always true for every input. Use it for money (results are whole paisa), fingerprints (they ignore field values) and certificates (any byte change fails verification).

```ts
it('invariant', () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 10_000_000 }), (amount) => {
      const gst = gstTruncated(amount);
      expect(Number.isInteger(gst)).toBe(true);
      expect(gst).toBeLessThanOrEqual((amount * 17) / 100);
      expect(gst).toBeGreaterThan((amount * 17) / 100 - 1);
    }),
  );
});
```

### Differential

Two independent implementations agree on every input. This is how the Oracle proves the Vessel matches the old app.

```ts
it('differential', () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 10_000_000 }), (amount) => {
      expect(gstTruncated(amount)).toBe(gstReference(amount));
    }),
  );
});
```
