// The key that signs Rebirth Certificates (Prompt 71): CERT_SIGNING_KEY, 32 bytes of hex, a
// secret kept in the worker's environment only (the API gets the public key). Without it no
// certificate is issued; a malformed one stops the worker rather than issue none unseen.
import { signingKey, type SigningKey } from '@afterlife/certificate';

export async function certKeyFrom(
  env: Record<string, string | undefined>,
): Promise<SigningKey | null> {
  const hex = env.CERT_SIGNING_KEY?.trim();
  if (!hex) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(hex))
    throw new Error('CERT_SIGNING_KEY must be 32 bytes, hex (64 characters)');
  return signingKey(hex.toLowerCase());
}
