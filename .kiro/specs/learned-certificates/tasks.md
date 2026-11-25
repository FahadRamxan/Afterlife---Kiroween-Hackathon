# Implementation Plan: Certificates from the learned Soul

## Overview

Prompt 81.

## Tasks

- [x] 1. Refusal rules without a model
  - [x] 1.1 Read line attempts from the observations and infer refusal rules
    - _Requirements: 1.1_
  - [x] 1.2 Probe the boundary in the old app, and add the rules in the archaeology step
    - _Requirements: 1.2_
- [x] 2. Unworkable rules
  - [x] 2.1 Reject effect rules the action cannot work out
    - _Requirements: 2.1_
  - [x] 2.2 The Surgeon types only the macro's fields and publishes only workable actions
    - _Requirements: 2.2_
- [x] 3. Prove what was published
  - [x] 3.1 Prove only published actions, listing the rest as not reborn yet
    - _Requirements: 3.1_
  - [x] 3.2 A fixed seed for recorded runs; distinct cases weighted by rules
    - _Requirements: 3.2, 3.3_
  - [x] 3.3 Re-record the Graveyard runs, and make the exorcism e2e pass 10 of 10
    - _Requirements: 3.1, 3.2_

## Notes

- "With the model, all three reach a certificate" waits for a working model key (Bedrock or the Claude API).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.2"] },
    { "id": 1, "tasks": ["1.2", "2.2"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["3.3"] }
  ]
}
```
