// Prompt 55: the values a project's old app wrote, and candidate rules checked against every one of
// its observations. The observations are Shifa's real DOSBox runs of three scripted bills.
import { observations, sessions } from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { shifaRun } from '../../../packages/crew/src/archaeologist/testing/shifa-runs';
import { buildApp } from './app';
import { parseEnv } from './env';
import { PgProjectStore } from './projects-pg';
import { PgRuleEvidenceStore, entitiesFromDiffs } from './rules';

let t: TestDatabase;
let app: ReturnType<typeof buildApp>;
let projects: PgProjectStore;
beforeAll(async () => {
  t = await freshDatabase();
  projects = new PgProjectStore(t.db);
  app = buildApp(
    parseEnv({}),
    { logger: false },
    { projects, ruleEvidence: new PgRuleEvidenceStore(t.db) },
  );
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await t.drop();
});

async function shifaWithBills(scenarios: string[]) {
  const p = await projects.create({ name: 'Shifa', source: 'graveyard', sourceApp: 'shifa' });
  const screen = { fingerprint: 'fp_1ea84e74e2cd7cec', text: [], model: null, cursor: null };
  let seq = 0;
  for (const s of scenarios) {
    const run = shifaRun(s);
    await t.db.insert(observations).values({
      projectId: p.id,
      seq: seq++,
      keys: '{F2}',
      screenBeforeFp: screen.fingerprint,
      screenAfterFp: screen.fingerprint,
      screenBefore: screen,
      screenAfter: screen,
      dbfDiff: run.dbfDiff,
      durationMs: 10,
      stable: true,
    });
  }
  return p.id;
}

describe('GET /api/projects/:id/rules/targets', () => {
  it('lists each value the old app wrote, with its effects and observations', async () => {
    const id = await shifaWithBills(['bill-small', 'bill-discount']);
    const res = await app.inject(`/api/projects/${id}/rules/targets`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.observations).toBe(2);
    expect(body.targets).toContainEqual({
      target: 'bill.gst',
      kind: 'inserted',
      effects: 2,
      observations: 2,
    });
    expect(body.targets).toContainEqual({
      target: 'medicine.qty',
      kind: 'changed',
      effects: 3,
      observations: 2,
    });
  });

  it('counts the observations of séances recorded on the project too', async () => {
    const id = await shifaWithBills([]);
    const [s] = await t.db
      .insert(sessions)
      .values({ app: 'shifa', projectId: id, sizeBytes: 10, startedAt: new Date() })
      .returning();
    const screen = { fingerprint: 'fp_1ea84e74e2cd7cec', text: [], model: null, cursor: null };
    await t.db.insert(observations).values({
      sessionId: s!.id,
      seq: 0,
      keys: '{F2}',
      screenBeforeFp: screen.fingerprint,
      screenAfterFp: screen.fingerprint,
      screenBefore: screen,
      screenAfter: screen,
      dbfDiff: shifaRun('bill-small').dbfDiff,
      durationMs: 10,
      stable: true,
    });
    const body = (await app.inject(`/api/projects/${id}/rules/targets`)).json();
    expect(body.observations).toBe(1);
    expect(body.targets.map((x: { target: string }) => x.target)).toContain('bill.gst');
  });
});

describe('POST /api/projects/:id/rules/verify', () => {
  it('selects the truncated GST, and shows where rounding goes wrong', async () => {
    const id = await shifaWithBills(['bill-small', 'bill-discount', 'bill-5000']);
    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${id}/rules/verify`,
      payload: {
        target: 'bill.gst',
        candidates: [
          'round((bill.subtotal - bill.discount) * 0.17, 2)',
          'trunc((bill.subtotal - bill.discount) * 0.17, 2)',
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const v = res.json();
    expect(v).toMatchObject({
      target: 'bill.gst',
      effects: 3,
      observations: 3,
      selected: { expression: 'trunc((bill.subtotal - bill.discount) * 0.17, 2)', coverage: 1 },
    });
    expect(v.checks[0]).toMatchObject({ explained: 2, total: 3 });
    expect(v.checks[0].misses[0]).toMatchObject({ expected: '14.87', got: '14.88' });
    // Observation ids are the project's rows.
    expect(v.selected.evidence).toHaveLength(3);
  });

  it('asks for a bill of exactly 5000 when the threshold was never tried', async () => {
    const id = await shifaWithBills(['bill-small', 'bill-discount']);
    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${id}/rules/verify`,
      payload: {
        target: 'bill.discount',
        candidates: [
          'if bill.subtotal > 5000 then trunc(bill.subtotal * 0.10, 2) else 0',
          'if bill.subtotal >= 5000 then trunc(bill.subtotal * 0.10, 2) else 0',
        ],
      },
    });
    expect(res.json().probes.map((p: { text: string }) => p.text)).toEqual([
      'Try a bill subtotal of exactly 5000 and of 5001.',
    ]);
  });

  it('refuses a bad body, a bad id and an unknown project', async () => {
    const id = await shifaWithBills([]);
    const post = (url: string, payload: Record<string, unknown>) =>
      app.inject({ method: 'POST', url, payload });
    expect(
      (await post(`/api/projects/${id}/rules/verify`, { target: 'bill.gst' })).statusCode,
    ).toBe(400);
    expect(
      (await post(`/api/projects/${id}/rules/verify`, { target: 'BILL', candidates: ['1'] }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await post(`/api/projects/${id}/rules/verify`, {
          target: 'bill.gst',
          candidates: Array.from({ length: 11 }, (_, i) => String(i)),
        })
      ).statusCode,
    ).toBe(400);
    expect((await app.inject('/api/projects/nope/rules/targets')).statusCode).toBe(400);
    expect(
      (await app.inject('/api/projects/0190a0b0-0000-7000-8000-000000000000/rules/targets'))
        .statusCode,
    ).toBe(404);
  });

  it('without a database it says so', async () => {
    const bare = buildApp(parseEnv({}), { logger: false }, { projects });
    const id = await shifaWithBills([]);
    expect((await bare.inject(`/api/projects/${id}/rules/targets`)).statusCode).toBe(503);
    await bare.close();
  });
});

describe('entitiesFromDiffs', () => {
  it('names the data files as the Soul does, with the key the diff matched by', () => {
    expect(entitiesFromDiffs([shifaRun('bill-small').dbfDiff])).toEqual([
      { id: 'bill', file: 'BILLS.DBF', key: ['BILL_NO'] },
      { id: 'bill-item', file: 'BILLITEM.DBF', key: [] },
      { id: 'medicine', file: 'MEDICINE.DBF', key: ['CODE'] },
    ]);
  });
});
