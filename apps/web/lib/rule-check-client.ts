// The Soul tab's "Check a rule" panel (Prompt 55): the values the old app wrote, and candidate
// rules checked by the API against every observation of the project.
import { z } from 'zod';

const base = (api: string) => api.replace(/\/+$/, '');

const TargetsSchema = z.object({
  observations: z.number().int().nonnegative(),
  targets: z.array(
    z.object({
      target: z.string(),
      kind: z.string(),
      effects: z.number().int(),
      observations: z.number().int(),
    }),
  ),
});
export type RuleTargets = z.infer<typeof TargetsSchema>;

const VerificationSchema = z.object({
  target: z.string(),
  effects: z.number().int(),
  observations: z.number().int(),
  checks: z.array(
    z.object({
      expression: z.string(),
      nodes: z.number().int().nullable(),
      explained: z.number().int(),
      total: z.number().int(),
      misses: z.array(
        z.object({
          observation: z.string(),
          expected: z.string(),
          got: z.string().nullable(),
          error: z.string().optional(),
        }),
      ),
    }),
  ),
  selected: z
    .object({
      expression: z.string(),
      nodes: z.number().int(),
      evidence: z.array(z.string()),
      confidence: z.number(),
      coverage: z.number(),
    })
    .nullable(),
  alsoFit: z.array(z.string()),
  probes: z.array(z.object({ field: z.string(), values: z.array(z.string()), text: z.string() })),
});
export type RuleVerification = z.infer<typeof VerificationSchema>;

export type Answer<T> = { ok: true; value: T } | { ok: false; message: string };

async function call<T>(
  schema: z.ZodType<T>,
  url: string,
  init: RequestInit,
  fetcher: typeof fetch,
): Promise<Answer<T>> {
  try {
    const res = await fetcher(url, { cache: 'no-store', ...init });
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) return { ok: false, message: body.message ?? `The API answered ${res.status}` };
    const parsed = schema.safeParse(body);
    return parsed.success
      ? { ok: true, value: parsed.data }
      : { ok: false, message: 'The API answer was not what was expected' };
  } catch {
    return { ok: false, message: 'The API did not answer' };
  }
}

export function getRuleTargets(
  api: string,
  projectId: string,
  fetcher: typeof fetch = fetch,
): Promise<Answer<RuleTargets>> {
  return call(
    TargetsSchema,
    `${base(api)}/api/projects/${encodeURIComponent(projectId)}/rules/targets`,
    {},
    fetcher,
  );
}

/** One candidate per line; blank lines and repeats are left out, at most 10. */
export function candidateLines(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out.slice(0, 10);
}

export function verifyRule(
  api: string,
  projectId: string,
  target: string,
  candidates: string[],
  fetcher: typeof fetch = fetch,
): Promise<Answer<RuleVerification>> {
  return call(
    VerificationSchema,
    `${base(api)}/api/projects/${encodeURIComponent(projectId)}/rules/verify`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target, candidates }),
    },
    fetcher,
  );
}
