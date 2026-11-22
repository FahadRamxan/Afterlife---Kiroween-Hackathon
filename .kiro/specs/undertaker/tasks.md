# Implementation Plan: Undertaker

## Overview

The conversion first (pure, with its round trip), then the control totals, then the step and the panel. Prompt 64 is task 1 and 2.1-2.2, Prompt 65 is task 3, Prompt 66 is task 4.

## Tasks

- [x] 1. Migration
  - [x] 1.1 Implement importRecord and exportRecord, with the round-trip property
    - _Requirements: 1.1, 1.4_
  - [x] 1.2 Implement migrate: every file of the Soul, rejected records with reasons and fixes, deleted ones counted
    - _Requirements: 1.2, 1.3_
- [x] 2. The undertake step
  - [x] 2.1 Implement the step: migrate, write the Vessel records unless phones have synced, store the report
    - _Requirements: 1.5, 2.4_
  - [x] 2.2 Seed a phone from the server's records when there is no bundle
    - _Requirements: 1.5_
- [x] 3. Reconciliation
  - [x] 3.1 Implement controlTotals and reconcile, exact in decimals
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 3.2 Test a deliberately broken migration (a mismatch) and a correct one (all green)
    - _Requirements: 2.3_
- [x] 4. The data crossing panel
  - [x] 4.1 Add the panel: slips, progress per table, the reconciliation table, the rejected records
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [x] 4.2 Add an e2e test: every table shows a matching count
    - _Requirements: 3.2_

## Notes

- The Vessel runs on records in the data files' own form, so the migrated records are the typed records exported back: the conversion is what checks them.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "3.1"] },
    { "id": 2, "tasks": ["2.1", "3.2"] },
    { "id": 3, "tasks": ["2.2", "4.1"] },
    { "id": 4, "tasks": ["4.2"] }
  ]
}
```
