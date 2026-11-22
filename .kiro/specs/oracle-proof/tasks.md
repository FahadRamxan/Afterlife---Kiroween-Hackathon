# Implementation Plan: Oracle and the proof

## Overview

Prompt 67 is task 1, Prompt 68 task 2, Prompt 69 task 3, Prompt 70 task 4.

## Tasks

- [x] 1. Arbitraries from the Soul
  - [x] 1.1 Implement caseArbitrary: inputs by field type and width, existing keys, refused lines left out
    - _Requirements: 1.1, 1.2, 1.4_
  - [x] 1.2 Bias to thresholds and date cutoffs, and prove every input passes field validation
    - _Requirements: 1.3, 1.5_
- [x] 2. The differential runner
  - [x] 2.1 Implement proveEquivalence with lanes in lockstep, skips and seeds
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [x] 2.2 Run the old app in the emulator: the screen graph and the macro
    - _Requirements: 2.1_
  - [x] 2.3 Add pnpm proof:shifa (200 cases on the real Shifa) to ci:local, and catch a changed rule
    - _Requirements: 2.5_
- [x] 3. Shrinking and the counterexample
  - [x] 3.1 Shrink a failing case with fast-check from its path, each try from a fresh start
    - _Requirements: 3.1, 3.2_
  - [x] 3.2 Implement explainDifference
    - _Requirements: 3.3_
- [ ] 4. The proof run in the app
  - [ ] 4.1 Implement the prove step and its events
    - _Requirements: 4.1_
  - [ ] 4.2 Add the Proof tab, with an e2e test of a 50-case proof
    - _Requirements: 4.2, 4.3_

## Notes

- Lanes start from a fresh boot with the old app's own records, and are started again every 25 cases, so the stock does not run out.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2", "3.1", "3.2"] },
    { "id": 3, "tasks": ["2.3", "4.1"] },
    { "id": 4, "tasks": ["4.2"] }
  ]
}
```
