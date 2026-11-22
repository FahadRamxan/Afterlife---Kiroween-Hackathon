# Requirements Document

## Introduction

Prompts 71 and 72: the Rebirth Certificate. When the Oracle's proof finds no difference between the old app and the reborn app, and the Undertaker's migration of the same Soul reconciled exactly, the Oracle issues a certificate: what was proved, signed with Ed25519 over its RFC 8785 canonical JSON. Anyone can check it with the published public key, in a browser, without trusting the server that shows it.

## Glossary

- **Certificate**: the signed payload (`packages/certificate`): the app, the Soul's version and SHA-256, the proof run's seed and counts, the reconciliation totals, the accepted divergences, and the issuer's key id.
- **Canonical JSON**: RFC 8785 (JCS): members sorted by UTF-16 code units, no whitespace, ECMAScript number and string forms. The bytes that are signed, and the certificate file.
- **Issuer key**: the Ed25519 key pair. The worker holds the secret (`CERT_SIGNING_KEY`); the API publishes the public key (`CERT_PUBLIC_KEY`) at `/.well-known/afterlife-key`.
- **Accepted divergence**: a difference from the old app that the owner chose (the Exorcist's Fix, Prompt 74), named on the certificate.

## Requirements

### Requirement 1: Build, sign and verify

**User Story:** As a shop owner, I want a certificate that proves my new app does what the old one did, so that I can show it to anyone.

#### Acceptance Criteria

1. THE certificate SHALL be canonicalised with RFC 8785, and canonicalisation SHALL refuse what JSON cannot hold exactly (NaN, Infinity, undefined, a lone surrogate).
2. THE certificate SHALL be signed with Ed25519 over its canonical bytes, and SHALL carry the algorithm, the canonicalisation, the signature and the public key.
3. AN untouched certificate SHALL verify, and ANY byte change to the certificate file SHALL fail verification.
4. Verification SHALL use the issuer's published key, not the key the certificate carries.
5. THE certificate SHALL include the reconciliation totals and the accepted divergences.

### Requirement 2: Issue it after the proof

**User Story:** As a judge, I want the certificate issued only when the proof holds, so that it means something.

#### Acceptance Criteria

1. WHEN the proof of a Soul finds no difference, AND the undertake step reconciled the same Soul version exactly, THE prove step SHALL issue a certificate and keep it in `certificates`.
2. OTHERWISE THE prove step SHALL issue none and say why ("9 cases differ", "the data of Soul version 3 has not been migrated").
3. WITHOUT a signing key, THE worker SHALL issue none and say so; a malformed key SHALL be refused at start.
4. THE API SHALL serve the public key at `/.well-known/afterlife-key` and a certificate at `/api/certificates/:id` as its exact canonical file.
5. THE Proof tab SHALL show that a certificate was issued, with a link to download it, or why none was.

### Requirement 3: The verify page

**User Story:** As anyone holding a certificate, I want to check it myself, so that I do not have to trust the site.

#### Acceptance Criteria

1. `/verify/[certId]` SHALL fetch the certificate and the public key and verify the signature in the browser.
2. THE page SHALL show the certificate on bone paper with a wax seal, a QR code of its URL, and a PDF to download.
3. A tampered certificate SHALL be shown as not valid, in blood, with the reason.
