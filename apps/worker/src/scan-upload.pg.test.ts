// Prompt 40: an uploaded app is virus-scanned and bundled by the worker before possession.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createBoss,
  ensureQueues,
  eq,
  pipelineSteps,
  projects,
  startPipeline,
  uploads,
  type JobOptions,
  type JobType,
} from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { strToU8, unzipSync, zipSync } from 'fflate';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startJobLoop, type JobLoop } from './loop';
import { waitForPipeline } from './pipeline';
import { defaultRegistry, type Registry } from './registry';
import { EICAR, EicarTestScanner } from './scanner';

vi.setConfig({ testTimeout: 60_000 });

const DIST = resolve(__dirname, '../../../samples/graveyard/dist/shifa');
const file = (n: string) => new Uint8Array(readFileSync(resolve(DIST, n)));
const NO_RETRY = {
  'scan-upload': { retryLimit: 0, retryDelay: 0, retryBackoff: false },
} as Partial<Record<JobType, Partial<JobOptions>>>;

let t: TestDatabase;
let boss: PgBoss;
let loop: JobLoop;
const booted: string[] = [];

beforeAll(async () => {
  t = await freshDatabase();
  boss = createBoss(t.url);
  await boss.start();
  await ensureQueues(boss, NO_RETRY);
  const registry: Registry = {
    ...defaultRegistry({ db: t.db, scanner: new EicarTestScanner() }),
    // Possession itself is tested elsewhere; here it only records that it was reached.
    possess: async (ctx) => {
      booted.push(ctx.projectId);
      return { status: 'skipped', reason: 'reached' };
    },
  };
  loop = await startJobLoop({
    db: t.db,
    boss,
    registry,
    options: NO_RETRY,
    pollingIntervalSeconds: 0.5,
  });
});
afterAll(async () => {
  await loop?.stop();
  await boss?.stop({ graceful: false });
  await t.drop();
});

async function upload(zip: Uint8Array) {
  const [p] = await t.db
    .insert(projects)
    .values({ name: 'SHIFA (uploaded)', source: 'upload', sourceApp: 'shifa.zip' })
    .returning();
  await t.db.insert(uploads).values({
    projectId: p!.id,
    fileName: 'shifa.zip',
    sha256: 'x',
    size: zip.length,
    executable: 'SHIFA.EXE',
    zip,
  });
  await startPipeline(boss, t.db, p!.id, { from: 'scan-upload' });
  return p!.id;
}

async function step(id: string, s: string) {
  const rows = await t.db.select().from(pipelineSteps).where(eq(pipelineSteps.projectId, id));
  return rows.find((r) => r.step === s);
}

describe('scan-upload', () => {
  it('a clean upload is bundled, its zip dropped, and possession comes next', async () => {
    const id = await upload(
      zipSync({ 'SHIFA.EXE': file('SHIFA.EXE'), 'MEDICINE.DBF': file('MEDICINE.DBF') }),
    );
    await waitForPipeline(t.db, id, 30_000).catch(() => null);
    const end = Date.now() + 20_000;
    while (!booted.includes(id) && Date.now() < end) await new Promise((r) => setTimeout(r, 200));
    expect(booted).toContain(id);
    const [u] = await t.db.select().from(uploads).where(eq(uploads.projectId, id));
    expect(u).toMatchObject({
      status: 'clean',
      zip: null,
      scanner: expect.stringMatching(/EICAR only/),
    });
    const bundle = unzipSync(u!.bundle!);
    expect(Object.keys(bundle).sort()).toEqual(['.jsdos/dosbox.conf', 'MEDICINE.DBF', 'SHIFA.EXE']);
    expect((await step(id, 'scan-upload'))!.status).toBe('done');
  });

  it('an infected upload is deleted, never bundled or run, and the project fails at once', async () => {
    const id = await upload(
      zipSync({
        'SHIFA.EXE': file('SHIFA.EXE'),
        'MEDICINE.DBF': file('MEDICINE.DBF'),
        'README.TXT': strToU8(EICAR),
      }),
    );
    const s = await waitForPipeline(t.db, id, 30_000);
    expect(s.status).toBe('failed');
    const scan = await step(id, 'scan-upload');
    expect(scan).toMatchObject({
      status: 'failed',
      attempts: 1,
      error: 'Virus found: EICAR-Test-File',
    });
    const [u] = await t.db.select().from(uploads).where(eq(uploads.projectId, id));
    expect(u).toMatchObject({
      status: 'infected',
      finding: 'EICAR-Test-File',
      zip: null,
      bundle: null,
    });
    expect(booted).not.toContain(id);
    expect(await step(id, 'possess')).toBeUndefined();
  });
});
