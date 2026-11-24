// @spec rebirth-certificate#2.1 The certificate is issued for a clean proof of migrated data only
// (Prompt 71), signed, kept, and verifiable with the issuer's key.
import {
  verifyCertificate,
  newSigningKey,
  soulSha256,
  type SigningKey,
} from '@afterlife/certificate';
import {
  certificates,
  desc,
  eq,
  exorcisms,
  insertSoulVersion,
  pipelineSteps,
  proofRuns,
  projects,
  souls,
} from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { numberSoul, specRequirements } from '@afterlife/soul';
import { SHIFA_AS_IT_RUNS_SOUL } from '@afterlife/soul/examples/shifa';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { issueCertificate } from './certify';

let t: TestDatabase;
let key: SigningKey;
beforeAll(async () => {
  t = await freshDatabase();
  key = await newSigningKey();
});
afterAll(async () => {
  await t.drop();
});

const LINES = [
  { table: 'MEDICINE.DBF', total: 'records', before: '40', rejected: '0', after: '40', ok: true },
];

/** A project with its Soul, a proof run of it, and (optionally) the undertake step's report. */
async function setup(
  opts: { failed?: number; undertake?: { soulVersion: number; matches: boolean } | null } = {},
) {
  const [p] = await t.db
    .insert(projects)
    .values({ name: 'Shifa Medical Store', source: 'graveyard', sourceApp: 'shifa' })
    .returning();
  await insertSoulVersion(t.db, p!.id, (v, parent) => {
    const s = numberSoul(SHIFA_AS_IT_RUNS_SOUL, p!.id, v, parent);
    return { ir: s, specMarkdown: specRequirements(s) };
  });
  const [soul] = await t.db.select().from(souls).where(eq(souls.projectId, p!.id));
  const failed = opts.failed ?? 0;
  const [run] = await t.db
    .insert(proofRuns)
    .values({
      projectId: p!.id,
      soulId: soul!.id,
      seed: 1998,
      caseCount: 50,
      status: failed ? 'failed' : 'passed',
      passed: 50 - failed - 2,
      failed,
    })
    .returning();
  const u = opts.undertake === undefined ? { soulVersion: 1, matches: true } : opts.undertake;
  if (u)
    await t.db.insert(pipelineSteps).values({
      projectId: p!.id,
      step: 'undertake',
      status: 'done',
      output: { soulVersion: u.soulVersion, reconciliation: { matches: u.matches, lines: LINES } },
    });
  return {
    project: p!,
    soul: soul!,
    run: run!,
    proof: { numRuns: 50, passed: 48 - failed, failed, skipped: 2, accepted: 0 },
  };
}
const issue = (s: Awaited<ReturnType<typeof setup>>, k: SigningKey | null = key) =>
  issueCertificate(t.db, {
    project: s.project,
    soul: { id: s.soul.id, version: s.soul.version, ir: s.soul.ir },
    run: { id: s.run.id, seed: 1998 },
    proof: s.proof,
    key: k,
  });

describe('issueCertificate', () => {
  it('a clean proof of migrated data: signed, kept, and it verifies with the issuer’s key', async () => {
    const s = await setup();
    const r = await issue(s);
    expect(r.issued).toBe(true);
    if (!r.issued) return;
    const [row] = await t.db.select().from(certificates).where(eq(certificates.id, r.id));
    expect(row).toMatchObject({
      projectId: s.project.id,
      proofRunId: s.run.id,
      soulId: s.soul.id,
      publicKey: key.publicKey,
    });
    const cert = {
      payload: row!.payload,
      algorithm: 'Ed25519',
      canonicalization: 'RFC8785',
      signature: row!.signature,
      publicKey: row!.publicKey,
    };
    const v = await verifyCertificate(cert, key.publicKey);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.payload).toMatchObject({
      id: r.id,
      project: s.project.id,
      app: { name: 'Shifa Medical Store', source: 'graveyard', sourceApp: 'shifa' },
      soul: { version: 1, sha256: await soulSha256(s.soul.ir) },
      proof: {
        runId: s.run.id,
        seed: 1998,
        cases: 50,
        passed: 48,
        failed: 0,
        skipped: 2,
        accepted: 0,
      },
      reconciliation: { matches: true, lines: LINES },
      acceptedDivergences: [],
      issuer: { keyId: key.keyId },
    });
  });

  it('lists the differences the owner chose to fix, by their own words', async () => {
    const s = await setup();
    await t.db.insert(exorcisms).values([
      {
        projectId: s.project.id,
        code: 'y2k-expiry',
        severity: 'high',
        titleEn: 'Medicine expiry is compared with two-digit years',
        titleUr: 'x',
        // The remedy kept when the owner chose: its words name what the reborn app does instead.
        evidence: { remedy: { fixEn: 'EXPIRY is compared with four-digit years' } },
        decision: 'fix',
        decidedAt: new Date(),
      },
      {
        projectId: s.project.id,
        code: 'kept-one',
        severity: 'low',
        titleEn: 'Kept',
        titleUr: 'x',
        evidence: [],
        decision: 'keep',
        decidedAt: new Date(),
      },
    ]);
    const r = await issue(s);
    expect(r.issued).toBe(true);
    if (!r.issued) return;
    const [row] = await t.db.select().from(certificates).where(eq(certificates.id, r.id));
    expect((row!.payload as { acceptedDivergences: unknown }).acceptedDivergences).toEqual([
      { id: 'y2k-expiry', text: 'EXPIRY is compared with four-digit years' },
    ]);
  });

  // @spec exorcist#2.2 A fix changes a rule, not the data: the migration of the version before holds.
  it('a new Soul version that changes only rules is proved on the data migrated for the one before', async () => {
    const s = await setup();
    await insertSoulVersion(t.db, s.project.id, (v, parent) => {
      const soul = numberSoul(
        { ...SHIFA_AS_IT_RUNS_SOUL, rules: SHIFA_AS_IT_RUNS_SOUL.rules.slice(1) },
        s.project.id,
        v,
        parent,
      );
      return { ir: soul, specMarkdown: specRequirements(soul) };
    });
    const [v2] = await t.db
      .select()
      .from(souls)
      .where(eq(souls.projectId, s.project.id))
      .orderBy(desc(souls.version))
      .limit(1);
    const r = await issueCertificate(t.db, {
      project: s.project,
      soul: { id: v2!.id, version: v2!.version, ir: v2!.ir },
      run: { id: s.run.id, seed: 1998 },
      proof: s.proof,
      key,
    });
    expect(r.issued).toBe(true);
  });

  it('a new Soul version with other data files needs the data migrated again', async () => {
    const s = await setup();
    const soul = SHIFA_AS_IT_RUNS_SOUL;
    const other = {
      ...soul,
      entities: soul.entities.map((e, i) => (i ? e : { ...e, name: 'Something else' })),
    };
    await insertSoulVersion(t.db, s.project.id, (v, parent) => {
      const x = numberSoul(other, s.project.id, v, parent);
      return { ir: x, specMarkdown: specRequirements(x) };
    });
    const [v2] = await t.db
      .select()
      .from(souls)
      .where(eq(souls.projectId, s.project.id))
      .orderBy(desc(souls.version))
      .limit(1);
    expect(
      await issueCertificate(t.db, {
        project: s.project,
        soul: { id: v2!.id, version: v2!.version, ir: v2!.ir },
        run: { id: s.run.id, seed: 1998 },
        proof: s.proof,
        key,
      }),
    ).toEqual({
      issued: false,
      reason:
        'The data was migrated for Soul version 1, not version 2: run the undertake step again',
    });
  });

  it('says why none was issued: differences, data not migrated or not reconciled, no key', async () => {
    // None of these cases issues one.
    const before = (await t.db.select().from(certificates)).length;
    expect(await issue(await setup({ failed: 9 }))).toEqual({
      issued: false,
      reason: '9 cases differ from the old app',
    });
    expect(await issue(await setup({ failed: 1 }))).toEqual({
      issued: false,
      reason: '1 case differs from the old app',
    });
    expect(await issue(await setup({ undertake: null }))).toEqual({
      issued: false,
      reason: 'The old app’s data has not been migrated yet',
    });
    expect(await issue(await setup({ undertake: { soulVersion: 2, matches: true } }))).toEqual({
      issued: false,
      reason:
        'The data was migrated for Soul version 2, not version 1: run the undertake step again',
    });
    expect(await issue(await setup({ undertake: { soulVersion: 1, matches: false } }))).toEqual({
      issued: false,
      reason: 'The migrated data does not reconcile with the old app’s',
    });
    expect(await issue(await setup(), null)).toEqual({
      issued: false,
      reason: 'This worker has no signing key (CERT_SIGNING_KEY)',
    });
    // No difference, but most cases skipped: too little was proved (as in pnpm proof:shifa).
    const skippy = await setup();
    expect(
      await issue({
        ...skippy,
        proof: { numRuns: 50, passed: 20, failed: 0, skipped: 30, accepted: 4 },
      }),
    ).toEqual({
      issued: false,
      reason: 'Only 24 of 50 cases ran (the others were skipped): too few to certify',
    });
    expect(await t.db.select().from(certificates)).toHaveLength(before);
  });

  it('one certificate per proof run: issuing again gives the same one', async () => {
    const s = await setup();
    const a = await issue(s);
    const b = await issue(s);
    expect(a).toEqual(b);
  });
});
