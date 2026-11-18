// The projects API from the browser (Prompt 36): Raise creates a project, /raise/<id> reads it.
import { z } from 'zod';

const ProjectSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  source: z.enum(['graveyard', 'upload']),
  sourceApp: z.string(),
  status: z.enum(['created', 'queued', 'running', 'done', 'failed']),
  createdAt: z.iso.datetime(),
});
export type Project = z.infer<typeof ProjectSchema>;

const TimelineSchema = z.object({
  projectId: z.uuid(),
  events: z.array(
    z.object({ at: z.iso.datetime(), kind: z.string(), id: z.uuid(), summary: z.string() }),
  ),
});
export type TimelineEvent = z.infer<typeof TimelineSchema>['events'][number];

export type Failure =
  | { ok: false; reason: 'unconfigured' | 'down' | 'not-found' }
  | { ok: false; reason: 'rate-limited' | 'error'; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A project id (a UUID), as opposed to a Graveyard app id such as `shifa`. */
export const isProjectId = (s: string) => UUID.test(s);

const base = (api: string) => api.replace(/\/+$/, '');

async function message(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown };
    if (typeof body.message === 'string') return body.message;
  } catch {
    /* not JSON */
  }
  return `The API answered ${res.status}`;
}

/** POST /api/projects for a Graveyard app. Never throws. */
export async function createProject(
  api: string | undefined,
  app: string,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true; project: Project } | Failure> {
  if (!api) return { ok: false, reason: 'unconfigured' };
  let res: Response;
  try {
    res = await fetcher(`${base(api)}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'graveyard', app }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, reason: 'down' };
  }
  if (res.status === 429) return { ok: false, reason: 'rate-limited', message: await message(res) };
  if (!res.ok) return { ok: false, reason: 'error', message: await message(res) };
  const p = ProjectSchema.safeParse(await res.json().catch(() => null));
  return p.success
    ? { ok: true, project: p.data }
    : { ok: false, reason: 'error', message: 'The API answer was not a project' };
}

/** GET /api/projects/:id and its timeline. Never throws. */
export async function getProject(
  api: string | undefined,
  id: string,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true; project: Project; events: TimelineEvent[] } | Failure> {
  if (!api) return { ok: false, reason: 'unconfigured' };
  try {
    const opts = { cache: 'no-store' as const, signal: AbortSignal.timeout(15_000) };
    const res = await fetcher(`${base(api)}/api/projects/${encodeURIComponent(id)}`, opts);
    if (res.status === 404) return { ok: false, reason: 'not-found' };
    if (!res.ok) return { ok: false, reason: 'error', message: await message(res) };
    const p = ProjectSchema.safeParse(await res.json().catch(() => null));
    if (!p.success)
      return { ok: false, reason: 'error', message: 'The API answer was not a project' };
    const tl = await fetcher(`${base(api)}/api/projects/${encodeURIComponent(id)}/timeline`, opts);
    const events = tl.ok ? TimelineSchema.safeParse(await tl.json().catch(() => null)) : null;
    return { ok: true, project: p.data, events: events?.success ? events.data.events : [] };
  } catch {
    return { ok: false, reason: 'down' };
  }
}
