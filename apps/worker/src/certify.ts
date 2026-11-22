// Issuing the Rebirth Certificate (Prompt 71): after the prove step, when the proof holds. It is
// issued only for a proof with no difference, of a Soul whose data the Undertaker migrated and
// reconciled exactly; otherwise it says why not. The payload is signed (Ed25519 over its RFC 8785
// canonical bytes) and kept in `certificates`, one per proof run.
import {
  ISSUER,
  canonicalize,
  signCertificate,
  soulSha256,
  type CertificatePayload,
  type SigningKey,
} from '@afterlife/certificate';
import {
  and,
  certificates,
  eq,
  exorcisms,
  pipelineSteps,
  souls,
  uuidv7,
  type Db,
} from '@afterlife/db';

/** The data files a Soul describes: a fix changes rules, never these (Prompt 74). */
const entitiesOf = (ir: unknown) => canonicalize((ir as { entities?: unknown }).entities ?? null);

export type CertifyInput = {
  project: { id: string; name: string; source: string; sourceApp: string };
  soul: { id: string; version: number; ir: unknown };
  run: { id: string; seed: number };
  proof: { numRuns: number; passed: number; failed: number; skipped: number; accepted: number };
  key: SigningKey | null;
};

export type CertifyResult = { issued: true; id: string } | { issued: false; reason: string };

type UndertakeOutput = {
  soulVersion?: number;
  reconciliation?: { matches: boolean; lines: CertificatePayload['reconciliation']['lines'] };
} | null;

export async function issueCertificate(db: Db, x: CertifyInput): Promise<CertifyResult> {
  const [had] = await db
    .select({ id: certificates.id })
    .from(certificates)
    .where(eq(certificates.proofRunId, x.run.id));
  if (had) return { issued: true, id: had.id };
  if (x.proof.failed)
    return {
      issued: false,
      reason: `${x.proof.failed} ${x.proof.failed === 1 ? 'case differs' : 'cases differ'} from the old app`,
    };
  const [step] = await db
    .select({ status: pipelineSteps.status, output: pipelineSteps.output })
    .from(pipelineSteps)
    .where(and(eq(pipelineSteps.projectId, x.project.id), eq(pipelineSteps.step, 'undertake')));
  const out = (step?.status === 'done' ? step.output : null) as UndertakeOutput;
  if (!out?.reconciliation)
    return { issued: false, reason: 'The old app’s data has not been migrated yet' };
  // Data migrated for another version holds when that version's data files are the same.
  const [migratedFor] =
    out.soulVersion === x.soul.version
      ? [{ ir: x.soul.ir }]
      : await db
          .select({ ir: souls.ir })
          .from(souls)
          .where(and(eq(souls.projectId, x.project.id), eq(souls.version, out.soulVersion ?? -1)));
  if (!migratedFor || entitiesOf(migratedFor.ir) !== entitiesOf(x.soul.ir))
    return {
      issued: false,
      reason: `The data was migrated for Soul version ${out.soulVersion}, not version ${x.soul.version}: run the undertake step again`,
    };
  if (!out.reconciliation.matches)
    return { issued: false, reason: 'The migrated data does not reconcile with the old app’s' };
  if (!x.key) return { issued: false, reason: 'This worker has no signing key (CERT_SIGNING_KEY)' };
  // The differences the owner chose: the Exorcist's fixes (Prompt 74), in the order found.
  const fixed = await db
    .select({ code: exorcisms.code, title: exorcisms.titleEn, evidence: exorcisms.evidence })
    .from(exorcisms)
    .where(and(eq(exorcisms.projectId, x.project.id), eq(exorcisms.decision, 'fix')))
    .orderBy(exorcisms.createdAt);
  const id = uuidv7();
  const payload: CertificatePayload = {
    kind: 'afterlife.rebirth-certificate',
    version: 1,
    id,
    issuedAt: new Date().toISOString(),
    project: x.project.id,
    app: { name: x.project.name, source: x.project.source, sourceApp: x.project.sourceApp },
    soul: { version: x.soul.version, sha256: await soulSha256(x.soul.ir) },
    proof: {
      runId: x.run.id,
      seed: x.run.seed,
      cases: x.proof.numRuns,
      passed: x.proof.passed,
      failed: x.proof.failed,
      skipped: x.proof.skipped,
      accepted: x.proof.accepted,
    },
    reconciliation: {
      matches: true,
      lines: out.reconciliation.lines.map((l) => ({
        table: l.table,
        total: l.total,
        before: l.before,
        rejected: l.rejected,
        after: l.after,
        ok: l.ok,
      })),
    },
    // In the words of the fix: what the reborn app does instead of what the old app did.
    acceptedDivergences: fixed.map((f) => ({
      id: f.code,
      text: (f.evidence as { remedy?: { fixEn?: string } } | null)?.remedy?.fixEn || f.title,
    })),
    issuer: { name: ISSUER, keyId: x.key.keyId },
  };
  const cert = await signCertificate(payload, x.key);
  await db.insert(certificates).values({
    id,
    projectId: x.project.id,
    proofRunId: x.run.id,
    soulId: x.soul.id,
    payload: cert.payload,
    signature: cert.signature,
    publicKey: cert.publicKey,
    issuedAt: new Date(payload.issuedAt),
  });
  return { issued: true, id };
}
