import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().min(1).default('0.0.0.0'),
  /** Comma-separated origins allowed by CORS, for example the Vercel URL. */
  WEB_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url())),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /**
   * Postgres (Neon in prod, Docker locally). Without it séances are kept in memory, and lost on a
   * restart; the server says so when it starts.
   */
  DATABASE_URL: z
    .string()
    .optional()
    .transform((s) => (s ? s : undefined))
    .refine((s) => s === undefined || /^postgres(ql)?:\/\/[^\s]+$/.test(s), {
      message: 'must be a postgres:// URL',
    }),
});

export type Env = z.infer<typeof schema>;

/** Validates the API environment. Throws with the names of the bad variables. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid API environment: ${issues}`);
  }
  return result.data;
}
