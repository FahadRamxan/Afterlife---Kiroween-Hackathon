# Implementation Plan: Code and spec export

## Overview

The builder first (pure, in the Vessel package), then the API route and the button, then the check that the export works on its own.

## Tasks

- [x] 1. The export's contents
  - [x] 1.1 Implement vendorRuntime and its property
    - _Requirements: 1.5_
  - [x] 1.2 Implement buildExport: the app, the Soul and seed, the Kiro files and the test suite
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6_
- [x] 2. Export in the app
  - [x] 2.1 Add GET /api/projects/:id/export
    - _Requirements: 2.1, 2.2_
  - [x] 2.2 Add the Export link on the Soul tab, with an e2e test
    - _Requirements: 2.3_
- [x] 3. The export works on its own
  - [x] 3.1 Add pnpm export:check and run it in ci:local
    - _Requirements: 3.1, 3.2_

## Notes

- The export's tests are properties of the Soul in the runtime, so they hold for any project, not only Shifa.
- `pnpm install` in the check uses the pnpm store on the machine (`--prefer-offline`).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "3.1"] },
    { "id": 3, "tasks": ["2.2"] }
  ]
}
```
