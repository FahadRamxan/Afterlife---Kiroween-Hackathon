// @spec rebirth-certificate#2.1 The worker's signing key from its environment (Prompt 71).
import { describe, expect, it } from 'vitest';
import { certKeyFrom } from './cert-key';

// RFC 8032 section 7.1, test 1: a published key, for tests only.
const SECRET = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';

describe('certKeyFrom', () => {
  it('reads CERT_SIGNING_KEY: its public key and key id', async () => {
    const k = await certKeyFrom({ CERT_SIGNING_KEY: SECRET });
    expect(k!.publicKey).toBe('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a');
  });

  it('no key: none (certificates are not issued, and the prove step says so)', async () => {
    expect(await certKeyFrom({})).toBeNull();
    expect(await certKeyFrom({ CERT_SIGNING_KEY: '' })).toBeNull();
  });

  it('a malformed key stops the worker, naming the variable but never its value', async () => {
    await expect(certKeyFrom({ CERT_SIGNING_KEY: 'not-a-key' })).rejects.toThrow(
      'CERT_SIGNING_KEY must be 32 bytes, hex (64 characters)',
    );
    await expect(certKeyFrom({ CERT_SIGNING_KEY: 'ab'.repeat(31) })).rejects.not.toThrow(/abab/);
  });
});
