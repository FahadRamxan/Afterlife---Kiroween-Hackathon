// Which speech-to-text service the worker uses. Amazon Transcribe is the plan (tech.md); its
// client is not built yet, so `none` is the only choice and the worker says voice notes were not
// transcribed instead of inventing text.
import type { SpeechClient } from './types';

export type SpeechEnv = { SPEECH_PROVIDER?: string };

export function speechClientFrom(env: SpeechEnv): SpeechClient | null {
  const provider = (env.SPEECH_PROVIDER ?? 'none').trim().toLowerCase();
  if (provider === 'none' || provider === '') return null;
  throw new Error(
    `SPEECH_PROVIDER must be none for now (the Amazon Transcribe client is not built yet), not "${env.SPEECH_PROVIDER}"`,
  );
}
