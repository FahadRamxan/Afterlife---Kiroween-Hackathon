// @spec living-soul#1.1 Which speech service, from the environment (Prompt 80).
import { describe, expect, it } from 'vitest';
import { speechClientFrom } from './config';
import { FallbackSpeechClient } from './fallback';
import { TranscribeSpeechClient } from './transcribe';
describe('speechClientFrom', () => {
  it('none unless asked: the app says no speech service is set up', () => {
    expect(speechClientFrom({})).toBeNull();
    expect(speechClientFrom({ SPEECH_PROVIDER: 'none' })).toBeNull();
    expect(speechClientFrom({ SPEECH_PROVIDER: ' ' })).toBeNull();
  });
  it('Amazon Transcribe, with the bucket its recordings go to', () => {
    const c = speechClientFrom({
      SPEECH_PROVIDER: 'Transcribe',
      TRANSCRIBE_BUCKET: 'shop-voice',
      AWS_REGION: 'us-east-1',
    });
    expect(c).toBeInstanceOf(TranscribeSpeechClient);
    expect(c!.provider).toBe('transcribe');
  });
  it('a second region to fall back to, with its own bucket', () => {
    const c = speechClientFrom({
      SPEECH_PROVIDER: 'transcribe',
      TRANSCRIBE_BUCKET: 'shop-voice',
      AWS_REGION: 'us-east-1',
      SPEECH_FALLBACK_REGION: 'eu-west-1',
      TRANSCRIBE_FALLBACK_BUCKET: 'shop-voice-eu',
    });
    expect(c).toBeInstanceOf(FallbackSpeechClient);
    expect(c!.provider).toBe('transcribe>transcribe');
  });
  it('says what is missing or wrong', () => {
    expect(() => speechClientFrom({ SPEECH_PROVIDER: 'transcribe' })).toThrow('TRANSCRIBE_BUCKET');
    expect(() => speechClientFrom({ SPEECH_PROVIDER: 'whisper' })).toThrow(
      'SPEECH_PROVIDER must be transcribe or none, not "whisper"',
    );
    expect(() =>
      speechClientFrom({
        SPEECH_PROVIDER: 'transcribe',
        TRANSCRIBE_BUCKET: 'b',
        SPEECH_FALLBACK_REGION: 'eu-west-1',
      }),
    ).toThrow('TRANSCRIBE_FALLBACK_BUCKET');
  });
});
