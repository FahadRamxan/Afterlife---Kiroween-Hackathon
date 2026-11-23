# Implementation Plan: Ghost Twin

## Overview

Prompt 76 is task 1, Prompt 77 task 2, Prompt 78 task 3, Prompt 79 task 4.

## Tasks

- [x] 1. Capture
  - [x] 1.1 Implement the capture loop: a change is an event, half-written files and a down API handled
    - _Requirements: 1.1, 1.2_
  - [x] 1.2 Add the afterlife-twin CLI, tested against a mock API on a temp folder
    - _Requirements: 1.1, 1.2_
  - [x] 1.3 Add the API's twin token and events routes
    - _Requirements: 1.3_
- [ ] 2. Replay and compare
  - [ ] 2.1 Infer the action from the diff, replay it in the Vessel, compare and store the result
    - _Requirements: 2.1, 2.2_
  - [ ] 2.2 Send unknown actions to the Archaeologist as evidence
    - _Requirements: 2.2_
- [ ] 3. Readiness and switch-over
  - [ ] 3.1 Work out the readiness score with configurable thresholds
    - _Requirements: 3.1_
  - [ ] 3.2 Switch over: freeze the old data, final migration, the Vessel primary
    - _Requirements: 3.2_
- [ ] 4. The Ghost Twin tab
  - [ ] 4.1 Calendar, live feed, readiness meter and switch-over
    - _Requirements: 4.1_
  - [ ] 4.2 Simulate a day in the shop, with an e2e test
    - _Requirements: 4.2_

## Notes

- Polling, not file-system events: DOS programs write a DBF in several steps, and watch events are unreliable on some Windows folders.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2", "3.1"] },
    { "id": 4, "tasks": ["3.2", "4.1"] },
    { "id": 5, "tasks": ["4.2"] }
  ]
}
```
