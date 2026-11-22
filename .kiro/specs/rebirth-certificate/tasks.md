# Implementation Plan: Rebirth Certificate

## Overview

Prompt 71 is task 1 and 2, Prompt 72 task 3.

## Tasks

- [x] 1. The certificate package
  - [x] 1.1 Implement RFC 8785 canonical JSON, with round-trip and order properties
    - _Requirements: 1.1_
  - [x] 1.2 Implement signing and verification with Ed25519, against the issuer's key
    - _Requirements: 1.2, 1.4, 1.5_
  - [x] 1.3 Prove an untouched certificate verifies and any byte change fails
    - _Requirements: 1.3_
- [x] 2. Issue and serve it
  - [x] 2.1 Issue the certificate in the prove step, only for a clean proof of migrated data
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 2.2 Serve the public key and the certificate from the API
    - _Requirements: 2.4_
  - [x] 2.3 Show it on the Proof tab, with an e2e test that verifies the download
    - _Requirements: 2.5_
- [x] 3. The verify page
  - [x] 3.1 Add /verify/[certId]: browser verification, paper, seal, QR and PDF
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 3.2 e2e: a valid certificate and a tampered one
    - _Requirements: 3.3_

## Notes

- The e2e run signs with RFC 8032's published test key 1; production keys come from `pnpm cert:key` and live in the worker's secrets only.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "2.1"] },
    { "id": 3, "tasks": ["2.2"] },
    { "id": 4, "tasks": ["2.3", "3.1"] },
    { "id": 5, "tasks": ["3.2"] }
  ]
}
```
