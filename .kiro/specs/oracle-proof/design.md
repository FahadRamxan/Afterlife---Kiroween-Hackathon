# Design Document

## Overview

`@afterlife/oracle` makes cases from the Soul (fast-check arbitraries), runs them on lanes of an emulator and a Vessel kept in lockstep, and shrinks and explains a difference. The worker's prove step runs it and emits a `proof_case` event per case; the Proof tab draws them.

## Architecture

- `packages/oracle/src/arbitraries.ts`: `thresholdsOf(soul)`, `prepareCases(soul, records, opts)`, `caseArbitrary(ctx, actionId?)`.
- `packages/oracle/src/compare.ts`: `sameEffects(old, vessel)`, `explainDifference(case)`.
- `packages/oracle/src/runner.ts`: `proveEquivalence(target, { numRuns, seed, lanes, ... })`, with `OldApp` (an emulator lane) and the Vessel lane.
- `apps/worker/src/prove-step.ts`: the prove step.
- `apps/web/components/ProofPanel.tsx`: the Proof tab.

## Components and Interfaces

- `ProofCase = { actionId: string; inputs: ActionInputs }`.
- `prepareCases(soul, records, { today }): Promise<CaseContext>` works out each action's form, keys, line records and threshold cases (with the probe planner of `@afterlife/crew`); `caseArbitrary(ctx, actionId?): fc.Arbitrary<ProofCase>`.
- `OldApp = { run(c: ProofCase): Promise<SnapshotDiff>; reset(): Promise<void> }`.
- `proveEquivalence(...)` gives `{ seed, numRuns, passed, failed, skipped, cases, counterexample }`.

## Data Models

- A proof case result: `{ index, actionId, inputs, outcome: 'pass' | 'fail' | 'skip', old?, vessel?, reason? }`.
- The counterexample: `{ case, old, vessel, explanation, path }`.

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
- `pnpm proof:shifa` (a ci:local step): 200 cases on the real Shifa in js-dos.
- An e2e test of the Proof tab.
