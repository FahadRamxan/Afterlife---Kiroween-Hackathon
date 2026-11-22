// @spec rebirth-certificate#1.2 Sign and verify the Rebirth Certificate (Prompt 71).
import { describe, expect, it } from 'vitest';
import {
  certificateText,
  keyIdOf,
  newSigningKey,
  signCertificate,
  signingKey,
  verifyCertificate,
  verifyCertificateText,
} from './certificate';

import { samplePayload } from './testing';

describe('the Rebirth Certificate', () => {
  it('an untouched certificate verifies, with the issuer’s key', async () => {
    const key = await newSigningKey();
    const cert = await signCertificate(await samplePayload(key.keyId), key);
    expect(cert).toMatchObject({
      algorithm: 'Ed25519',
      canonicalization: 'RFC8785',
      publicKey: key.publicKey,
    });
    expect(await verifyCertificate(cert, key.publicKey)).toMatchObject({ ok: true });
    expect(await verifyCertificateText(certificateText(cert), key.publicKey)).toMatchObject({
      ok: true,
    });
  });

  it('a changed total, case count or Soul hash fails', async () => {
    const key = await newSigningKey();
    const cert = await signCertificate(await samplePayload(key.keyId), key);
    const tampered = [
      { ...cert, payload: { ...cert.payload, proof: { ...cert.payload.proof, cases: 2000 } } },
      {
        ...cert,
        payload: { ...cert.payload, soul: { ...cert.payload.soul, sha256: '0'.repeat(64) } },
      },
      {
        ...cert,
        payload: {
          ...cert.payload,
          reconciliation: {
            ...cert.payload.reconciliation,
            lines: [{ ...cert.payload.reconciliation.lines[0]!, after: '41' }],
          },
        },
      },
    ];
    for (const t of tampered)
      expect(await verifyCertificate(t, key.publicKey)).toMatchObject({
        ok: false,
        reason: 'bad-signature',
      });
  });

  it('a certificate signed with another key, or carrying another key, is refused', async () => {
    const [ours, theirs] = [await newSigningKey(), await newSigningKey()];
    const forged = await signCertificate(await samplePayload(theirs.keyId), theirs);
    expect(await verifyCertificate(forged, ours.publicKey)).toMatchObject({
      ok: false,
      reason: 'wrong-key',
    });
  });

  it('something that is not a certificate is malformed', async () => {
    const key = await newSigningKey();
    for (const bad of [null, {}, { payload: 1 }, 'x'])
      expect(await verifyCertificate(bad, key.publicKey)).toMatchObject({
        ok: false,
        reason: 'malformed',
      });
    expect(await verifyCertificateText('{', key.publicKey)).toMatchObject({
      ok: false,
      reason: 'malformed',
    });
    // The same certificate written another way (pretty) is not the file that was issued.
    const cert = await signCertificate(await samplePayload(key.keyId), key);
    expect(await verifyCertificateText(JSON.stringify(cert, null, 2), key.publicKey)).toMatchObject(
      {
        ok: false,
        reason: 'malformed',
      },
    );
  });

  it('a key from CERT_SIGNING_KEY: 32 bytes of hex, its public key and key id', async () => {
    const k = await signingKey('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60');
    // RFC 8032 section 7.1, test 1.
    expect(k.publicKey).toBe('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a');
    expect(k.keyId).toBe(await keyIdOf(k.publicKey));
    expect(k.keyId).toHaveLength(16);
    await expect(signingKey('abcd')).rejects.toThrow('CERT_SIGNING_KEY must be 32 bytes');
  });

  it('signing refuses a payload naming another key', async () => {
    const key = await newSigningKey();
    await expect(signCertificate(await samplePayload('0'.repeat(16)), key)).rejects.toThrow(
      'another key',
    );
  });
});
