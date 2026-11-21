// The screen graph (crew.md): nodes are screen fingerprints, edges are the key sequences that
// led from one to the other. The Possessor uses it to get back to a screen that still has things
// to try; Prompt 52 stores it and replays paths from it.

export type GraphNode = {
  fingerprint: string;
  title: string;
  /** The action number (from 1) at which it was first seen; 0 for the first screen. */
  firstSeen: number;
  visits: number;
};

export type GraphEdge = { from: string; to: string; keys: string; count: number };

export type ScreenGraphJson = { root: string; nodes: GraphNode[]; edges: GraphEdge[] };

export class ScreenGraph {
  readonly nodes = new Map<string, GraphNode>();
  private readonly edges = new Map<string, GraphEdge>();

  constructor(
    readonly root: string,
    rootTitle: string,
  ) {
    this.nodes.set(root, { fingerprint: root, title: rootTitle, firstSeen: 0, visits: 1 });
  }

  /** Counts a visit. True when the screen was new. */
  visit(fingerprint: string, title: string, step: number): boolean {
    const n = this.nodes.get(fingerprint);
    if (n) {
      n.visits++;
      return false;
    }
    this.nodes.set(fingerprint, { fingerprint, title, firstSeen: step, visits: 1 });
    return true;
  }

  /** Records that `keys` on `from` led to `to`. A self-loop is kept too (it says nothing moves). */
  edge(from: string, to: string, keys: string): void {
    const id = `${from}\u0000${keys}\u0000${to}`;
    const e = this.edges.get(id);
    if (e) e.count++;
    else this.edges.set(id, { from, to, keys, count: 1 });
  }

  /**
   * The screens by title: one screen (NEW BILL) has several states, each its own fingerprint (a
   * line added, a message shown). Review of 51-60, finding 6.
   */
  titles(): number {
    return new Set([...this.nodes.values()].map((n) => n.title)).size;
  }
  edgeList(): GraphEdge[] {
    return [...this.edges.values()];
  }

  /**
   * The shortest key path from `from` to the nearest screen for which `want` is true (not `from`
   * itself), as the edges to follow. Null when none can be reached.
   */
  pathTo(from: string, want: (fingerprint: string) => boolean): GraphEdge[] | null {
    const out = new Map<string, GraphEdge[]>();
    for (const e of this.edges.values())
      if (e.from !== e.to) out.set(e.from, [...(out.get(e.from) ?? []), e]);
    const prev = new Map<string, GraphEdge>();
    const seen = new Set([from]);
    const queue = [from];
    while (queue.length) {
      const at = queue.shift()!;
      if (at !== from && want(at)) {
        const path: GraphEdge[] = [];
        for (let n = at; n !== from; n = prev.get(n)!.from) path.unshift(prev.get(n)!);
        return path;
      }
      for (const e of out.get(at) ?? [])
        if (!seen.has(e.to)) {
          seen.add(e.to);
          prev.set(e.to, e);
          queue.push(e.to);
        }
    }
    return null;
  }

  toJSON(): ScreenGraphJson {
    return {
      root: this.root,
      nodes: [...this.nodes.values()].map((n) => ({ ...n })),
      edges: this.edgeList().map((e) => ({ ...e })),
    };
  }
}
