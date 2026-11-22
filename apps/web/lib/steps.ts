// The pipeline steps of a project (Prompt 39): read from the API, moved along by live events.
import { z } from 'zod';
import type { Failure } from './projects';
import { CrossingSchema } from './crossing';
import type { LiveEvent } from './live';

const StepStateSchema = z.object({
  step: z.string(),
  status: z.enum(['pending', 'queued', 'running', 'done', 'failed', 'skipped']),
  attempts: z.number(),
  error: z.string().nullable(),
  reason: z.string().nullable(),
  recorded: z.boolean(),
  finishedAt: z.string().nullable(),
  /** The rebirth step, done: the reborn app and the actions it published (Prompt 63). */
  vessel: z
    .object({ url: z.string(), actions: z.array(z.object({ id: z.string(), name: z.string() })) })
    .nullable()
    .default(null),
  /** The undertake step, done: its report (Prompt 66). */
  crossing: CrossingSchema.nullable().default(null),
});
export type StepState = z.infer<typeof StepStateSchema>;

const base = (api: string) => api.replace(/\/+$/, '');

async function failure(res: Response): Promise<Failure> {
  const body = (await res.json().catch(() => ({}))) as { message?: unknown };
  return {
    ok: false,
    reason: 'error',
    message: typeof body.message === 'string' ? body.message : `The API answered ${res.status}`,
  };
}

export async function getSteps(
  api: string | undefined,
  projectId: string,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true; steps: StepState[] } | Failure> {
  if (!api) return { ok: false, reason: 'unconfigured' };
  try {
    const res = await fetcher(`${base(api)}/api/projects/${encodeURIComponent(projectId)}/steps`, {
      cache: 'no-store',
    });
    if (!res.ok) return failure(res);
    const body = z.object({ steps: z.array(StepStateSchema) }).safeParse(await res.json());
    return body.success
      ? { ok: true, steps: body.data.steps }
      : { ok: false, reason: 'error', message: 'The API answer was not a list of steps' };
  } catch {
    return { ok: false, reason: 'down' };
  }
}

export async function rerunStep(
  api: string | undefined,
  projectId: string,
  step: string,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true } | Failure> {
  if (!api) return { ok: false, reason: 'unconfigured' };
  try {
    const res = await fetcher(
      `${base(api)}/api/projects/${encodeURIComponent(projectId)}/steps/${encodeURIComponent(step)}/run`,
      { method: 'POST' },
    );
    return res.ok ? { ok: true } : failure(res);
  } catch {
    return { ok: false, reason: 'down' };
  }
}

type StepPayload = {
  step: string;
  state: string;
  attempt: number;
  message?: string;
  recorded?: boolean;
};
const STATE: Record<string, StepState['status']> = {
  started: 'running',
  retrying: 'queued',
  done: 'done',
  failed: 'failed',
  skipped: 'skipped',
};

/** The steps after the live `step` events, in seq order (events the steps already show are harmless). */
export function applyStepEvents(steps: StepState[], events: LiveEvent[]): StepState[] {
  const out = steps.map((s) => ({ ...s }));
  for (const e of events) {
    if (e.type !== 'step') continue;
    const p = e.payload as StepPayload;
    const s = out.find((x) => x.step === p.step);
    const status = STATE[p.state];
    if (!s || !status) continue;
    s.status = status;
    s.attempts = Math.max(s.attempts, p.attempt);
    if (p.state === 'started') s.error = null;
    if (p.state === 'retrying' || p.state === 'failed') s.error = p.message ?? null;
    if (p.state === 'skipped') s.reason = p.message ?? null;
    if (p.recorded || p.message?.startsWith('Recorded run')) s.recorded = true;
  }
  return out;
}
