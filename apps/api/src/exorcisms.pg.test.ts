// @spec exorcist#2.1 The owner's choice through the API (Prompt 74): the findings, and Keep or Fix,
// which writes the Soul version and proves it again.
import { exorcise, type StoredFinding } from '@afterlife/crew';
import { recordedInput } from '@afterlife/crew/exorcist/testing';
import { exorcisms, insertSoulVersion, latestSoulRow } from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { numberSoul, specRequirements } from '@afterlife/soul';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { parseEnv } from './env';
import { PgExorcismStore } from './exorcisms';
import type { Pipeline } from './projects';
import { PgProjectStore } from './projects-pg';

let t: TestDatabase;
let app: ReturnType<typeof buildApp>;
let projects: PgProjectStore;
const reruns: [string, string][] = [];
const pipeline: Pipeline = {
  start: async () => {},
  steps: async () => [],
  rerun: async (id, step) => (reruns.push([id, step]), true),
};
beforeAll(async () => {
  t = await freshDatabase();
  projects = new PgProjectStore(t.db);
  app = buildApp(
    parseEnv({}),
    { logger: false },
    { projects, pipeline, exorcisms: new PgExorcismStore(t.db) },
  );
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await t.drop();
});

const shifa = recordedInput('shifa');
async function project() {
  const p = await projects.create({ name: 'Shifa', source: 'graveyard', sourceApp: 'shifa' });
  await insertSoulVersion(t.db, p.id, (v, parent) => {
    const s = numberSoul(shifa.soul, p.id, v, parent);
    return { ir: s, specMarkdown: specRequirements(s) };
  });
  for (const f of exorcise(shifa)) {
    const stored: StoredFinding = {
      smell: f.smell,
      target: f.target ?? null,
      en: f.en,
      ur: f.ur,
      since: f.since,
      evidence: f.evidence,
    };
    await t.db.insert(exorcisms).values({
      projectId: p.id,
      code: f.code,
      severity: f.severity,
      titleEn: f.titleEn,
      titleUr: f.titleUr,
      evidence: stored,
    });
  }
  return p.id;
}
const list = async (id: string) =>
  (await app.inject({ method: 'GET', url: `/api/projects/${id}/exorcisms` })).json();
const decide = (id: string, code: string, decision: string) =>
  app.inject({
    method: 'POST',
    url: `/api/projects/${id}/exorcisms/${encodeURIComponent(code)}`,
    payload: { decision },
  });

describe('the exorcism routes', () => {
  it('GET: each finding with its words, evidence, since and whether it can be fixed; the ghosts left', async () => {
    const id = await project();
    const body = await list(id);
    expect(body.remaining).toBe(2);
    const y2k = body.findings.find(
      (f: { code: string }) => f.code === 'two-digit-year:medicine.expiry',
    );
    expect(y2k).toMatchObject({
      severity: 'high',
      decision: 'pending',
      since: 1998,
      fixable: true,
      fixEn: 'EXPIRY is compared with four-digit years',
    });
    expect(y2k.titleUr).toMatch(/[\u0600-\u06FF]/);
    expect(y2k.evidence.length).toBeGreaterThan(0);
    // Most severe first.
    expect(body.findings.map((f: { severity: string }) => f.severity)).toEqual(['high', 'medium']);
  });

  it('POST fix: a new Soul version, the proof run again, one ghost fewer', async () => {
    const id = await project();
    reruns.length = 0;
    const r = await decide(id, 'two-digit-year:medicine.expiry', 'fix');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ decision: 'fix', soulVersion: 2, changed: true, proving: true });
    expect(reruns).toEqual([[id, 'prove']]);
    expect((await latestSoulRow(t.db, id))!.version).toBe(2);
    expect((await list(id)).remaining).toBe(1);
  });

  it('POST keep that changes nothing: recorded, no new version, nothing to prove again', async () => {
    const id = await project();
    reruns.length = 0;
    const r = await decide(id, 'negative-allowed:medicine.qty', 'keep');
    expect(r.json()).toEqual({ decision: 'keep', soulVersion: 1, changed: false, proving: false });
    expect(reruns).toEqual([]);
  });

  it('refuses a second choice (409), an unknown finding (404) and a bad decision (400)', async () => {
    const id = await project();
    await decide(id, 'negative-allowed:medicine.qty', 'keep');
    const again = await decide(id, 'negative-allowed:medicine.qty', 'fix');
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe('ALREADY_DECIDED');
    expect((await decide(id, 'nope:x', 'fix')).statusCode).toBe(404);
    expect((await decide(id, 'negative-allowed:medicine.qty', 'maybe')).statusCode).toBe(400);
    expect(
      (await app.inject({ method: 'GET', url: '/api/projects/nope/exorcisms' })).statusCode,
    ).toBe(400);
  });
});
