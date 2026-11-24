# Implementation Plan: The Claude API

## Overview

Prompt 80a is task 1.

## Tasks

- [x] 1. Settings and the Claude API
  - [x] 1.1 Add the Claude API client and its setting, tested with a fake SDK client
    - _Requirements: 1.1_
  - [x] 1.2 Load the worker's and the API's `.env` files
    - _Requirements: 1.2_
  - [x] 1.3 Add `pnpm llm:smoke`
    - _Requirements: 1.3_

## Notes

- "A live raise of Shifa shows Claude API calls in the LLM call log" waits for the team's `ANTHROPIC_API_KEY` in `apps/worker/.env`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3"] }
  ]
}
```
