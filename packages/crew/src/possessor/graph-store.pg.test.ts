// Prompt 52: the screen graph is kept, and a second possession adds to it.
import { projects } from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ScreenGraphJson } from './graph';
import { loadGraph, mergeGraphs, saveGraph } from './graph-store';

let t: TestDatabase;
beforeAll(async () => {
  t = await freshDatabase();
});
afterAll(async () => {
  await t.drop();
});

const node = (fingerprint: string, visits = 1) => ({
  fingerprint,
  title: fingerprint.toUpperCase(),
  firstSeen: 0,
  visits,
});
const edge = (from: string, to: string, keys: string, count = 1) => ({ from, to, keys, count });

describe('mergeGraphs', () => {
  it('keeps every screen and edge of both, with their counts added', () => {
    const a: ScreenGraphJson = {
      root: 'm',
      nodes: [node('m'), node('a')],
      edges: [edge('m', 'a', '1')],
    };
    const b: ScreenGraphJson = {
      root: 'm',
      nodes: [node('m', 2), node('b')],
      edges: [edge('m', 'a', '1'), edge('m', 'b', '2')],
    };
    const m = mergeGraphs(a, b);
    expect(m.nodes.map((n) => [n.fingerprint, n.visits])).toEqual([
      ['m', 3],
      ['a', 1],
      ['b', 1],
    ]);
    expect(m.edges.map((e) => [e.keys, e.count])).toEqual([
      ['1', 2],
      ['2', 1],
    ]);
  });

  it('never loses a screen or an edge, whatever the two graphs (invariant)', () => {
    const fp = fc.constantFrom('m', 'a', 'b', 'c');
    const graph = fc.record({
      root: fc.constant('m'),
      nodes: fc.uniqueArray(fp, { selector: (x) => x }).map((xs) => xs.map((x) => node(x))),
      edges: fc
        .array(fc.tuple(fp, fp, fc.constantFrom('1', '{Esc}')), { maxLength: 8 })
        .map((xs) => xs.map(([f, to, k]) => edge(f, to, k))),
    });
    fc.assert(
      fc.property(graph, graph, (a, b) => {
        const m = mergeGraphs(a, b);
        const fps = new Set(m.nodes.map((n) => n.fingerprint));
        for (const n of [...a.nodes, ...b.nodes]) expect(fps.has(n.fingerprint)).toBe(true);
        const keys = new Set(m.edges.map((e) => `${e.from}|${e.keys}|${e.to}`));
        for (const e of [...a.edges, ...b.edges])
          expect(keys.has(`${e.from}|${e.keys}|${e.to}`)).toBe(true);
      }),
    );
  });
});

describe('saveGraph and loadGraph', () => {
  it('keeps a graph, and a re-run adds to it; deleting the project deletes it', async () => {
    const [p] = await t.db
      .insert(projects)
      .values({ name: 'Shifa', source: 'graveyard', sourceApp: 'shifa' })
      .returning();
    expect(await loadGraph(t.db, p!.id)).toBeNull();
    await saveGraph(t.db, p!.id, {
      root: 'm',
      nodes: [node('m'), node('a')],
      edges: [edge('m', 'a', '1')],
    });
    const kept = await saveGraph(t.db, p!.id, {
      root: 'm',
      nodes: [node('m'), node('b')],
      edges: [edge('m', 'b', '2')],
    });
    expect(kept.nodes.map((n) => n.fingerprint)).toEqual(['m', 'a', 'b']);
    expect(await loadGraph(t.db, p!.id)).toEqual(kept);
    const { eq } = await import('@afterlife/db');
    await t.db.delete(projects).where(eq(projects.id, p!.id));
    expect(await loadGraph(t.db, p!.id)).toBeNull();
  });
});
