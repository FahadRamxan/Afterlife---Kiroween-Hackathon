// The Exorcism tab's data (Prompt 75): the Exorcist's findings for a project from the API, and the
// owner's choice for each (Prompt 74).
import { z } from 'zod';

const FindingSchema = z.object({
  code: z.string(),
  smell: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  target: z.string().nullable(),
  titleEn: z.string(),
  titleUr: z.string(),
  en: z.string(),
  ur: z.string(),
  since: z.number().nullable(),
  evidence: z.array(
    z.object({
      kind: z.string(),
      ref: z.string(),
      text: z.string(),
      screen: z.array(z.string()).optional(),
    }),
  ),
  decision: z.enum(['pending', 'keep', 'fix']),
  decidedAt: z.string().nullable(),
  fixable: z.boolean(),
  why: z.string().nullable(),
  fixEn: z.string(),
  fixUr: z.string(),
});
export type ExorcismFinding = z.infer<typeof FindingSchema>;
export const ExorcismsSchema = z.object({
  findings: z.array(FindingSchema),
  remaining: z.number().int().nonnegative(),
});

const DecidedSchema = z.object({
  decision: z.enum(['keep', 'fix']),
  soulVersion: z.number(),
  changed: z.boolean(),
  proving: z.boolean(),
});

const base = (api: string) => api.replace(/\/+$/, '');
const message = async (res: Response) =>
  ((await res.json().catch(() => ({}))) as { message?: string }).message ??
  `The API answered ${res.status}`;

export async function getExorcisms(
  api: string | undefined,
  projectId: string,
): Promise<
  { ok: true; findings: ExorcismFinding[]; remaining: number } | { ok: false; message: string }
> {
  if (!api) return { ok: false, message: 'No API is set up for this site' };
  try {
    const res = await fetch(`${base(api)}/api/projects/${encodeURIComponent(projectId)}/exorcisms`);
    if (!res.ok) return { ok: false, message: await message(res) };
    const body = ExorcismsSchema.safeParse(await res.json());
    return body.success
      ? { ok: true, ...body.data }
      : { ok: false, message: 'The API sent findings this page cannot read' };
  } catch {
    return { ok: false, message: 'The API cannot be reached' };
  }
}

export async function decideExorcism(
  api: string | undefined,
  projectId: string,
  code: string,
  decision: 'keep' | 'fix',
): Promise<({ ok: true } & z.infer<typeof DecidedSchema>) | { ok: false; message: string }> {
  if (!api) return { ok: false, message: 'No API is set up for this site' };
  try {
    const res = await fetch(
      `${base(api)}/api/projects/${encodeURIComponent(projectId)}/exorcisms/${encodeURIComponent(code)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision }),
      },
    );
    if (!res.ok) return { ok: false, message: await message(res) };
    const body = DecidedSchema.safeParse(await res.json());
    return body.success ? { ok: true, ...body.data } : { ok: false, message: 'Unreadable answer' };
  } catch {
    return { ok: false, message: 'The API cannot be reached' };
  }
}

/** "since 1998": how long the old app has been doing it. */
export const sinceText = (year: number | null) => (year ? `since ${year}` : '');
