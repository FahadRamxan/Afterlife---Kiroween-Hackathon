// Progress events (crew.md): every step writes what it does, for the live view (Prompt 38) and
// the "Show your work" panel.
import { and, asc, desc, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from './client';
import { EVENT_TYPES, JOB_TYPES, projectEvents, type EventType } from './schema';

const StepEvent = z.object({
  step: z.enum(JOB_TYPES),
  state: z.enum(['started', 'retrying', 'done', 'failed', 'skipped']),
  attempt: z.number().int().positive(),
  message: z.string().optional(),
});
const LogEvent = z.object({ level: z.enum(['info', 'warn', 'error']), message: z.string() });

/** Payloads we check here; the other types carry their own package's shape (screen, rule ...). */
export const EVENT_PAYLOADS: Partial<Record<EventType, z.ZodType>> = {
  step: StepEvent,
  log: LogEvent,
};

export type ProjectEvent = { seq: number; type: EventType; payload: unknown; at: string };

/** Writes one event. Throws on an unknown type or a step or log payload that is wrong. */
export async function emitEvent(
  db: Db,
  projectId: string,
  type: EventType,
  payload: unknown,
): Promise<ProjectEvent> {
  if (!(EVENT_TYPES as readonly string[]).includes(type))
    throw new Error(`Unknown event type ${type}`);
  const checked = EVENT_PAYLOADS[type]?.parse(payload) ?? payload;
  const [row] = await db
    .insert(projectEvents)
    .values({ projectId, type, payload: checked })
    .returning();
  return {
    seq: row!.seq,
    type: row!.type as EventType,
    payload: row!.payload,
    at: row!.createdAt.toISOString(),
  };
}

/** A project's newest `n` events, oldest first (the replay a live view starts with). */
export async function lastEvents(db: Db, projectId: string, n = 200): Promise<ProjectEvent[]> {
  const rows = await db
    .select()
    .from(projectEvents)
    .where(eq(projectEvents.projectId, projectId))
    .orderBy(desc(projectEvents.seq))
    .limit(n);
  return rows.reverse().map((r) => ({
    seq: r.seq,
    type: r.type as EventType,
    payload: r.payload,
    at: r.createdAt.toISOString(),
  }));
}

/** A project's events after `afterSeq`, oldest first (at most `limit`). */
export async function listEvents(
  db: Db,
  projectId: string,
  opts: { afterSeq?: number; limit?: number } = {},
): Promise<ProjectEvent[]> {
  const rows = await db
    .select()
    .from(projectEvents)
    .where(and(eq(projectEvents.projectId, projectId), gt(projectEvents.seq, opts.afterSeq ?? 0)))
    .orderBy(asc(projectEvents.seq))
    .limit(opts.limit ?? 200);
  return rows.map((r) => ({
    seq: r.seq,
    type: r.type as EventType,
    payload: r.payload,
    at: r.createdAt.toISOString(),
  }));
}
