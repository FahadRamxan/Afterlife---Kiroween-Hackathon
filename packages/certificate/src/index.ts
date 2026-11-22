// @afterlife/certificate: the Rebirth Certificate, built, signed and verified (Prompt 71).
// Browser-safe: WebCrypto and @noble/ed25519 only, so /verify checks a certificate on the page.
export { CanonicalError, canonicalBytes, canonicalize } from './canonical';
export {
  CertificatePayloadSchema,
  ISSUER,
  ReconciliationLineSchema,
  SignedCertificateSchema,
  certificateText,
  fromHex,
  keyIdOf,
  newSigningKey,
  sha256Hex,
  signCertificate,
  signingKey,
  soulSha256,
  toHex,
  verifyCertificate,
  verifyCertificateText,
  type CertificatePayload,
  type SignedCertificate,
  type SigningKey,
  type Verification,
} from './certificate';
