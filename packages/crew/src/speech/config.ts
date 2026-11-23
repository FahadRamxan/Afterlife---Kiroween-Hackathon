// Which speech-to-text service is used, from the environment (Prompt 80). `transcribe`: Amazon
// Transcribe in AWS_REGION, with its recordings in TRANSCRIBE_BUCKET (an S3 bucket in that
// region). SPEECH_FALLBACK_REGION adds a second Transcribe in another region, tried when the
// first fails. `none` (the default): no service, and the app says so instead of inventing text.
import { FallbackSpeechClient } from './fallback';
import { TranscribeSpeechClient } from './transcribe';
import type { SpeechClient } from './types';
export type SpeechEnv = {
  SPEECH_PROVIDER?: string;
  TRANSCRIBE_BUCKET?: string;
  AWS_REGION?: string;
  SPEECH_FALLBACK_REGION?: string;
  /** A bucket in the fallback region (Transcribe reads only from its own region). */
  TRANSCRIBE_FALLBACK_BUCKET?: string;
};
export function speechClientFrom(env: SpeechEnv): SpeechClient | null {
  const provider = (env.SPEECH_PROVIDER ?? 'none').trim().toLowerCase();
  if (provider === 'none' || provider === '') return null;
  if (provider !== 'transcribe')
    throw new Error(`SPEECH_PROVIDER must be transcribe or none, not "${env.SPEECH_PROVIDER}"`);
  const bucket = env.TRANSCRIBE_BUCKET?.trim();
  if (!bucket) throw new Error('SPEECH_PROVIDER=transcribe needs TRANSCRIBE_BUCKET (an S3 bucket)');
  const region = env.AWS_REGION?.trim();
  const primary = new TranscribeSpeechClient({ bucket, ...(region ? { region } : {}) });
  const fallbackRegion = env.SPEECH_FALLBACK_REGION?.trim();
  if (!fallbackRegion) return primary;
  const fallbackBucket = env.TRANSCRIBE_FALLBACK_BUCKET?.trim();
  if (!fallbackBucket)
    throw new Error(
      'SPEECH_FALLBACK_REGION needs TRANSCRIBE_FALLBACK_BUCKET, a bucket in that region',
    );
  return new FallbackSpeechClient([
    primary,
    new TranscribeSpeechClient({ bucket: fallbackBucket, region: fallbackRegion }),
  ]);
}
