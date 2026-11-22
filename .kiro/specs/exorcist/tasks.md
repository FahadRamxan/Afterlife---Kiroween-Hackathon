# Implementation Plan: Exorcist

## Overview

Prompt 73 is task 1, Prompt 74 task 2, Prompt 75 task 3.

## Tasks

- [x] 1. Legacy bug detection
  - [x] 1.1 Implement the detectors, each with evidence, severity, English and Urdu
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6_
  - [x] 1.2 Plan and judge the late fee probes in the old app
    - _Requirements: 1.4_
  - [x] 1.3 Add the exorcise step, and score the three samples against their manifests
    - _Requirements: 1.7_
- [x] 2. Keep or fix
  - [x] 2.1 Record the decision; Fix writes a new Soul version with the corrected rule
    - _Requirements: 2.1, 2.2_
  - [x] 2.2 Re-run the proof of the affected cases, and list the divergence on the certificate
    - _Requirements: 2.2, 2.3_
- [ ] 3. The Exorcism tab
  - [ ] 3.1 Ghost cards with Keep and Fix, the dissolve and the counter
    - _Requirements: 3.1, 3.2_
  - [ ] 3.2 e2e: fix one, keep one, and see the certificate updated
    - _Requirements: 3.2, 2.3_

## Notes

- The manifests' bug truth is the answer key only: the Crew never reads it.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["2.1"] },
    { "id": 4, "tasks": ["2.2", "3.1"] },
    { "id": 5, "tasks": ["3.2"] }
  ]
}
```
