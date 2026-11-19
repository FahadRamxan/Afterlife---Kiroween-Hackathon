import { z } from 'zod';

/** Proxies on a private network (proxy-addr's names): what TRUST_PROXY=1 trusts. */
export const PRIVATE_PROXIES = 'loopback, linklocal, uniquelocal';

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
   * Which proxies may tell the API the visitor's address (X-Forwarded-For). "1" (Render): only
   * proxies on a private network, so the address is the one Render's proxy saw. Anything a
   * visitor writes into the header themselves is never trusted: trusting every hop (Fastify's
   * `true`) let anyone pick an address and get a fresh rate limit allowance on every request.
   * Fastify ignores a hop count (it fails closed), so this is a list of addresses or ranges.
   * "0" or "false": trust no proxy. Anything else: the trusted addresses, comma-separated.
   */
  TRUST_PROXY: z
    .string()
    .default('0')
    .transform((v) => v.trim())
    .refine((v) => /^[\w.:/, -]*$/.test(v), { message: 'must be 0, 1 or a list of addresses' })
    .transform((v): false | string =>
      v === '' || v === '0' || v === 'false'
        ? false
        : v === '1' || v === 'true'
          ? PRIVATE_PROXIES
          : v,
    ),
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
