// @spec living-soul#1.3 The browser side of the owner's voice (Prompt 80).
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isUrduScript, pickMime, sendVoice, toBase64 } from './voice';
afterEach(() => vi.unstubAllGlobals());
describe('pickMime', () => {
  it('webm/opus where the browser records it, then ogg, then mp4, else the browser’s own', () => {
    expect(pickMime(() => true)).toBe('audio/webm;codecs=opus');
    expect(pickMime((m) => m.startsWith('audio/ogg'))).toBe('audio/ogg;codecs=opus');
    expect(pickMime((m) => m === 'audio/mp4')).toBe('audio/mp4');
    expect(pickMime(() => false)).toBe('');
  });
});
describe('toBase64', () => {
  it('matches Node’s base64 for any bytes, long recordings included', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 100_000 }), (b) => {
        expect(toBase64(b)).toBe(Buffer.from(b).toString('base64'));
      }),
      { numRuns: 30 },
    );
  });
});
describe('sendVoice', () => {
  const heard = {
    source: 'typed',
    language: null,
    transcript: 'das feesad',
    normalised: '10%',
  };
  it('sends a typed request as text', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(heard)));
    vi.stubGlobal('fetch', f);
    expect(await sendVoice('http://api/', { text: 'das feesad' })).toEqual({ ok: true, ...heard });
    expect(f).toHaveBeenCalledWith('http://api/api/voice', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'das feesad' }),
    });
  });
  it('sends a recording as base64 with its type', async () => {
    const sent: RequestInit[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        sent.push(init);
        return new Response(JSON.stringify(heard));
      }),
    );
    await sendVoice('http://api', { audio: { mime: 'audio/webm', bytes: new Uint8Array([1, 2]) } });
    expect(JSON.parse(String(sent[0]!.body))).toEqual({
      audio: { mime: 'audio/webm', base64: 'AQI=' },
    });
  });
  it('passes on why the API could not', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'No speech service is set up' }), { status: 503 }),
      ),
    );
    expect(await sendVoice('http://api', { text: 'x' })).toEqual({
      ok: false,
      message: 'No speech service is set up',
    });
    expect(await sendVoice(undefined, { text: 'x' })).toMatchObject({ ok: false });
  });
});
describe('isUrduScript', () => {
  it('tells Urdu script from Roman Urdu and Devanagari', () => {
    expect(isUrduScript('پانچ فیصد')).toBe(true);
    expect(isUrduScript('paanch feesad')).toBe(false);
    expect(isUrduScript('पाँच प्रतिशत')).toBe(false);
  });
});
