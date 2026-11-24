// @spec living-soul#1.1 The fake speech client and the fallback provider (Prompt 80).
import { describe, expect, it } from 'vitest';
import { FallbackSpeechClient } from './fallback';
import { FakeSpeechClient, type Transcript } from './types';
const URDU: Transcript = {
  language: 'ur-PK',
  text: 'پانچ فیصد رعایت',
  segments: [{ startMs: 0, endMs: 1500, text: 'پانچ فیصد رعایت' }],
};
const AUDIO = new Uint8Array([1, 2, 3, 4]);
describe('FakeSpeechClient', () => {
  it('answers its transcript, keeps each call, and never touches the network', async () => {
    const fake = new FakeSpeechClient(URDU);
    const t = await fake.transcribe(AUDIO, 'audio/webm;codecs=opus', { languages: ['ur-PK'] });
    expect(t).toEqual(URDU);
    // A copy: changing the answer does not change the fake.
    t.text = 'x';
    expect((await fake.transcribe(AUDIO, 'audio/webm')).text).toBe(URDU.text);
    expect(fake.calls).toEqual([
      { bytes: 4, mime: 'audio/webm;codecs=opus', languages: ['ur-PK'] },
      { bytes: 4, mime: 'audio/webm', languages: [] },
    ]);
  });
  it('can fail like a real service, and stops when aborted', async () => {
    await expect(
      new FakeSpeechClient(new Error('ThrottlingException')).transcribe(AUDIO, 'audio/webm'),
    ).rejects.toThrow('ThrottlingException');
    const ac = new AbortController();
    ac.abort();
    await expect(
      new FakeSpeechClient(URDU).transcribe(AUDIO, 'audio/webm', { signal: ac.signal }),
    ).rejects.toThrow();
  });
});
describe('FallbackSpeechClient', () => {
  it('uses the first service that answers, and says which', async () => {
    const down = new FakeSpeechClient(new Error('ServiceUnavailableException'));
    const up = new FakeSpeechClient(URDU);
    const both = new FallbackSpeechClient([down, up]);
    expect(both.provider).toBe('fake>fake');
    expect(await both.transcribe(AUDIO, 'audio/webm')).toEqual({ ...URDU, provider: 'fake' });
    expect(down.calls).toHaveLength(1);
    expect(up.calls).toHaveLength(1);
  });
  it('does not try the next one when the first answers', async () => {
    const first = new FakeSpeechClient(URDU);
    const second = new FakeSpeechClient(URDU);
    await new FallbackSpeechClient([first, second]).transcribe(AUDIO, 'audio/webm');
    expect(second.calls).toHaveLength(0);
  });
  it('when every one fails, says what each answered', async () => {
    const c = new FallbackSpeechClient([
      new FakeSpeechClient(new Error('ThrottlingException')),
      new FakeSpeechClient(new Error('AccessDenied')),
    ]);
    await expect(c.transcribe(AUDIO, 'audio/webm')).rejects.toThrow(
      'No speech service could transcribe it (fake: ThrottlingException; fake: AccessDenied)',
    );
  });
  it('an abort is not a failure to fall back from', async () => {
    const ac = new AbortController();
    ac.abort();
    const second = new FakeSpeechClient(URDU);
    const c = new FallbackSpeechClient([new FakeSpeechClient(URDU), second]);
    await expect(c.transcribe(AUDIO, 'audio/webm', { signal: ac.signal })).rejects.toThrow();
    expect(second.calls).toHaveLength(0);
  });
  it('needs at least one service', () => {
    expect(() => new FallbackSpeechClient([])).toThrow('at least one');
  });
});
