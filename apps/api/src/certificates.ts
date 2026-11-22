// The Rebirth Certificate on the API (Prompt 71). The worker signs it; the API only publishes the
// public key (CERT_PUBLIC_KEY) at /.well-known/afterlife-key and serves each certificate as its
// exact canonical file, so anyone can check it without trusting this server: /verify (Prompt 72)
// verifies it in the browser.
import { ISSUER, certificateText, keyIdOf, type SignedCertificate } from '@afterlife/certificate';
import { certificates, eq, type Db } from '@afterlife/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

export interface CertificateStore {
  get(id: string): Promise<SignedCertificate | null>;
}

export class PgCertificateStore implements CertificateStore {
  constructor(private readonly db: Db) {}
  async get(id: string): Promise<SignedCertificate | null> {
    const [row] = await this.db.select().from(certificates).where(eq(certificates.id, id));
    if (!row) return null;
    return {
      payload: row.payload as SignedCertificate['payload'],
      algorithm: 'Ed25519',
      canonicalization: 'RFC8785',
      signature: row.signature,
      publicKey: row.publicKey,
    };
  }
}

const Id = z.uuid();

export function certificateRoutes(
  store: CertificateStore | undefined,
  publicKey: string | undefined,
) {
  return async (app: FastifyInstance) => {
    app.get('/.well-known/afterlife-key', async (_req, reply) => {
      if (!publicKey)
        return reply
          .code(404)
          .send({ error: 'NO_KEY', message: 'This server issues no Rebirth Certificates' });
      return reply.header('cache-control', 'public, max-age=3600').send({
        algorithm: 'Ed25519',
        canonicalization: 'RFC8785',
        publicKey,
        keyId: await keyIdOf(publicKey),
        issuer: ISSUER,
      });
    });
    app.get<{ Params: { id: string }; Querystring: { download?: string } }>(
      '/api/certificates/:id',
      async (req, reply) => {
        const { id } = req.params;
        if (!Id.safeParse(id).success)
          return reply.code(400).send({ error: 'BAD_ID', message: 'Not a certificate id' });
        const cert = store ? await store.get(id) : null;
        if (!cert)
          return reply.code(404).send({ error: 'NOT_FOUND', message: 'No such certificate' });
        reply.header('content-type', 'application/json; charset=utf-8');
        if (req.query.download !== undefined)
          reply.header(
            'content-disposition',
            `attachment; filename="rebirth-certificate-${id}.json"`,
          );
        // The canonical text itself, byte for byte: what verifyCertificateText checks.
        return reply.send(certificateText(cert));
      },
    );
  };
}
