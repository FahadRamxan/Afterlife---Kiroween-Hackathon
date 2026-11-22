// @spec exorcist#2.2 Prompt 74 done when: after a fix, the proof passes with the divergence listed,
// and the certificate shows it. The old app is Shifa as the 1998 app really runs (its two-digit-year
// expiry check); the project's Soul compares four-digit years. Strict, they differ; once the owner
// fixes the Y2K finding, the same differences are the fix, accepted, and only the cases it touches
// run again.
import { newSigningKey, verifyCertificate, type SigningKey } from '@afterlife/certificate';
import { exorcise, decideExorcism, type StoredFinding } from '@afterlife/crew';
import { recordedInput } from '@afterlife/crew/exorcist/testing';
import {
  certificates,
  eq,
  exorcisms,
  insertSoulVersion,
  pipelineSteps,
  projects,
} from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { vesselOldApp, type OldApp } from '@afterlife/oracle';
import { numberSoul, specRequirements } from '@afterlife/soul';
import { SHIFA_AS_IT_RUNS_SOUL, SHIFA_REFERENCE_SOUL } from '@afterlife/soul/examples/shifa';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { graveyardBundle } from './possess';
import { proveStep } from './prove-step';
import type { StepContext } from './registry';

let t: TestDatabase;
let key: SigningKey;
beforeAll(async () => {
  t = await freshDatabase();
  key = await newSigningKey();
});
afterAll(async () => {
  await t.drop();
});
const bundle = graveyardBundle({ source: 'graveyard', sourceApp: 'shifa' })!;
let oldRuns = 0;
const step = () =>
  proveStep({
    db: t.db,
    bundleFor: async () => bundle,
    numRuns: 60,
    lanes: 2,
    shrinkMs: 5_000,
    key,
    oldApp: (_soul, records, today) => async (work) => {
      const old = vesselOldApp(SHIFA_AS_IT_RUNS_SOUL, records, today);
      return work({ ...old, run: (c) => (oldRuns++, old.run(c)) } satisfies OldApp);
    },
  });
const ctx = (projectId: string): StepContext => ({
  projectId,
  project: { name: 'Shifa Medical Store', source: 'graveyard', sourceApp: 'shifa', dosTime: null },
  step: 'prove',
  attempt: 1,
  force: true,
  signal: new AbortController().signal,
  emit: async () => {},
  log: async () => {},
});
type Out = {
  failed: number;
  accepted: number;
  reused: number;
  passed: number;
  skipped: number;
  numRuns: number;
  certificate: { id?: string; reason?: string };
  acceptedDivergences: { id: string; text: string }[];
};

describe('a fix, proved', () => {
  it('strict, the Y2K check differs; fixed, the difference is accepted and listed on the certificate', async () => {
    const [p] = await t.db
      .insert(projects)
      .values({ name: 'Shifa Medical Store', source: 'graveyard', sourceApp: 'shifa' })
      .returning();
    const id = p!.id;
    await insertSoulVersion(t.db, id, (v, parent) => {
      const s = numberSoul(SHIFA_REFERENCE_SOUL, id, v, parent);
      return { ir: s, specMarkdown: specRequirements(s) };
    });
    // The data, migrated and reconciled for Soul version 1.
    await t.db.insert(pipelineSteps).values({
      projectId: id,
      step: 'undertake',
      status: 'done',
      output: { soulVersion: 1, reconciliation: { matches: true, lines: [] } },
    });
    // The Exorcist's Y2K finding, as the exorcise step stores it.
    const y2k = exorcise(recordedInput('shifa')).find(
      (f) => f.code === 'two-digit-year:medicine.expiry',
    )!;
    const stored: StoredFinding = {
      smell: y2k.smell,
      target: y2k.target!,
      en: y2k.en,
      ur: y2k.ur,
      since: y2k.since,
      evidence: y2k.evidence,
    };
    await t.db.insert(exorcisms).values({
      projectId: id,
      code: y2k.code,
      severity: y2k.severity,
      titleEn: y2k.titleEn,
      titleUr: y2k.titleUr,
      evidence: stored,
    });

    // Strict: the four-digit check sells batches the old app refuses.
    const strict = ((await step()(ctx(id))) as { output: Out }).output;
    expect(strict.failed).toBeGreaterThan(0);
    expect(strict.accepted).toBe(0);
    expect(strict.certificate.reason).toMatch(/cases? differs? from the old app$/);

    // The owner fixes it: a new Soul version.
    expect((await decideExorcism(t.db, id, y2k.code, 'fix')).soulVersion).toBe(2);
    oldRuns = 0;
    const fixed = ((await step()(ctx(id))) as { output: Out }).output;
    expect(fixed.failed).toBe(0);
    expect(fixed.accepted).toBeGreaterThanOrEqual(strict.failed);
    expect(fixed.acceptedDivergences).toEqual([
      { id: y2k.code, text: 'EXPIRY is compared with four-digit years' },
    ]);
    // Only the affected cases ran again on the old app: the rest held in the strict proof.
    expect(fixed.reused).toBeGreaterThan(0);
    expect(oldRuns).toBeLessThan(fixed.numRuns - fixed.reused + 1);
    expect(fixed.reused + oldRuns).toBeGreaterThanOrEqual(fixed.passed + fixed.accepted);

    // The certificate: issued, and it names the divergence.
    const [row] = await t.db
      .select()
      .from(certificates)
      .where(eq(certificates.id, fixed.certificate.id!));
    const v = await verifyCertificate(
      {
        payload: row!.payload,
        algorithm: 'Ed25519',
        canonicalization: 'RFC8785',
        signature: row!.signature,
        publicKey: row!.publicKey,
      },
      key.publicKey,
    );
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.payload.soul.version).toBe(2);
    expect(v.payload.proof).toMatchObject({ failed: 0, accepted: fixed.accepted });
    expect(v.payload.acceptedDivergences).toEqual([
      { id: y2k.code, text: 'EXPIRY is compared with four-digit years' },
    ]);
  });
});
