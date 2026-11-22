// A certificate payload for tests (Prompt 71).
import { SHIFA_REFERENCE_SOUL } from '@afterlife/soul/examples/shifa';
import { ISSUER, soulSha256, type CertificatePayload } from './certificate';

export async function samplePayload(keyId: string): Promise<CertificatePayload> {
  return {
    kind: 'afterlife.rebirth-certificate',
    version: 1,
    id: '0192b6a0-0000-7000-8000-000000000001',
    issuedAt: '2026-11-20T10:00:00.000Z',
    project: '0192b6a0-0000-7000-8000-000000000002',
    app: { name: 'Shifa Medical Store', source: 'graveyard', sourceApp: 'shifa' },
    soul: { version: 3, sha256: await soulSha256(SHIFA_REFERENCE_SOUL) },
    proof: {
      runId: '0192b6a0-0000-7000-8000-000000000003',
      seed: 1998,
      cases: 200,
      passed: 188,
      failed: 0,
      skipped: 12,
      accepted: 0,
    },
    reconciliation: {
      matches: true,
      lines: [
        {
          table: 'MEDICINE.DBF',
          total: 'records',
          before: '40',
          rejected: '0',
          after: '40',
          ok: true,
        },
        {
          table: 'MEDICINE.DBF',
          total: 'stock value',
          before: '81234.50',
          rejected: '0',
          after: '81234.50',
          ok: true,
        },
      ],
    },
    acceptedDivergences: [],
    issuer: { name: ISSUER, keyId },
  };
}
