// The Ghost Twin tab's data (Prompt 79): the twin's overview (readiness, its days, switched or
// not), the feed of twin pairs (what the old app wrote, what the reborn app did with it), and the
// two actions: simulate a recorded shop day (demo mode) and switch over.
import { z } from 'zod';
const DaySchema = z.object({
  date: z.string(),
  total: z.number().int().nonnegative(),
  matched: z.number().int().nonnegative(),
  mismatched: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
});
export type TwinDay = z.infer<typeof DaySchema>;
export const TwinOverviewSchema = z.object({
  readiness: z.object({
    days: z.number().int(),
    matched: z.number().int(),
    mismatched: z.number().int(),
    unknown: z.number().int(),
    pending: z.number().int(),
    ready: z.boolean(),
    score: z.number().min(0).max(100),
    reasons: z.array(z.string()),
    rule: z.object({ days: z.number(), matched: z.number(), openMismatches: z.number() }),
  }),
  days: z.array(DaySchema),
  primaryApp: z.enum(['old', 'vessel']),
  switchedAt: z.string().nullable(),
  hasToken: z.boolean(),
  simulate: z.object({
    available: z.boolean(),
    nextDay: z.string().nullable(),
    recordedDays: z.number().int().nonnegative(),
  }),
});
export type TwinOverview = z.infer<typeof TwinOverviewSchema>;
const Counts = z.object({
  inserted: z.number().int(),
  updated: z.number().int(),
  deleted: z.number().int(),
});
const EventSchema = z.object({
  seq: z.number().int(),
  occurredAt: z.string(),
  files: z.array(z.string()),
  changes: z.record(z.string(), Counts),
  matched: z.boolean().nullable(),
  oldResult: z.unknown(),
  newResult: z
    .object({
      outcome: z.enum(['matched', 'mismatched', 'unknown']),
      actionId: z.string().optional(),
      differences: z.array(z.unknown()).optional(),
      reason: z.string().optional(),
    })
    .passthrough()
    .nullable(),
});
export type TwinPair = z.infer<typeof EventSchema>;
const SwitchedSchema = z.object({
  primaryApp: z.literal('vessel'),
  switchedAt: z.string(),
  migrated: z.object({ events: z.number().int(), files: z.array(z.string()) }),
});
type Fail = { ok: false; message: string };
const base = (api: string) => api.replace(/\/+$/, '');
const url = (api: string, id: string, path: string) =>
  `${base(api)}/api/projects/${encodeURIComponent(id)}/twin${path}`;
const message = async (res: Response) =>
  ((await res.json().catch(() => ({}))) as { message?: string }).message ??
  `The API answered ${res.status}`;
async function call<T extends z.ZodType>(
  api: string | undefined,
  run: (api: string) => Promise<Response>,
  schema: T,
): Promise<{ ok: true; body: z.infer<T> } | Fail> {
  if (!api) return { ok: false, message: 'No API is set up for this site' };
  try {
    const res = await run(api);
    if (!res.ok) return { ok: false, message: await message(res) };
    const body = schema.safeParse(await res.json());
    return body.success
      ? { ok: true, body: body.data }
      : { ok: false, message: 'The API sent an answer this page cannot read' };
  } catch {
    return { ok: false, message: 'The API cannot be reached' };
  }
}
export async function getTwin(api: string | undefined, id: string) {
  const r = await call(api, (a) => fetch(url(a, id, '')), TwinOverviewSchema);
  return r.ok ? { ok: true as const, twin: r.body } : r;
}
export async function getTwinEvents(api: string | undefined, id: string, after = 0) {
  const r = await call(
    api,
    (a) => fetch(url(a, id, `/events?after=${after}`)),
    z.object({ events: z.array(EventSchema) }),
  );
  return r.ok ? { ok: true as const, events: r.body.events } : r;
}
export async function simulateDay(api: string | undefined, id: string) {
  const r = await call(
    api,
    (a) => fetch(url(a, id, '/simulate'), { method: 'POST' }),
    z.object({ day: z.string(), events: z.number().int() }),
  );
  return r.ok ? { ok: true as const, ...r.body } : r;
}
export async function switchOver(api: string | undefined, id: string) {
  const r = await call(
    api,
    (a) =>
      fetch(url(a, id, '/switch'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      }),
    SwitchedSchema,
  );
  return r.ok ? { ok: true as const, ...r.body } : r;
}
/** A new token for the shop PC's capture tool; the API keeps only its hash, so it shows once. */
export async function newTwinToken(api: string | undefined, id: string) {
  const r = await call(
    api,
    (a) => fetch(url(a, id, '/token'), { method: 'POST' }),
    z.object({ token: z.string() }),
  );
  return r.ok ? { ok: true as const, token: r.body.token } : r;
}
export type Candle = 'matched' | 'mismatched' | 'unknown' | 'pending';
/** A day's candle: red with any mismatch, green only when every transaction matched. */
export function candleOf(d: TwinDay): Candle {
  if (d.mismatched > 0) return 'mismatched';
  if (d.pending > 0) return 'pending';
  if (d.matched === d.total) return 'matched';
  return 'unknown';
}
/** The old side of a twin pair: "BILLS.DBF +1 · MEDICINE.DBF ~2". */
export function changesText(changes: TwinPair['changes']): string {
  const parts = Object.entries(changes).flatMap(([file, c]) => {
    const counts = [
      c.inserted ? `+${c.inserted}` : '',
      c.updated ? `~${c.updated}` : '',
      c.deleted ? `-${c.deleted}` : '',
    ].filter(Boolean);
    return counts.length ? [`${file} ${counts.join(' ')}`] : [];
  });
  return parts.length ? parts.join(' · ') : 'no change';
}
