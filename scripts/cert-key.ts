// pnpm cert:key (Prompt 71): a new Ed25519 key pair for the Rebirth Certificates. The secret goes
// in the worker's environment only (it signs); the public key goes on the API, which publishes it
// at /.well-known/afterlife-key. Printed once, not saved anywhere: keep the secret in Render's
// secret settings, never in the repo.
import { newSigningKey } from '@afterlife/certificate';

async function main() {
  const key = await newSigningKey();
  const hex = [...key.secretKey].map((b) => b.toString(16).padStart(2, '0')).join('');
  console.log('# The worker only (secret: it signs the certificates):');
  console.log(`CERT_SIGNING_KEY=${hex}`);
  console.log('# The API (public: it publishes it at /.well-known/afterlife-key):');
  console.log(`CERT_PUBLIC_KEY=${key.publicKey}`);
  console.log(`# key id ${key.keyId}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
