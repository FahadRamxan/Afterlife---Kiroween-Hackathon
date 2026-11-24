// Sending twin events to the Afterlife API (Prompt 76), with the project's twin token.
import type { TwinEvent } from './capture';

/**
 * The API takes nothing more from this capture: the shop has switched over to the reborn app, so
 * the old app's data is frozen. Fatal: the capture stops instead of sending it again and again.
 */
export class TwinStoppedError extends Error {
  readonly fatal = true;
  constructor(message: string) {
    super(message);
    this.name = 'TwinStoppedError';
  }
}

/**
 * Sends each event; resolves to the number the API keeps it under. A capture numbers its changes
 * 1, 2, 3... from when it starts, and the API keeps each number once, so a capture started again
 * (the shop PC restarted) would send 1, 2, 3... again and have them taken as already there: lost.
 * So the numbers go on from the newest one the API has, asked for before the first send (and
 * again, until the API answers).
 */
export function httpPoster(opts: {
  api: string;
  projectId: string;
  token: string;
  fetcher?: typeof fetch;
}): (e: TwinEvent) => Promise<number> {
  const fetcher = opts.fetcher ?? fetch;
  const twin = `${opts.api.replace(/\/+$/, '')}/api/projects/${encodeURIComponent(opts.projectId)}/twin`;
  let after: number | null = null;
  const lastSeq = async () => {
    const res = await fetcher(twin);
    if (!res.ok) throw new Error(`The API answered ${res.status} when asked for the twin`);
    const { lastSeq: n } = (await res.json().catch(() => ({}))) as { lastSeq?: unknown };
    return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : 0;
  };
  return async (e) => {
    after ??= await lastSeq();
    const seq = after + e.seq;
    const res = await fetcher(`${twin}/events`, {
      method: 'POST',
      headers: { authorization: `Bearer ${opts.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ...e, seq }),
    });
    if (res.ok) return seq;
    if (res.status === 401 || res.status === 403)
      throw new Error(
        `The API refused the twin token (${res.status}): make a new one on the Ghost Twin tab`,
      );
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    if (res.status === 409 && body.error === 'SWITCHED')
      throw new TwinStoppedError(
        "The shop has switched over to the reborn app: the old app's data is frozen, so there is nothing more to send",
      );
    // Already there: an earlier send got through but its answer was lost.
    if (res.status === 409) return seq;
    throw new Error(`The API answered ${res.status}${body.message ? `: ${body.message}` : ''}`);
  };
}
