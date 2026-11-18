// Live progress (Prompt 38): the pure part of useProjectLive.

/** One event from GET /api/projects/:id/live. */
export type LiveEvent = { seq: number; type: string; payload: unknown; at: string };

/** The API keeps sending the last 200; so does the client. */
export const MAX_EVENTS = 200;

/** ws(s)://…/api/projects/<id>/live, resuming after `after` when given. */
export function liveUrl(api: string, projectId: string, after?: number): string {
  const u = new URL(
    `${api.replace(/\/+$/, '')}/api/projects/${encodeURIComponent(projectId)}/live`,
  );
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  if (after !== undefined) u.searchParams.set('after', String(after));
  return u.toString();
}

/** The events so far plus new ones: in seq order, each once, the newest MAX_EVENTS. */
export function mergeEvents(prev: LiveEvent[], incoming: LiveEvent[]): LiveEvent[] {
  const bySeq = new Map(prev.map((e) => [e.seq, e]));
  for (const e of incoming) if (!bySeq.has(e.seq)) bySeq.set(e.seq, e);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq).slice(-MAX_EVENTS);
}

export function latestScreen(events: LiveEvent[]): LiveEvent | null {
  for (let i = events.length - 1; i >= 0; i--) if (events[i]!.type === 'screen') return events[i]!;
  return null;
}

/** Wait before reconnect attempt n (0 first): 0.5 s, doubling, at most 10 s. */
export const reconnectDelay = (attempt: number) => Math.min(500 * 2 ** attempt, 10_000);

/** True for a server close that will not get better by retrying (bad id, no such project ...). */
export const isFinalClose = (code: number) => code >= 4400 && code < 4500;
