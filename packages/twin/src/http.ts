// Sending twin events to the Afterlife API (Prompt 76), with the project's twin token.
import type { TwinEvent } from './capture';

export function httpPoster(opts: {
  api: string;
  projectId: string;
  token: string;
  fetcher?: typeof fetch;
}): (e: TwinEvent) => Promise<void> {
  const fetcher = opts.fetcher ?? fetch;
  const url = `${opts.api.replace(/\/+$/, '')}/api/projects/${encodeURIComponent(opts.projectId)}/twin/events`;
  return async (e) => {
    const res = await fetcher(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${opts.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(e),
    });
    // Already there: an earlier send got through but its answer was lost.
    if (res.ok || res.status === 409) return;
    if (res.status === 401 || res.status === 403)
      throw new Error(
        `The API refused the twin token (${res.status}): make a new one on the Ghost Twin tab`,
      );
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(`The API answered ${res.status}${body.message ? `: ${body.message}` : ''}`);
  };
}
