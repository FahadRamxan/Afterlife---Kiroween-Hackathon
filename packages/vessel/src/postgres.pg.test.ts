// The Postgres store passes the same contract as the others, and keeps each project apart.
import { projects } from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgEntityStore } from './postgres';
import { storeContract } from './testing/store-contract';

let t: TestDatabase;
beforeAll(async () => {
  t = await freshDatabase();
});
afterAll(async () => {
  await t.drop();
});

async function project() {
  const [p] = await t.db
    .insert(projects)
    .values({ name: 'Shifa', source: 'graveyard', sourceApp: 'shifa' })
    .returning();
  return p!.id;
}

describe('PgEntityStore', () => {
  storeContract(async () => new PgEntityStore(t.db, await project()));

  it('each project has its own records, and they go with the project', async () => {
    const a = new PgEntityStore(t.db, await project());
    const bId = await project();
    const b = new PgEntityStore(t.db, bId);
    await a.load('X.DBF', [{ deleted: false, values: { CODE: 'A' } }]);
    await b.load('X.DBF', [{ deleted: false, values: { CODE: 'B' } }]);
    expect((await a.records('X.DBF'))[0]!.values.CODE).toBe('A');
    expect(await b.files()).toEqual(['X.DBF']);
    await t.db.delete(projects).where((await import('@afterlife/db')).eq(projects.id, bId));
    expect(await b.records('X.DBF')).toEqual([]);
  });
});
