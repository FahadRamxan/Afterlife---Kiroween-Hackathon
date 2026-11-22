# Implementation Plan: Surgeon agent step

## Overview

The Surgeon first (pure), then the rebirth step in the worker, then the Reborn card.

## Tasks

- [x] 1. The Surgeon
  - [x] 1.1 Implement operate: validate, compile, lay out, smoke-test, configure
    - _Requirements: 1.1, 1.3, 1.5_
  - [x] 1.2 Refuse to publish a Soul that does not validate or has nothing that passes
    - _Requirements: 1.2, 1.4_
- [x] 2. The rebirth step
  - [x] 2.1 Implement rebirthStep and put it in the registry
    - _Requirements: 2.1, 2.2_
  - [x] 2.2 Record the runs again with the rebirth step
    - _Requirements: 2.3_
- [x] 3. The reborn moment
  - [x] 3.1 Give the rebirth step's summary through the steps API
    - _Requirements: 3.1_
  - [x] 3.2 Add the Reborn card and its animation, with an e2e test
    - _Requirements: 3.1, 3.2_

## Notes

- `motion` (Framer Motion) is the stack's animation library (tech.md); this is its first use.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2", "3.1"] },
    { "id": 3, "tasks": ["3.2"] }
  ]
}
```
