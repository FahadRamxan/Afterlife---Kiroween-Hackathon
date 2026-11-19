// Rules in Urdu on the Soul tab (Prompt 46): ask the worker to translate, and follow its job in
// the live events.
import type { Soul } from '@afterlife/soul';
import type { LiveEvent } from './live';
import type { Failure } from './projects';

const base = (api: string) => api.replace(/\/+$/, '');

export async function requestTranslation(
  api: string | undefined,
  projectId: string,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true } | Failure> {
  if (!api) return { ok: false, reason: 'unconfigured' };
  try {
    const res = await fetcher(
      `${base(api)}/api/projects/${encodeURIComponent(projectId)}/soul/translate`,
      { method: 'POST' },
    );
    if (res.status === 202) return { ok: true };
    const body = (await res.json().catch(() => ({}))) as { message?: unknown };
    return {
      ok: false,
      reason: res.status === 429 ? 'rate-limited' : 'error',
      message: typeof body.message === 'string' ? body.message : `The API answered ${res.status}`,
    };
  } catch {
    return { ok: false, reason: 'down' };
  }
}

export type TranslationState =
  | { state: 'idle' }
  | { state: 'running' }
  | { state: 'retrying'; message: string }
  | { state: 'done'; version: number | null }
  | { state: 'failed'; message: string };

type StepPayload = { step?: string; state?: string; message?: string };

/** Where the newest translate-soul job is, from the live events (oldest first). */
export function translationState(events: LiveEvent[]): TranslationState {
  let s: TranslationState = { state: 'idle' };
  for (const e of events) {
    if (e.type === 'soul_updated') {
      const p = e.payload as { reason?: string; version?: number };
      if (p?.reason === 'urdu')
        s = { state: 'done', version: typeof p.version === 'number' ? p.version : null };
      continue;
    }
    if (e.type !== 'step') continue;
    const p = e.payload as StepPayload;
    if (p?.step !== 'translate-soul') continue;
    if (p.state === 'started') s = { state: 'running' };
    else if (p.state === 'retrying') s = { state: 'retrying', message: p.message ?? '' };
    else if (p.state === 'failed') s = { state: 'failed', message: p.message ?? '' };
    else if (p.state === 'done' && s.state !== 'done') s = { state: 'done', version: null };
  }
  return s;
}

/** How many of the Soul's rules have no Urdu yet. */
export const untranslated = (soul: Soul): number => soul.rules.filter((r) => !r.ur.trim()).length;
