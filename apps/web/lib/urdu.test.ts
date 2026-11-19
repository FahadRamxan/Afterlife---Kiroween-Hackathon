import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { SHIFA_REFERENCE_SOUL } from '../../../packages/soul/src/examples/shifa';
import type { LiveEvent } from './live';
import { requestTranslation, translationState, untranslated } from './urdu';

const id = '0192f5a0-1234-7abc-8def-0123456789ab';
let seq = 0;
const ev = (type: string, payload: unknown): LiveEvent => ({
  seq: ++seq,
  type,
  payload,
  at: '2026-11-01T10:00:00.000Z',
});
const step = (state: string, message?: string) =>
  ev('step', { step: 'translate-soul', state, attempt: 1, ...(message ? { message } : {}) });

describe('requestTranslation', () => {
  it('posts to the translate route and is ok on 202', async () => {
    const f = vi.fn().mockResolvedValue(new Response('{"queued":true}', { status: 202 }));
    expect(await requestTranslation('https://a/', id, f)).toEqual({ ok: true });
    expect(f).toHaveBeenCalledWith(`https://a/api/projects/${id}/soul/translate`, {
      method: 'POST',
    });
  });
  it('gives the API’s reason, or says it is down or not configured', async () => {
    const f = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'A translation is already waiting to run' }), {
        status: 409,
      }),
    );
    expect(await requestTranslation('https://a', id, f)).toEqual({
      ok: false,
      reason: 'error',
      message: 'A translation is already waiting to run',
    });
    expect(await requestTranslation(undefined, id)).toEqual({ ok: false, reason: 'unconfigured' });
    const down = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    expect(await requestTranslation('https://a', id, down)).toEqual({ ok: false, reason: 'down' });
  });
});

describe('translationState', () => {
  it('follows the translate-soul job and ignores other steps', () => {
    expect(translationState([])).toEqual({ state: 'idle' });
    expect(
      translationState([ev('step', { step: 'possess', state: 'started', attempt: 1 })]),
    ).toEqual({ state: 'idle' });
    expect(translationState([step('started')])).toEqual({ state: 'running' });
    expect(translationState([step('started'), step('retrying', 'Throttled')])).toEqual({
      state: 'retrying',
      message: 'Throttled',
    });
    expect(
      translationState([
        step('started'),
        ev('soul_updated', { reason: 'urdu', version: 3 }),
        step('done'),
      ]),
    ).toEqual({ state: 'done', version: 3 });
    expect(translationState([step('started'), step('failed', 'No language model')])).toEqual({
      state: 'failed',
      message: 'No language model',
    });
  });
  it('a new run after a failure starts over (invariant: the newest job decides)', () => {
    const states = fc.constantFrom('started', 'retrying', 'failed', 'done');
    fc.assert(
      fc.property(fc.array(states, { maxLength: 10 }), (history) => {
        const s = translationState([...history.map((h) => step(h, 'x')), step('started')]);
        expect(s).toEqual({ state: 'running' });
      }),
    );
  });
});

describe('untranslated', () => {
  it('counts the rules with no Urdu', () => {
    expect(untranslated(SHIFA_REFERENCE_SOUL)).toBe(SHIFA_REFERENCE_SOUL.rules.length);
    const one = {
      ...SHIFA_REFERENCE_SOUL,
      rules: SHIFA_REFERENCE_SOUL.rules.map((r, i) => (i ? r : { ...r, ur: 'بل' })),
    };
    expect(untranslated(one)).toBe(SHIFA_REFERENCE_SOUL.rules.length - 1);
  });
});
