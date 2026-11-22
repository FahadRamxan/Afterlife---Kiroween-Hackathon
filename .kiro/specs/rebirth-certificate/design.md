# Design Document

## Overview

`@afterlife/certificate` canonicalises (RFC 8785), signs and verifies (Ed25519, `@noble/ed25519`). It uses only WebCrypto, so the same code verifies on the server, in tests and in the browser. The worker's prove step issues the certificate; the API serves it and the public key; the Proof tab links to it; `/verify/[certId]` checks it (Prompt 72).

## Architecture

- `packages/certificate/src/canonical.ts`: `canonicalize(value)`, `canonicalBytes(value)`, `CanonicalError`.
- `packages/certificate/src/certificate.ts`: `CertificatePayloadSchema`, `SignedCertificateSchema`, `signingKey(hex)`, `newSigningKey()`, `signCertificate(payload, key)`, `verifyCertificate(cert, publicKey)`, `verifyCertificateText(text, publicKey)`, `certificateText(cert)`, `soulSha256(soul)`, `keyIdOf(publicKey)`.
- `apps/worker/src/certify.ts`: `issueCertificate(db, {...})`: the checks of Requirement 2, then the payload, signed and stored.
- `apps/worker/src/prove-step.ts`: calls it after the proof; its output says `certificate: { id } | { reason }`.
- `apps/api/src/certificates.ts`: `GET /.well-known/afterlife-key`, `GET /api/certificates/:id`; `PgCertificateStore`.
- `apps/web/components/ProofPanel.tsx`: the certificate line, with Download and Verify it.
- `packages/certificate/src/summary.ts`: `certificateLines(payload)` (the certificate in words) and `certificatePdf(cert, url)` (A4, Courier, written by hand like the receipt's PDF; it carries the URL, the public key and the signature).
- `apps/web/app/verify/[certId]/page.tsx` and `apps/web/components/VerifyCertificate.tsx`: fetch the certificate's file and the published key, verify in the browser, then the paper (`CertificateFrame`), a QR code of the page (`qrcode`, as SVG) and the PDF. Not valid: a blood panel with the reason. An id that is not a UUID keeps the empty state.

## Components and Interfaces

- The payload: `{ kind: 'afterlife.rebirth-certificate', version: 1, id, issuedAt, project, app: { name, source, sourceApp }, soul: { version, sha256 }, proof: { runId, seed, cases, passed, failed, skipped }, reconciliation: { matches, lines }, acceptedDivergences: [{ id, text }], issuer: { name, keyId } }`.
- The signed certificate: `{ payload, algorithm: 'Ed25519', canonicalization: 'RFC8785', signature, publicKey }`, hex. The file is its canonical JSON.
- `keyId`: the first 8 bytes of SHA-256 of the public key, hex.
- Keys: `CERT_SIGNING_KEY` (worker, 32-byte secret, hex) and `CERT_PUBLIC_KEY` (API, 32 bytes, hex). The e2e run uses RFC 8032's published test key 1, which is never a production key.

## Data Models

- `certificates` (Prompt 35's table): `id` (the payload's id), `project_id`, `proof_run_id` (unique: one certificate per proof run), `soul_id`, `payload` (jsonb), `signature`, `public_key`, `issued_at`.
- The prove step's output gains `certificate: { id } | { reason }`; the steps API passes it on in `proof.certificate`.

## Correctness Properties

### Property 1: Canonical JSON round-trips and ignores member order

For any JSON value, `JSON.parse(canonicalize(v))` equals `v`, canonical text is its own canonical form, and the order members were written in does not change it.

**Validates: Requirements 1.1**

### Property 2: An untouched certificate verifies

For any payload signed with a key, its file verifies with that key.

**Validates: Requirements 1.2, 1.3**

### Property 3: Any byte change fails verification

For any byte of the certificate file and any change to it, verification fails.

**Validates: Requirements 1.3**

## Error Handling

- A proof with differences, or unreconciled or unmigrated data for the Soul: no certificate, the reason in the step's output and log.
- No `CERT_SIGNING_KEY`: no certificate, said in the log. A malformed key: the worker does not start.
- No `CERT_PUBLIC_KEY`: `/.well-known/afterlife-key` answers 404 `NO_KEY`. An unknown certificate: 404 `NOT_FOUND`.

## Testing Strategy

- Unit and property tests of canonicalisation and signing (RFC 8032 test vector 1, RFC 8785 number forms).
- Postgres tests of `issueCertificate` and the routes.
- e2e: a live raise of Shifa given the Soul of the app as it runs, migrated and proved again; the Proof tab says the certificate was issued, and the downloaded file verifies with the published key, and fails once changed.
