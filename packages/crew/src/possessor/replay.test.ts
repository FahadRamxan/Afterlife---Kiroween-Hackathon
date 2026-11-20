import { observeScreen } from '@afterlife/emulator';
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ScreenGraphJson } from './graph';
import { possess } from './possessor';
import { ReplayError, replayPath, shortestPath } from './replay';
import { bootMiniShop } from './testing/mini-shop';
import { dataValueChooser } from './values';

const FAST = { stableMs: 1, pollMs: 1, maxWaitMs: 50 };
const edge = (from: string, to: string, keys: string, count = 1) => ({ from, to, keys, count });

describe('shortestPath', () => {
  const g = {
    edges: [
      edge('m', 'a', '1'),
      edge('a', 'b', 'X{Enter}'),
      edge('m', 'c', '2'),
      edge('c', 'b', '{F2}'),
      edge('b', 'm', '{Esc}'),
      edge('a', 'a', '{PgDn}'),
    ],
  };
  it('is the fewest key sequences, and empty when already there', () => {
    expect(shortestPath(g, 'm', 'b')!.map((e) => e.keys)).toEqual(['1', 'X{Enter}']);
    expect(shortestPath(g, 'b', 'c')!.map((e) => e.keys)).toEqual(['{Esc}', '2']);
    expect(shortestPath(g, 'm', 'm')).toEqual([]);
    expect(shortestPath(g, 'm', 'nowhere')).toBeNull();
  });
  it('a tie goes to the edge seen most often', () => {
    const t = { edges: [edge('m', 'x', 'A', 1), edge('m', 'x', 'B', 5)] };
    expect(shortestPath(t, 'm', 'x')!.map((e) => e.keys)).toEqual(['B']);
  });
});

describe('replayPath on the mini shop (Prompt 52)', () => {
  let graph: ScreenGraphJson;
  beforeAll(async () => {
    const { emu } = await bootMiniShop();
    graph = (await possess(emu, { values: dataValueChooser, record: FAST })).graph;
  }, 30_000);

  it('the Possessor found the shop’s screens', () => {
    expect(graph.nodes.length).toBeGreaterThanOrEqual(5);
  });

  it('done when: for random pairs of discovered screens, it arrives at the target (property)', async () => {
    const fps = graph.nodes.map((n) => n.fingerprint);
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...fps), fc.constantFrom(...fps), async (from, to) => {
        const { emu } = await bootMiniShop();
        // Get to `from` first, from the shop's first screen.
        await replayPath(emu, graph, graph.root, from, { record: FAST });
        expect((await observeScreen(emu)).fingerprint).toBe(from);
        await replayPath(emu, graph, from, to, { record: FAST });
        expect((await observeScreen(emu)).fingerprint).toBe(to);
      }),
      { numRuns: Math.min(Number(process.env.FC_NUM_RUNS ?? 100), 60) },
    );
  }, 120_000);

  it('a stale edge is set aside and the path planned again', async () => {
    const { emu } = await bootMiniShop();
    // The graph says "1" from the menu leads straight to the item list; it does not.
    const items = graph.nodes.find((n) => n.title === 'ITEMS')!.fingerprint;
    const lying: ScreenGraphJson = {
      ...graph,
      edges: [edge(graph.root, items, '1', 99), ...graph.edges],
    };
    const r = await replayPath(emu, lying, graph.root, items, { record: FAST });
    expect(r.replanned).toBe(1);
    expect((await observeScreen(emu)).fingerprint).toBe(items);
  });

  it('says where it is when it cannot get there', async () => {
    const { emu } = await bootMiniShop();
    await expect(replayPath(emu, graph, 'fp_elsewhere', graph.root)).rejects.toBeInstanceOf(
      ReplayError,
    );
    const err = await replayPath(emu, graph, graph.root, 'fp_0000000000000000').catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ReplayError);
    expect((err as ReplayError).at).toBe(graph.root);
  });
});
