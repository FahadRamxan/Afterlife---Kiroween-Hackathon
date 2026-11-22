// @spec rebirth-certificate#1.3 The certificate's properties (Prompt 71, testing-rule.md): an
// untouched certificate verifies, and any byte change fails verification.
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  certificateText,
  newSigningKey,
  signCertificate,
  verifyCertificateText,
  type SigningKey,
} from './certificate';
import { samplePayload } from './testing';

let key: SigningKey;
let text: string;
beforeAll(async () => {
  key = await newSigningKey();
  text = certificateText(await signCertificate(await samplePayload(key.keyId), key));
});
// Each check is an Ed25519 verification: a few hundred keep the run short at 2000 nightly.
const RUNS = Math.min(Number(process.env.FC_NUM_RUNS ?? 100), 300);

describe('certificate properties', () => {
  it('any certificate signed and untouched verifies (invariant)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.string({ maxLength: 40 }),
        async (cases, seed, name) => {
          const p = await samplePayload(key.keyId);
          const cert = await signCertificate(
            {
              ...p,
              app: { ...p.app, name },
              proof: { ...p.proof, cases, seed, passed: cases, skipped: 0 },
            },
            key,
          );
          expect(await verifyCertificateText(certificateText(cert), key.publicKey)).toMatchObject({
            ok: true,
          });
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('any one byte changed fails verification (invariant)', async () => {
    const bytes = new TextEncoder().encode(text);
    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: bytes.length - 1 }),
        fc.integer({ min: 1, max: 255 }),
        async (at, flip) => {
          const changed = bytes.slice();
          changed[at] = changed[at]! ^ flip;
          const r = await verifyCertificateText(
            new TextDecoder('utf-8', { fatal: false }).decode(changed),
            key.publicKey,
          );
          expect(r.ok, `byte ${at} ^ ${flip}`).toBe(false);
        },
      ),
      { numRuns: RUNS },
    );
  });
});
