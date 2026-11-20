// The screen graph, kept (Prompt 52). A re-run of possession adds to what was found before: the
// screens and edges of both, with their counts added, so nothing found is lost.
import { eq, screenGraphs, sql, type Db } from '@afterlife/db';
import type { GraphEdge, GraphNode, ScreenGraphJson } from './graph';
import { edgeId } from './replay';

/** Two graphs of the same app as one. Their roots must match (the app's first screen). */
export function mergeGraphs(a: ScreenGraphJson, b: ScreenGraphJson): ScreenGraphJson {
  if (a.root !== b.root) return b;
  const nodes = new Map<string, GraphNode>(a.nodes.map((n) => [n.fingerprint, { ...n }]));
  for (const n of b.nodes) {
    const had = nodes.get(n.fingerprint);
    if (had) had.visits += n.visits;
    else nodes.set(n.fingerprint, { ...n });
  }
  const edges = new Map<string, GraphEdge>(a.edges.map((e) => [edgeId(e), { ...e }]));
  for (const e of b.edges) {
    const had = edges.get(edgeId(e));
    if (had) had.count += e.count;
    else edges.set(edgeId(e), { ...e });
  }
  return { root: a.root, nodes: [...nodes.values()], edges: [...edges.values()] };
}

export async function loadGraph(db: Db, projectId: string): Promise<ScreenGraphJson | null> {
  const [r] = await db.select().from(screenGraphs).where(eq(screenGraphs.projectId, projectId));
  return r ? { root: r.root, nodes: r.nodes as GraphNode[], edges: r.edges as GraphEdge[] } : null;
}

/** Keeps the graph, merged into the one already kept. Returns what is kept now. */
export async function saveGraph(
  db: Db,
  projectId: string,
  graph: ScreenGraphJson,
): Promise<ScreenGraphJson> {
  return db.transaction(async (tx) => {
    // One writer per project, so two possessions at once do not lose each other's screens.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`graph:${projectId}`}))`);
    const [r] = await tx.select().from(screenGraphs).where(eq(screenGraphs.projectId, projectId));
    const kept = r
      ? mergeGraphs(
          { root: r.root, nodes: r.nodes as GraphNode[], edges: r.edges as GraphEdge[] },
          graph,
        )
      : graph;
    await tx
      .insert(screenGraphs)
      .values({ projectId, root: kept.root, nodes: kept.nodes, edges: kept.edges })
      .onConflictDoUpdate({
        target: screenGraphs.projectId,
        set: { root: kept.root, nodes: kept.nodes, edges: kept.edges, updatedAt: sql`now()` },
      });
    return kept;
  });
}
