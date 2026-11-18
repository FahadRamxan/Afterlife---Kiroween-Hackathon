/** Where the API keeps séances and projects. An older API does not say: 'unknown'. */
export type ApiStorage = 'postgres' | 'memory' | 'unknown';
export type ApiStatus =
  | { state: 'healthy'; version: string; storage: ApiStorage }
  | { state: 'down' }
  | { state: 'unconfigured' };

export function healthUrl(base: string | undefined): string | null {
  if (!base) return null;
  return `${base.replace(/\/+$/, '')}/health`;
}

/** Calls the API /health endpoint. Never throws: any failure counts as "down". */
export async function checkApiHealth(
  base: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<ApiStatus> {
  const url = healthUrl(base);
  if (!url) return { state: 'unconfigured' };
  try {
    const res = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { state: 'down' };
    const body = (await res.json()) as { status?: unknown; version?: unknown; storage?: unknown };
    return body.status === 'ok'
      ? {
          state: 'healthy',
          version: String(body.version),
          storage:
            body.storage === 'postgres' || body.storage === 'memory' ? body.storage : 'unknown',
        }
      : { state: 'down' };
  } catch {
    return { state: 'down' };
  }
}
