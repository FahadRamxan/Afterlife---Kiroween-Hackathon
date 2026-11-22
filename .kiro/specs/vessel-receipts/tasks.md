# Implementation Plan: Vessel receipts

## Overview

The layout first (the Soul and the reference Soul), then where it comes from (the Archaeologist), then the receipt itself (the Vessel) and its screen (the reborn app).

## Tasks

- [x] 1. The receipt layout in the Soul
  - [x] 1.1 Add ReceiptSchema to the Soul IR, with its reference checks
    - _Requirements: 1.1, 1.2_
  - [x] 1.2 Write the NEW BILL layout into the reference Soul
    - _Requirements: 1.3_
- [x] 2. The layout from the old app's screen
  - [x] 2.1 Implement inferReceipt and test it on the real TOTALS.SCR dumps
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6_
  - [x] 2.2 Call it from inferActions and the archaeology step
    - _Requirements: 2.5_
- [x] 3. Receipts in the reborn app
  - [x] 3.1 Implement receiptOf, receiptText and receiptPdf with their properties
    - _Requirements: 3.1, 3.3, 3.4, 3.5_
  - [x] 3.2 Add the receipt to the reborn app, with print CSS and a snapshot test
    - _Requirements: 3.1, 3.2_
  - [x] 3.3 Add an e2e test of the receipt, its print preview, WhatsApp and the PDF
    - _Requirements: 3.2, 3.3, 3.4_

## Notes

- The old app never printed a receipt: its NEW BILL screen before F2 is the bill the customer saw, so it is the layout.
- No new dependency: the PDF is written by hand (text only, Courier).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "3.2"] },
    { "id": 3, "tasks": ["3.3"] }
  ]
}
```
