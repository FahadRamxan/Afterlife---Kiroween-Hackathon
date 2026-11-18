// What every ProjectStore must do. projects.test.ts runs it on the memory store and
// projects.pg.test.ts on Postgres, so both behave the same behind the API.
import { uuidv7 } from '@afterlife/db';
import { describe, expect, it } from 'vitest';
import type { ProjectStore } from './projects';

export function projectStoreContract(name: string, make: () => ProjectStore) {
  describe(`${name}: the ProjectStore contract`, () => {
    it('creates a project with a UUIDv7 id and status "created", and gets it back', async () => {
      const store = make();
      const p = await store.create({
        name: 'Shifa Medical Store',
        source: 'graveyard',
        sourceApp: 'shifa',
      });
      expect(p).toMatchObject({
        name: 'Shifa Medical Store',
        source: 'graveyard',
        sourceApp: 'shifa',
        status: 'created',
      });
      expect(p.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab]/);
      expect(new Date(p.createdAt).toISOString()).toBe(p.createdAt);
      expect(await store.get(p.id)).toEqual(p);
    });

    it('each create is a new project, even for the same Graveyard app', async () => {
      const store = make();
      const a = await store.create({
        name: 'Iqra School Fees',
        source: 'graveyard',
        sourceApp: 'iqra',
      });
      const b = await store.create({
        name: 'Iqra School Fees',
        source: 'graveyard',
        sourceApp: 'iqra',
      });
      expect(a.id).not.toBe(b.id);
    });

    it('the timeline starts with "project created"', async () => {
      const store = make();
      const p = await store.create({
        name: 'Barkat Kiryana Ledger',
        source: 'graveyard',
        sourceApp: 'barkat',
      });
      expect(await store.timeline(p.id)).toEqual([
        { at: p.createdAt, kind: 'project_created', id: p.id, summary: 'Barkat Kiryana Ledger' },
      ]);
    });

    it('delete removes the project and its timeline; a second delete finds nothing', async () => {
      const store = make();
      const p = await store.create({ name: 'Doomed', source: 'graveyard', sourceApp: 'shifa' });
      expect(await store.delete(p.id)).toBe(true);
      expect(await store.get(p.id)).toBeNull();
      expect(await store.timeline(p.id)).toBeNull();
      expect(await store.delete(p.id)).toBe(false);
    });

    it('an unknown id: null, null and false', async () => {
      const store = make();
      const id = uuidv7();
      expect(await store.get(id)).toBeNull();
      expect(await store.timeline(id)).toBeNull();
      expect(await store.delete(id)).toBe(false);
    });
  });
}
