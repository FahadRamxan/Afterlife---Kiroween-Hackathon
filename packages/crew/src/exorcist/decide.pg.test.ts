// @spec exorcist#2 Keep or fix.
// @spec exorcist#2.1 The owner's decision (Prompt 74): kept on the finding, and a new Soul version
// when it changes a rule.
import { eq, exorcisms, insertSoulVersion, latestSoulRow, projects } from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { SoulSchema, numberSoul, specRequirements } from '@afterlife/soul';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DecisionError, decideExorcism, findingOf, type StoredFinding } from './decide';
import { exorcise } from './exorcise';
import { recordedInput } from './testing';
import type { Finding } from './types';

let t: TestDatabase;
beforeAll(async () => {
  t = await freshDatabase();
});
afterAll(async () => {
  await t.drop();
});

const shifa = recordedInput('shifa');
const late: Finding = {
  ...exorcise(shifa)[0]!,
  code: 'date-arithmetic:payment.late_fee',
  smell: 'date-arithmetic',
  target: 'payment.late_fee',
};

/** A Shifa project with its inferred Soul and its findings stored as the exorcise step stores them. */
async function project() {
  const [p] = await t.db
    .insert(projects)
    .values({ name: 'Shifa', source: 'graveyard', sourceApp: 'shifa' })
    .returning();
  await insertSoulVersion(t.db, p!.id, (v, parent) => {
    const s = numberSoul(shifa.soul, p!.id, v, parent);
    return { ir: s, specMarkdown: specRequirements(s) };
  });
  for (const f of [...exorcise(shifa), late]) {
    const stored: StoredFinding = {
      smell: f.smell,
      target: f.target ?? null,
      en: f.en,
      ur: f.ur,
      since: f.since,
      evidence: f.evidence,
    };
    await t.db.insert(exorcisms).values({
      projectId: p!.id,
      code: f.code,
      severity: f.severity,
      titleEn: f.titleEn,
      titleUr: f.titleUr,
      evidence: stored,
    });
  }
  return p!.id;
}
const row = async (projectId: string, code: string) =>
  (await t.db.select().from(exorcisms).where(eq(exorcisms.projectId, projectId))).find(
    (x) => x.code === code,
  )!;

describe('decideExorcism', () => {
  it('Fix: a new Soul version with the corrected rule, and the remedy kept on the finding', async () => {
    const id = await project();
    const r = await decideExorcism(t.db, id, 'two-digit-year:medicine.expiry', 'fix');
    expect(r).toMatchObject({ decision: 'fix', soulVersion: 2, changed: true });
    const soul = SoulSchema.parse((await latestSoulRow(t.db, id))!.ir);
    expect(soul.version).toBe(2);
    expect(soul.rules.some((x) => x.expression === 'medicine.expiry >= today')).toBe(true);
    expect(soul.provenance.note).toBe(
      'Fixed medicine expiry is compared with two-digit years (Exorcist)',
    );
    const x = await row(id, 'two-digit-year:medicine.expiry');
    expect(x.decision).toBe('fix');
    expect(x.decidedAt).not.toBeNull();
    expect((x.evidence as StoredFinding).remedy!.fixEn).toBe(
      'EXPIRY is compared with four-digit years',
    );
    expect((x.evidence as StoredFinding).soulVersion).toBe(2);
    // What it found stays as it was.
    expect(findingOf(x).evidence.length).toBeGreaterThan(0);
  });

  it('Keep that changes nothing writes no new version; Keep that copies the old rule does', async () => {
    const id = await project();
    expect(await decideExorcism(t.db, id, 'negative-allowed:medicine.qty', 'keep')).toMatchObject({
      soulVersion: 1,
      changed: false,
    });
    expect((await latestSoulRow(t.db, id))!.version).toBe(1);
    expect(await decideExorcism(t.db, id, 'two-digit-year:medicine.expiry', 'keep')).toMatchObject({
      soulVersion: 2,
      changed: true,
    });
  });

  it('refuses a second decision, a fix the rule language cannot make, and an unknown finding', async () => {
    const id = await project();
    await decideExorcism(t.db, id, 'negative-allowed:medicine.qty', 'fix');
    const fails = async (code: string, d: 'keep' | 'fix') =>
      ((await decideExorcism(t.db, id, code, d).catch((e) => e)) as DecisionError).code;
    expect(await fails('negative-allowed:medicine.qty', 'keep')).toBe('ALREADY_DECIDED');
    expect(await fails('date-arithmetic:payment.late_fee', 'fix')).toBe('NOT_FIXABLE');
    expect(await fails('nope', 'keep')).toBe('NOT_FOUND');
    // The late fee can still be kept.
    expect(
      await decideExorcism(t.db, id, 'date-arithmetic:payment.late_fee', 'keep'),
    ).toMatchObject({ decision: 'keep' });
  });
});
