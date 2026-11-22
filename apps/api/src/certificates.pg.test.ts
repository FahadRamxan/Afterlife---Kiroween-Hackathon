// @spec rebirth-certificate#2.2 The API serves the public key and the certificate (Prompt 71).
import {
  certificateText,
  newSigningKey,
  signCertificate,
  verifyCertificateText,
  type SigningKey,
} from '@afterlife/certificate';
import { samplePayload } from '@afterlife/certificate/testing';
import { certificates, insertSoulVersion, proofRuns, souls, eq } from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { numberSoul, specRequirements } from '@afterlife/soul';
import { SHIFA_REFERENCE_SOUL } from '@afterlife/soul/examples/shifa';
import { uuidv7 } from '@afterlife/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { PgCertificateStore } from './certificates';
import { parseEnv } from './env';
import { PgProjectStore } from './projects-pg';

let t: TestDatabase;
let key: SigningKey;
let app: ReturnType<typeof buildApp>;
let bare: ReturnType<typeof buildApp>;
beforeAll(async () => {
  t = await freshDatabase();
  key = await newSigningKey();
  const stores = { projects: new PgProjectStore(t.db), certificates: new PgCertificateStore(t.db) };
  app = buildApp(parseEnv({ CERT_PUBLIC_KEY: key.publicKey }), { logger: false }, stores);
  bare = buildApp(parseEnv({}), { logger: false }, stores);
  await Promise.all([app.ready(), bare.ready()]);
});
afterAll(async () => {
  await Promise.all([app.close(), bare.close()]);
  await t.drop();
});

/** A certificate stored as the worker stores it. */
async function issued() {
  const p = await new PgProjectStore(t.db).create({
    name: 'Shifa',
    source: 'graveyard',
    sourceApp: 'shifa',
  });
  await insertSoulVersion(t.db, p.id, (v, parent) => {
    const s = numberSoul(SHIFA_REFERENCE_SOUL, p.id, v, parent);
    return { ir: s, specMarkdown: specRequirements(s) };
  });
  const [soul] = await t.db.select().from(souls).where(eq(souls.projectId, p.id));
  const [run] = await t.db
    .insert(proofRuns)
    .values({
      projectId: p.id,
      soulId: soul!.id,
      seed: 1998,
      caseCount: 200,
      status: 'passed',
      passed: 188,
    })
    .returning();
  const id = uuidv7();
  const cert = await signCertificate(
    { ...(await samplePayload(key.keyId)), id, project: p.id },
    key,
  );
  await t.db.insert(certificates).values({
    id,
    projectId: p.id,
    proofRunId: run!.id,
    soulId: soul!.id,
    payload: cert.payload,
    signature: cert.signature,
    publicKey: cert.publicKey,
  });
  return { id, cert };
}

describe('the certificate routes', () => {
  it('GET /.well-known/afterlife-key: the issuer’s public key and key id', async () => {
    const r = await app.inject({ method: 'GET', url: '/.well-known/afterlife-key' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      algorithm: 'Ed25519',
      canonicalization: 'RFC8785',
      publicKey: key.publicKey,
      keyId: key.keyId,
      issuer: 'Afterlife (Matrix AE)',
    });
    const none = await bare.inject({ method: 'GET', url: '/.well-known/afterlife-key' });
    expect(none.statusCode).toBe(404);
    expect(none.json().error).toBe('NO_KEY');
  });

  it('GET /api/certificates/:id: the exact canonical file, which verifies with that key', async () => {
    const { id, cert } = await issued();
    const r = await app.inject({ method: 'GET', url: `/api/certificates/${id}` });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toMatch(/^application\/json/);
    expect(r.body).toBe(certificateText(cert));
    expect(await verifyCertificateText(r.body, key.publicKey)).toMatchObject({ ok: true });
    // ?download: as a file named after the certificate.
    const d = await app.inject({ method: 'GET', url: `/api/certificates/${id}?download=1` });
    expect(d.headers['content-disposition']).toBe(
      `attachment; filename="rebirth-certificate-${id}.json"`,
    );
    expect(d.body).toBe(r.body);
  });

  it('an unknown id is 404, and a malformed one 400', async () => {
    expect(
      (await app.inject({ method: 'GET', url: `/api/certificates/${uuidv7()}` })).statusCode,
    ).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/certificates/nope' })).statusCode).toBe(
      400,
    );
  });

  it('a malformed CERT_PUBLIC_KEY is refused when the API starts', () => {
    expect(() => parseEnv({ CERT_PUBLIC_KEY: 'xyz' })).toThrow('CERT_PUBLIC_KEY');
  });
});
