// The Rebirth Certificate (Prompt 71): the signed proof that the reborn app does what the old app
// did. Its payload says which app, which Soul (by version and SHA-256 of its canonical JSON), the
// proof run (seed and counts), the Undertaker's reconciliation totals, and the differences the
// owner accepted (the Exorcist's fixes, Prompt 74). It is signed with Ed25519 over its RFC 8785
// canonical bytes, so anyone with the public key (/.well-known/afterlife-key) can check it, in a
// browser too: this file uses only WebCrypto and @noble/ed25519.
import * as ed from '@noble/ed25519';
import { z } from 'zod';
import { canonicalBytes, canonicalize } from './canonical';

/** The certificate as a file: its canonical JSON (what verifyCertificateText takes). */
export const certificateText = (c: SignedCertificate) => canonicalize(c);

const Hex = (bytes: number) => z.string().regex(new RegExp(`^[0-9a-f]{${bytes * 2}}$`));

export const ReconciliationLineSchema = z.object({
  table: z.string(),
  total: z.string(),
  before: z.string(),
  rejected: z.string(),
  after: z.string(),
  ok: z.boolean(),
});

export const CertificatePayloadSchema = z.object({
  kind: z.literal('afterlife.rebirth-certificate'),
  version: z.literal(1),
  id: z.string().uuid(),
  issuedAt: z.iso.datetime(),
  project: z.string().uuid(),
  app: z.object({ name: z.string(), source: z.string(), sourceApp: z.string() }),
  soul: z.object({ version: z.number().int().positive(), sha256: Hex(32) }),
  proof: z.object({
    runId: z.string().uuid(),
    seed: z.number().int(),
    cases: z.number().int().positive(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    /** Cases that differ only as the owner's fixes say they should (Prompt 74). */
    accepted: z.number().int().nonnegative(),
  }),
  reconciliation: z.object({ matches: z.boolean(), lines: z.array(ReconciliationLineSchema) }),
  /** Differences from the old app the owner chose (Fix), each named: empty for a strict proof. */
  acceptedDivergences: z.array(z.object({ id: z.string(), text: z.string() })),
  issuer: z.object({ name: z.string(), keyId: Hex(8) }),
});
export type CertificatePayload = z.infer<typeof CertificatePayloadSchema>;

export const SignedCertificateSchema = z.object({
  payload: CertificatePayloadSchema,
  algorithm: z.literal('Ed25519'),
  canonicalization: z.literal('RFC8785'),
  /** Over the payload's canonical bytes, hex. */
  signature: Hex(64),
  publicKey: Hex(32),
});
export type SignedCertificate = z.infer<typeof SignedCertificateSchema>;

export const ISSUER = 'Afterlife (Matrix AE)';

export const toHex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
export function fromHex(s: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})*$/i.test(s)) throw new Error('Not hex');
  return Uint8Array.from(s.match(/../g) ?? [], (x) => parseInt(x, 16));
}

/** SHA-256 of bytes, hex (WebCrypto: Node 22 and browsers). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))));
}

/** The Soul's fingerprint on the certificate: SHA-256 of its canonical JSON. */
export const soulSha256 = (soul: unknown) => sha256Hex(canonicalBytes(soul));

/** The first 8 bytes of SHA-256 of the public key: names the key on a certificate. */
export const keyIdOf = async (publicKeyHex: string) =>
  (await sha256Hex(fromHex(publicKeyHex))).slice(0, 16);

export type SigningKey = { secretKey: Uint8Array; publicKey: string; keyId: string };

/** A signing key from its 32-byte secret, hex (CERT_SIGNING_KEY). */
export async function signingKey(secretHex: string): Promise<SigningKey> {
  const secretKey = fromHex(secretHex.trim());
  if (secretKey.length !== 32)
    throw new Error('CERT_SIGNING_KEY must be 32 bytes, hex (64 characters)');
  const publicKey = toHex(await ed.getPublicKeyAsync(secretKey));
  return { secretKey, publicKey, keyId: await keyIdOf(publicKey) };
}

/** A new random key (tests, and `pnpm cert:key` to make one). */
export const newSigningKey = () => signingKey(toHex(crypto.getRandomValues(new Uint8Array(32))));

/** Signs a payload: the Ed25519 signature of its canonical bytes. */
export async function signCertificate(
  payload: CertificatePayload,
  key: SigningKey,
): Promise<SignedCertificate> {
  const p = CertificatePayloadSchema.parse(payload);
  if (p.issuer.keyId !== key.keyId) throw new Error('The payload names another key');
  const signature = toHex(await ed.signAsync(canonicalBytes(p), key.secretKey));
  return {
    payload: p,
    algorithm: 'Ed25519',
    canonicalization: 'RFC8785',
    signature,
    publicKey: key.publicKey,
  };
}

export type Verification =
  | { ok: true; payload: CertificatePayload }
  | { ok: false; reason: 'malformed' | 'wrong-key' | 'bad-signature'; message: string };

/**
 * Checks a certificate: its shape, that it is signed by `publicKey` (the issuer's, from
 * /.well-known/afterlife-key; not the one the certificate carries, which anyone could replace),
 * and the signature over the payload's canonical bytes.
 */
export async function verifyCertificate(cert: unknown, publicKey: string): Promise<Verification> {
  const c = SignedCertificateSchema.safeParse(cert);
  if (!c.success)
    return {
      ok: false,
      reason: 'malformed',
      message: c.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    };
  if (
    c.data.publicKey !== publicKey.toLowerCase() ||
    c.data.payload.issuer.keyId !== (await keyIdOf(publicKey.toLowerCase()))
  )
    return { ok: false, reason: 'wrong-key', message: 'It is not signed with the Afterlife key' };
  let good: boolean;
  try {
    good = await ed.verifyAsync(
      fromHex(c.data.signature),
      canonicalBytes(c.data.payload),
      fromHex(publicKey),
    );
  } catch {
    good = false;
  }
  return good
    ? { ok: true, payload: c.data.payload }
    : {
        ok: false,
        reason: 'bad-signature',
        message: 'The signature does not match: the certificate was changed',
      };
}

/** Checks raw certificate bytes (a downloaded file): any byte changed must fail. */
export async function verifyCertificateText(
  text: string,
  publicKey: string,
): Promise<Verification> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'malformed', message: 'It is not JSON' };
  }
  // The file is the certificate's canonical JSON, exactly: so no byte of it can change unseen.
  try {
    if (canonicalize(json) !== text)
      return { ok: false, reason: 'malformed', message: 'It is not in its canonical form' };
  } catch {
    return { ok: false, reason: 'malformed', message: 'It is not in its canonical form' };
  }
  return verifyCertificate(json, publicKey);
}
