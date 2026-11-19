# Implementation Plan: Shifa Medical Store

## Overview

Rebuild Shifa Medical Store from its Soul (version 1): model the old data files and load their records, implement each rule with a property test, then build the screens.

## Tasks

- [ ] 1. Model the data and load the old records
  - [ ] 1.1 Model Medicine (6 fields from `MEDICINE.DBF`) and load its old records
  - [ ] 1.2 Model Customer (3 fields from `CUSTOMER.DBF`) and load its old records
  - [ ] 1.3 Model Bill (7 fields from `BILLS.DBF`) and load its old records
  - [ ] 1.4 Model Bill line (6 fields from `BILLITEM.DBF`) and load its old records
- [ ] 2. Implement `discount-over-5000`
  - [ ] 2.1 Write the rule in the new code
    - _Requirements: 1.1, 1.2_
  - [ ] 2.2 Write a property test that the new code and `if bill.subtotal > 5000 then trunc(bill.subtotal * 0.10, 2) else 0` agree on generated inputs
    - **Property 1: `discount-over-5000`**
    - **Validates: Requirements 1.1, 1.2**
- [ ] 3. Implement `gst-17-truncated`
  - [ ] 3.1 Write the rule in the new code
    - _Requirements: 2.1_
  - [ ] 3.2 Write a property test that the new code and `trunc((bill.subtotal - bill.discount) * 0.17, 2)` agree on generated inputs
    - **Property 2: `gst-17-truncated`**
    - **Validates: Requirements 2.1**
- [ ] 4. Implement `bill-total`
  - [ ] 4.1 Write the rule in the new code
    - _Requirements: 3.1_
  - [ ] 4.2 Write a property test that the new code and `bill.subtotal - bill.discount + bill.gst` agree on generated inputs
    - **Property 3: `bill-total`**
    - **Validates: Requirements 3.1**
- [ ] 5. Implement `expired-batch-blocked`
  - [ ] 5.1 Write the rule in the new code
    - _Requirements: 4.1_
  - [ ] 5.2 Write a property test that the new code and `medicine.expiry >= today` agree on generated inputs
    - **Property 4: `expired-batch-blocked`**
    - **Validates: Requirements 4.1**
- [ ] 6. Implement `qty-over-stock-refused`
  - [ ] 6.1 Write the rule in the new code
    - _Requirements: 5.1_
  - [ ] 6.2 Write a property test that the new code and `item.qty <= medicine.qty` agree on generated inputs
    - **Property 5: `qty-over-stock-refused`**
    - **Validates: Requirements 5.1**
- [ ] 7. Implement `stock-decrement`
  - [ ] 7.1 Write the rule in the new code
    - _Requirements: 6.1_
  - [ ] 7.2 Write a property test that the new code and `medicine.qty - item.qty` agree on generated inputs
    - **Property 6: `stock-decrement`**
    - **Validates: Requirements 6.1**
- [ ] 8. Implement `bill-subtotal`
  - [ ] 8.1 Write the rule in the new code
    - _Requirements: 7.1_
  - [ ] 8.2 Write a property test that the new code and `sum(items, x => x.qty * x.price)` agree on generated inputs
    - **Property 7: `bill-subtotal`**
    - **Validates: Requirements 7.1**
- [ ] 9. Build the screens
  - [ ] 9.1 Build the MAIN MENU screen
  - [ ] 9.2 Build the NEW BILL screen
  - [ ] 9.3 Build the STOCK screen
  - [ ] 9.4 Build the CUSTOMERS screen

## Notes

- Each rule's property test is how the new code is checked against the old app: keep it passing.
- Keep the old app's odd behaviours too: see `.kiro/steering/legacy-behaviour.md`.
- Each task points at the requirements it covers.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "5.1", "6.1", "7.1", "8.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "4.2", "5.2", "6.2", "7.2", "8.2"] },
    { "id": 3, "tasks": ["9.1", "9.2", "9.3", "9.4"] }
  ]
}
```
