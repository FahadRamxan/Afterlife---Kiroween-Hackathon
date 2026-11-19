// "Show your work" (Prompt 47): the model calls the Crew made for a project, from the API.
import { z } from 'zod';
import type { Failure } from './projects';

const CallSchema = z.object({
  id: z.string(),
  at: z.string(),
  agent: z.string(),
  purpose: z.string(),
  provider: z.string(),
  model: z.string(),
  attempt: z.number(),
  status: z.enum(['ok', 'error', 'invalid', 'over_budget']),
  inputTokens: z.number(),
  outputTokens: z.number(),
  durationMs: z.number(),
  error: z.string().nullable(),
});
export type LlmCall = z.infer<typeof CallSchema>;

const ListSchema = z.object({
  budget: z.object({ tokens: z.number(), used: z.number() }),
  total: z.number(),
  calls: z.array(CallSchema),
});
export type LlmCallList = z.infer<typeof ListSchema>;

const DetailSchema = CallSchema.extend({ request: z.unknown(), response: z.unknown() });
export type LlmCallDetail = z.infer<typeof DetailSchema>;

const base = (api: string) => api.replace(/\/+$/, '');

async function get<T>(
  url: string,
  schema: z.ZodType<T>,
  fetcher: typeof fetch,
  what: string,
): Promise<({ ok: true } & { value: T }) | Failure> {
  try {
    const res = await fetcher(url, { cache: 'no-store' });
    const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
    if (!res.ok)
      return {
        ok: false,
        reason: 'error',
        message:
          typeof body?.message === 'string' ? body.message : `The API answered ${res.status}`,
      };
    const parsed = schema.safeParse(body);
    return parsed.success
      ? { ok: true, value: parsed.data }
      : { ok: false, reason: 'error', message: `The API answer was not ${what}` };
  } catch {
    return { ok: false, reason: 'down' };
  }
}

export async function getLlmCalls(
  api: string | undefined,
  projectId: string,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true; list: LlmCallList } | Failure> {
  if (!api) return { ok: false, reason: 'unconfigured' };
  const r = await get(
    `${base(api)}/api/projects/${encodeURIComponent(projectId)}/llm-calls`,
    ListSchema,
    fetcher,
    'a list of model calls',
  );
  return r.ok ? { ok: true, list: r.value } : r;
}

export async function getLlmCall(
  api: string | undefined,
  projectId: string,
  callId: string,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true; call: LlmCallDetail } | Failure> {
  if (!api) return { ok: false, reason: 'unconfigured' };
  const r = await get(
    `${base(api)}/api/projects/${encodeURIComponent(projectId)}/llm-calls/${encodeURIComponent(callId)}`,
    DetailSchema,
    fetcher,
    'a model call',
  );
  return r.ok ? { ok: true, call: r.value } : r;
}
