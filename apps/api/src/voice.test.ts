// @spec living-soul#1.3 The voice route (Prompt 80): a recording through the speech service, or a
// typed request, normalised; with the fake speech client, never the network.
import { FakeSpeechClient } from '@afterlife/crew';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { parseEnv } from './env';
const AUDIO = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]).toString('base64');
let close: (() => Promise<unknown>) | null = null;
afterEach(async () => {
  await close?.();
  close = null;
});
async function app(speech: FakeSpeechClient | null, env: Record<string, string> = {}) {
  const a = buildApp(parseEnv(env), { logger: false }, { speech });
  await a.ready();
  close = () => a.close();
  return a;
}
describe('POST /api/voice', () => {
  it('transcribes a recording and normalises it: "paanch feesad" is 5%', async () => {
    const fake = new FakeSpeechClient({
      language: 'hi-IN',
      text: 'पाँच प्रतिशत छूट दो',
      segments: [],
    });
    const a = await app(fake);
    const r = await a.inject({
      method: 'POST',
      url: '/api/voice',
      payload: { audio: { mime: 'audio/webm;codecs=opus', base64: AUDIO } },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      source: 'fake',
      language: 'hi-IN',
      transcript: 'पाँच प्रतिशत छूट दो',
      normalised: '5% छूट दो',
    });
    expect(fake.calls).toEqual([
      { bytes: 7, mime: 'audio/webm;codecs=opus', languages: ['ur-PK', 'en-US'] },
    ]);
  });
  it('a typed request is normalised the same way, with no speech service', async () => {
    const a = await app(null);
    const r = await a.inject({
      method: 'POST',
      url: '/api/voice',
      payload: { text: 'senior citizen ko das feesad discount do' },
    });
    expect(r.json()).toEqual({
      source: 'typed',
      language: null,
      transcript: 'senior citizen ko das feesad discount do',
      normalised: 'senior citizen ko 10% discount do',
    });
  });
  it('a recording with no speech service: 503, and says to type it', async () => {
    const a = await app(null);
    const r = await a.inject({
      method: 'POST',
      url: '/api/voice',
      payload: { audio: { mime: 'audio/webm', base64: AUDIO } },
    });
    expect(r.statusCode).toBe(503);
    expect(r.json()).toMatchObject({
      error: 'NO_SPEECH',
      message: expect.stringContaining('type'),
    });
  });
  it('the speech service failing is a 502 that hides its error', async () => {
    const a = await app(new FakeSpeechClient(new Error('AccessDeniedException: arn:aws:iam::123')));
    const r = await a.inject({
      method: 'POST',
      url: '/api/voice',
      payload: { audio: { mime: 'audio/webm', base64: AUDIO } },
    });
    expect(r.statusCode).toBe(502);
    expect(r.body).not.toContain('arn:aws');
  });
  it('refuses what is not audio or text, an empty text, and a body too big', async () => {
    const a = await app(new FakeSpeechClient({ language: 'en-US', text: 'x', segments: [] }));
    for (const payload of [
      { audio: { mime: 'text/html', base64: AUDIO } },
      { audio: { mime: 'audio/webm', base64: 'not base64!' } },
      { text: '   ' },
      { text: 'x', extra: 1 },
      {},
    ]) {
      const r = await a.inject({ method: 'POST', url: '/api/voice', payload });
      expect(r.statusCode, JSON.stringify(payload)).toBe(400);
    }
    const big = Buffer.alloc(5 * 1024 * 1024 + 10).toString('base64');
    const r = await a.inject({
      method: 'POST',
      url: '/api/voice',
      payload: { audio: { mime: 'audio/webm', base64: big } },
    });
    expect([413]).toContain(r.statusCode);
  });
  it('is rate limited per address like a raise (a transcription costs money)', async () => {
    const a = buildApp(
      parseEnv({}),
      { logger: false },
      { speech: null },
      { rateLimit: { perMinute: 100, createPerMinute: 2 } },
    );
    await a.ready();
    close = () => a.close();
    const send = () => a.inject({ method: 'POST', url: '/api/voice', payload: { text: 'das' } });
    expect((await send()).statusCode).toBe(200);
    expect((await send()).statusCode).toBe(200);
    expect((await send()).statusCode).toBe(429);
  });
});
