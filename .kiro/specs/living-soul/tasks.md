# Implementation Plan: Living Soul

## Overview

Prompt 80 is task 1, Prompt 81 task 2.

## Tasks

- [x] 1. Speech client
  - [x] 1.1 Add the Amazon Transcribe client, the fallback provider and the config, tested with fakes
    - _Requirements: 1.1_
  - [x] 1.2 Add the transcript normaliser, with unit and property tests
    - _Requirements: 1.2_
  - [x] 1.3 Add the voice route on the API and the browser's recorder client
    - _Requirements: 1.3_
  - [x] 1.4 Add the Living Soul tab, with an e2e test
    - _Requirements: 1.4_
- [ ] 2. Voice to rule change
  - [ ] 2.1 Map a request to a proposed rule edit with the LLM, asking back when it is ambiguous
    - _Requirements: 2.1_

## Notes

- Amazon Transcribe has no Urdu (its language table, checked 2026-11-23). Spoken Urdu is sent as Hindi (hi-IN) and comes back in Devanagari, so the normaliser reads Devanagari numbers too. A provider with Urdu would be a new dependency, so it needs asking first (tech.md).
- The fallback provider is a second Transcribe region: no other speech library is in the stack.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3"] },
    { "id": 2, "tasks": ["1.4", "2.1"] }
  ]
}
```
