# Implementation Plan: Archaeologist completion

## Overview

Actions first (they are what the Vessel runs), then rules without a model, then probes and the recorded runs that keep the Soul.

## Tasks

- [x] 1. Actions from the observations
  - [x] 1.1 Write the macro language and its round-trip property
    - _Requirements: 1.2, 1.3_
  - [x] 1.2 Implement inferActions, with tests on Shifa-like steps and on the recorded possessions
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [x] 1.3 Store the actions in the archaeology step's Soul
    - _Requirements: 1.5_
- [x] 2. Rules without a model
  - [x] 2.1 Write the enumerator and its tests
    - _Requirements: 2.1, 2.2_
  - [x] 2.2 Use it when no model is set up, and check the archaeology score
    - _Requirements: 2.3_
- [x] 3. Probes in the old app
  - [x] 3.1 Write the probe planner and its property
    - _Requirements: 3.1, 3.2_
  - [x] 3.2 Run the probes in the worker through the emulator pool
    - _Requirements: 3.3_
  - [x] 3.3 Keep the observations and the Soul in recorded runs, with an e2e test
    - _Requirements: 3.4_

## Notes

- The model only proposes; every candidate, from the model or the enumerator, is checked by the verifier.
- Re-record the runs (`pnpm pipeline:record`) after tasks 2 and 3.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "2.1"] },
    { "id": 3, "tasks": ["2.2", "3.1"] },
    { "id": 4, "tasks": ["3.2"] },
    { "id": 5, "tasks": ["3.3"] }
  ]
}
```
