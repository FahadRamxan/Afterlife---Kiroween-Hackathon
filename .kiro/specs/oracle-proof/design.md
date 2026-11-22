# Design Document

## Overview

`@afterlife/oracle` makes cases from the Soul (fast-check arbitraries), runs them on lanes of an emulator and a Vessel kept in lockstep, and shrinks and explains a difference. The worker's prove step runs it and emits a `proof_case` event per case; the Proof tab draws them.

## Architecture

- `packages/oracle/src/arbitraries.ts`: `thresholdsOf(soul)`, `prepareCases(soul, records, opts)`, `caseArbitrary(ctx, actionId?)`.
- `packages/oracle/src/compare.ts`: `effectDifferences(old, vessel)` and `sameEffects`: numbers compared as numbers, text without padding, inserted records paired by key, updates and deletions by record number. `explainDifference(case)` comes with shrinking.
- `packages/oracle/src/old-app.ts`: `emulatorOldApp(emu, { soul, graph })`: Esc out of a screen the graph does not know, `replayPath` to the action's screen, the macro typed step by step (`keySteps` from `@afterlife/emulator`), the data files diffed from before the first key to after the last.
- `scripts/proof-shifa.ts`: `pnpm proof:shifa`, a ci:local step.
- `packages/oracle/src/runner.ts`: `proveEquivalence(target, { numRuns, seed, lanes, ... })`, with `OldApp` (an emulator lane) and the Vessel lane.
- `packages/oracle/src/shrink.ts`: `shrinkFailure(target, failure, { seed })` replays the failing case with fast-check from its seed and path (`fc.check` with `path`), each try from a fresh start (`old.reset()` and a new Vessel), within `SHRINK_TIME_LIMIT_MS` (2 minutes). A case that does not differ from a fresh start is kept as it was (`reproduced: false`).
- `packages/oracle/src/explain.ts`: `explainDifference(soul, counterexample)`: one sentence, the most telling difference first (the action's own record only one side wrote, then a value on it, then the rest), money in rupees, and the case ("a bill of Rs 5000.06 (PAN500 x 400)").
- `apps/worker/src/prove-step.ts`: the prove step: the newest Soul, the old app's records from its bundle, the Possessor's graph plus the Soul's navigation, `PROVE_CASES` (50) cases on `PROVE_LANES` (2) lanes, seed from the project id; a `proof_case` event per case with running totals (`done`, `failed`, `skipped`; the page keeps only the newest events), the old app's screen and each side's written record; `proof_runs` and `proof_cases` rows; the first difference in effects shrunk (1 minute). Differences are a finding: the step is done. A case whose rule the Vessel cannot work out (a fault of the Soul) is a difference, not a skip.
- `apps/api/src/pipeline.ts`: the steps API gives the prove step's `proof` (counts and counterexample).
- `apps/web/components/ProofTab.tsx`, `ProofPanel.tsx`, `apps/web/lib/proof.ts`: the Proof tab.

## Components and Interfaces

- `ProofCase = { actionId: string; inputs: ActionInputs }`.
- `prepareCases(soul, records, { today }): Promise<CaseContext>` works out each action's form, keys, line records and threshold cases (with the probe planner of `@afterlife/crew`); `caseArbitrary(ctx, actionId?): fc.Arbitrary<ProofCase>`.
- `OldApp = { run(c: ProofCase): Promise<SnapshotDiff>; reset(): Promise<void> }`.
- `proveEquivalence(target, opts)` gives `{ seed, numRuns, lanes, passed, failed, skipped, cases, firstFailure }`. The cases are the ones `fc.check` makes from the seed (`proofCases`), so case i replays alone with path `i`. Lane k takes cases k, k + lanes, ...; each lane starts again from the app's own records every 25 cases and after a difference.
- `SHIFA_AS_IT_RUNS_SOUL` (`@afterlife/soul/examples/shifa`): the reference Soul with the old app's two-digit-year expiry check (`year`, `month`, `day` were added to the rule language). The strict proof on the real app uses it; the reference Soul differs from the real app exactly on batches good until 2000 or later (the manifest's `y2k-expiry`).

## Data Models

- A proof case result: `{ index, actionId, inputs, outcome: 'pass' | 'fail' | 'skip', old?, vessel?, reason? }`.
- The counterexample: `{ actionId, inputs, seed, path, old, vessel, differences, explanation, shrinks, tries, reproduced, interrupted }`.

## Correctness Properties

### Property 1: Every generated input passes field validation

For any case the arbitraries give, every value passes `parseInput` for its field, and every link names an existing record or is blank.

**Validates: Requirements 1.1, 1.2, 1.5**

### Property 2: Threshold cases hit their thresholds

Each threshold case, previewed in the Vessel, gives the threshold's value exactly (one unit under, at, over).

**Validates: Requirements 1.3**

### Property 3: The same seed gives the same cases

For any seed, two runs of the arbitraries give the same cases.

**Validates: Requirements 2.2**

### Property 4: A Vessel compared with itself never differs

For any cases, a proof with a Vessel as the old app passes every case.

**Validates: Requirements 2.1**

## Error Handling

- The emulator cannot reach the action's screen: the case fails with that reason; the lane starts again.
- A case the Vessel refuses: skipped, with the reason.

## Testing Strategy

- Property tests of the arbitraries on Shifa's reference Soul and seed records.
- Unit tests of the runner with a Vessel standing in for the old app (fast), including a changed rule caught and shrunk.
- `pnpm proof:shifa` (a ci:local step): 200 cases on the real Shifa in js-dos with the as-it-runs Soul, 0 differences; then 60 with the reference Soul, every difference a Y2K line.
- `old-app.integration.test.ts`: the emulator old app on the real Shifa, and an 18% GST caught.
- An e2e test of the Proof tab.
