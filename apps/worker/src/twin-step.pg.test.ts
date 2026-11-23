// @spec ghost-twin#2.2 The twin-replay step (Prompt 77): each stored twin event replayed in the
// reborn app, its result kept, and a change no action explains sent to the Archaeologist.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SnapshotDiff } from '@afterlife/dbf';
import { eq, insertSoulVersion, observations, projects, twinEvents } from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { numberSoul, specRequirements } from '@afterlife/soul';
import { SHIFA_AS_IT_RUNS_SOUL } from '@afterlife/soul/examples/shifa';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { graveyardBundle } from './possess';
import type { StepContext } from './registry';
import { twinReplayStep } from './twin-step';

let t: TestDatabase;
beforeAll(async () => {
  t = await freshDatabase();
});
afterAll(async () => {
  await t.drop();
});
const WEEK = JSON.parse(
  readFileSync(resolve(__dirname, '../../../samples/graveyard/shifa/twin-week.json'), 'utf8'),
) as { events: { seq: number; occurredAt: string; files: string[]; diff: SnapshotDiff }[] };

async function project() {
  const [p] = await t.db
    .insert(projects)
    .values({ name: 'Shifa', source: 'graveyard', sourceApp: 'shifa' })
    .returning();
  await insertSoulVersion(t.db, p!.id, (v, parent) => {
    const s = numberSoul(SHIFA_AS_IT_RUNS_SOUL, p!.id, v, parent);
    return { ir: s, specMarkdown: specRequirements(s) };
  });
  return p!.id;
}
const add = (projectId: string, evs: typeof WEEK.events) =>
  t.db.insert(twinEvents).values(
    evs.map((e) => ({
      projectId,
      seq: e.seq,
      occurredAt: new Date(e.occurredAt),
      event: { files: e.files, diff: e.diff },
    })),
  );
function ctx(projectId: string) {
  const events: [string, Record<string, unknown>][] = [];
  const c: StepContext = {
    projectId,
    project: { name: 'Shifa', source: 'graveyard', sourceApp: 'shifa', dosTime: null },
    step: 'twin-replay',
    attempt: 1,
    force: false,
    signal: new AbortController().signal,
    emit: async (type, payload) => void events.push([type, payload as Record<string, unknown>]),
    log: async () => {},
  };
  return { c, events };
}
const run = (projectId: string) =>
  twinReplayStep({ db: t.db, bundleFor: async (p) => graveyardBundle(p) })(ctx(projectId).c);

describe('the twin-replay step', () => {
  it('replays the stored events: each one matched, its result kept, announced once', async () => {
    const id = await project();
    await add(id, WEEK.events.slice(0, 50));
    const { c, events } = ctx(id);
    const r = await twinReplayStep({ db: t.db, bundleFor: async (p) => graveyardBundle(p) })(c);
    expect(r).toMatchObject({
      status: 'done',
      output: { replayed: 50, matched: 50, mismatched: 0, unknown: 0 },
    });
    const rows = await t.db.select().from(twinEvents).where(eq(twinEvents.projectId, id));
    expect(rows.every((x) => x.matched === true)).toBe(true);
    expect((rows[0]!.newResult as { outcome: string; actionId: string }).outcome).toBe('matched');
    expect(events.filter(([type, p]) => type === 'twin' && p.stage === 'replayed')).toHaveLength(
      50,
    );
    // Run again with nothing new: nothing replayed again, nothing announced again.
    const again = ctx(id);
    expect(
      await twinReplayStep({ db: t.db, bundleFor: async (p) => graveyardBundle(p) })(again.c),
    ).toMatchObject({
      output: { replayed: 0 },
    });
    expect(again.events).toEqual([]);
    // A new event later is replayed from where the shop's records are now.
    await add(id, WEEK.events.slice(50, 52));
    expect(await run(id)).toMatchObject({ output: { replayed: 2, matched: 2 } });
  });

  it('a change no action makes is unknown, and goes to the Archaeologist as evidence once', async () => {
    const id = await project();
    const hand: SnapshotDiff = {
      tables: {
        'MEDICINE.DBF': {
          key: 'CODE',
          inserted: [],
          deleted: [],
          updated: [
            {
              key: 'PAN500',
              beforeRecno: 0,
              afterRecno: 0,
              changes: [{ field: 'QTY', before: '240', after: '250', delta: '10' }],
            },
          ],
          schema: { added: [], removed: [] },
        },
      },
      unchanged: [],
      addedTables: [],
      removedTables: [],
    };
    await add(id, [
      { seq: 1, occurredAt: '1998-07-15T09:00:00.000Z', files: ['MEDICINE.DBF'], diff: hand },
    ]);
    expect(await run(id)).toMatchObject({ output: { unknown: 1 } });
    const [row] = await t.db.select().from(twinEvents).where(eq(twinEvents.projectId, id));
    expect(row!.matched).toBeNull();
    expect(row!.newResult).toMatchObject({ outcome: 'unknown' });
    const obs = await t.db.select().from(observations).where(eq(observations.projectId, id));
    expect(obs).toHaveLength(1);
    expect(obs[0]!.hint).toMatchObject({ from: 'twin' });
    expect(obs[0]!.dbfDiff).toEqual(hand);
    await run(id);
    expect(
      await t.db.select().from(observations).where(eq(observations.projectId, id)),
    ).toHaveLength(1);
  });

  it('says why it did nothing: no Soul', async () => {
    const [p] = await t.db
      .insert(projects)
      .values({ name: 'Shifa', source: 'graveyard', sourceApp: 'shifa' })
      .returning();
    expect(await run(p!.id)).toEqual({ status: 'skipped', reason: 'This project has no Soul yet' });
  });
});
