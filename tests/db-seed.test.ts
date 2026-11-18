// The database seed has one project per Graveyard app, with the catalogue's id and name.
import { SEED_PROJECTS } from '@afterlife/db';
import { describe, expect, it } from 'vitest';
import catalog from '../apps/web/lib/graveyard-catalog.json';

describe('db seed', () => {
  it('matches the Graveyard catalogue, app for app', () => {
    const fromSeed = SEED_PROJECTS.map((p) => [p.sourceApp, p.name]).sort();
    const fromCatalog = catalog.apps.map((a) => [a.id, a.name]).sort();
    expect(fromSeed).toEqual(fromCatalog);
  });

  it('seed ids are distinct UUIDv7s', () => {
    const ids = SEED_PROJECTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids)
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
