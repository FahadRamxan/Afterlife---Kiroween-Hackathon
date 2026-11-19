// Prompt 40: POST /api/uploads. Security first: what is refused before anything is stored.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq, pipelineSteps, projects, uploads } from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { strToU8, zipSync, type Zippable } from 'fflate';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app';
import { parseEnv } from './env';
import { multipartBody } from './multipart-body';
import { PgPipeline } from './pipeline';
import { PgProjectStore } from './projects-pg';
import { PgUploadStore } from './uploads';

vi.setConfig({ testTimeout: 30_000 });

const DIST = resolve(__dirname, '../../../samples/graveyard/dist/shifa');
const file = (n: string) => new Uint8Array(readFileSync(resolve(DIST, n)));
const SHIFA = { 'SHIFA.EXE': file('SHIFA.EXE'), 'MEDICINE.DBF': file('MEDICINE.DBF') };

let t: TestDatabase;
let pipeline: PgPipeline;
let app: ReturnType<typeof buildApp>;
beforeAll(async () => {
  t = await freshDatabase();
  pipeline = await PgPipeline.start(t.db, t.url, { warn: () => {} });
  app = buildApp(
    parseEnv({}),
    { logger: false },
    {
      projects: new PgProjectStore(t.db),
      uploads: new PgUploadStore(t.db),
      pipeline,
    },
  );
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await pipeline.close();
  await t.drop();
});

const send = (zip: Uint8Array, fields: Record<string, string> = {}, filename = 'shifa.zip') =>
  app.inject({
    method: 'POST',
    url: '/api/uploads',
    ...multipartBody([
      ...Object.entries(fields).map(([name, value]) => ({ name, value })),
      { name: 'zip', filename, bytes: zip },
    ]),
  });

async function count() {
  return (await t.db.select().from(uploads)).length;
}

describe('POST /api/uploads', () => {
  it('stores a DOS app, creates its project, and queues the virus scan first', async () => {
    const res = await send(zipSync(SHIFA as Zippable));
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.project).toMatchObject({
      name: 'SHIFA (uploaded)',
      source: 'upload',
      sourceApp: 'shifa.zip',
    });
    expect(body.upload).toEqual({
      status: 'scanning',
      executable: 'SHIFA.EXE',
      files: ['MEDICINE.DBF', 'SHIFA.EXE'],
    });
    const [u] = await t.db.select().from(uploads).where(eq(uploads.projectId, body.project.id));
    expect(u).toMatchObject({ status: 'scanning', executable: 'SHIFA.EXE', bundle: null });
    expect(u!.sha256).toMatch(/^[0-9a-f]{64}$/);
    const steps = await t.db
      .select()
      .from(pipelineSteps)
      .where(eq(pipelineSteps.projectId, body.project.id));
    // Nothing runs before the scan: the only step queued is scan-upload.
    expect(steps.map((s) => [s.step, s.status])).toEqual([['scan-upload', 'queued']]);
  });

  it('refuses a zip-slip path, and stores nothing', async () => {
    const before = await count();
    const res = await send(
      zipSync({ ...SHIFA, '../../AUTOEXEC.BAT': strToU8('format c:') } as Zippable),
    );
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'ZIP_SLIP' });
    expect(await count()).toBe(before);
  });

  it('refuses a program that is not a DOS program (a Windows EXE), and stores nothing', async () => {
    const before = await count();
    const pe = new Uint8Array(256);
    pe.set([0x4d, 0x5a]);
    new DataView(pe.buffer).setUint32(0x3c, 0x80, true);
    pe.set([0x50, 0x45, 0, 0], 0x80);
    const res = await send(zipSync({ 'SETUP.EXE': pe, 'MEDICINE.DBF': SHIFA['MEDICINE.DBF'] }));
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: 'NOT_DOS',
      message: expect.stringMatching(/Windows/),
    });
    expect(await count()).toBe(before);
  });

  it('refuses other file types, an upload over 20 MB, and something that is not a zip', async () => {
    expect(
      (await send(zipSync({ ...SHIFA, 'EVIL.DLL': new Uint8Array(8) } as Zippable))).json(),
    ).toMatchObject({
      error: 'FILE_TYPE',
    });
    const big = await send(new Uint8Array(21 * 1024 * 1024));
    expect(big.statusCode).toBe(413);
    expect(big.json().error).toBe('TOO_BIG');
    expect((await send(strToU8('not a zip'))).json()).toMatchObject({ error: 'NOT_A_ZIP' });
  });

  it('two programs: asks which one starts the app, then takes the answer', async () => {
    const two = zipSync({ ...SHIFA, 'SETUP.EXE': SHIFA['SHIFA.EXE'] } as Zippable);
    const ask = await send(two);
    expect(ask.statusCode).toBe(400);
    expect(ask.json()).toMatchObject({
      error: 'WHICH_PROGRAM',
      programs: ['SHIFA.EXE', 'SETUP.EXE'],
    });
    const ok = await send(two, { executable: 'SHIFA.EXE' });
    expect(ok.statusCode).toBe(201);
  });

  it('keeps only a safe name from the uploaded file name', async () => {
    const res = await send(zipSync(SHIFA as Zippable), {}, '../../<script>my app.zip');
    expect(res.statusCode).toBe(201);
    const [p] = await t.db.select().from(projects).where(eq(projects.id, res.json().project.id));
    expect(p!.sourceApp).toBe('script my app.zip');
  });
});
