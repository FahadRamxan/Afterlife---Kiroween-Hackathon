import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ScreenGraph } from './graph';

describe('ScreenGraph', () => {
  it('counts visits, says when a screen is new, and keeps each edge once with a count', () => {
    const g = new ScreenGraph('menu', 'MAIN MENU');
    expect(g.visit('stock', 'STOCK', 1)).toBe(true);
    expect(g.visit('stock', 'STOCK', 3)).toBe(false);
    g.edge('menu', 'stock', '2');
    g.edge('menu', 'stock', '2');
    g.edge('stock', 'menu', '{Esc}');
    expect(g.toJSON()).toEqual({
      root: 'menu',
      nodes: [
        { fingerprint: 'menu', title: 'MAIN MENU', firstSeen: 0, visits: 1 },
        { fingerprint: 'stock', title: 'STOCK', firstSeen: 1, visits: 2 },
      ],
      edges: [
        { from: 'menu', to: 'stock', keys: '2', count: 2 },
        { from: 'stock', to: 'menu', keys: '{Esc}', count: 1 },
      ],
    });
  });

  it('finds the shortest key path to the nearest wanted screen', () => {
    const g = new ScreenGraph('m', 'M');
    g.edge('m', 'a', '1');
    g.edge('a', 'b', 'X{Enter}');
    g.edge('m', 'c', '2');
    g.edge('c', 'b', '{F2}');
    g.edge('b', 'b', '{PgDn}');
    expect(g.pathTo('m', (fp) => fp === 'b')!.map((e) => e.keys)).toEqual(['1', 'X{Enter}']);
    expect(g.pathTo('m', (fp) => fp === 'nowhere')).toBeNull();
    expect(g.pathTo('b', () => true)).toBeNull();
  });

  it('a path always starts where asked, joins up, and ends on a wanted screen (invariant)', () => {
    const node = fc.constantFrom('m', 'a', 'b', 'c', 'd', 'e');
    fc.assert(
      fc.property(
        fc.array(fc.tuple(node, node, fc.constantFrom('1', '2', '{Esc}', '{F2}')), {
          maxLength: 30,
        }),
        node,
        fc.subarray(['a', 'b', 'c', 'd', 'e']),
        (edges, from, wanted) => {
          const g = new ScreenGraph('m', 'M');
          for (const [x, y, k] of edges) g.edge(x, y, k);
          const path = g.pathTo(from, (fp) => wanted.includes(fp));
          if (!path) return;
          expect(path.length).toBeGreaterThan(0);
          expect(path[0]!.from).toBe(from);
          for (let i = 1; i < path.length; i++) expect(path[i]!.from).toBe(path[i - 1]!.to);
          expect(wanted).toContain(path.at(-1)!.to);
        },
      ),
    );
  });
});
