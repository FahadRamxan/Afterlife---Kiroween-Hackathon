// The fallback provider (Prompt 80): speech services in order; when one fails (down, throttled,
// a format it does not take), the next one tries. The error says what each one answered.
import type { SpeechClient, Transcript } from './types';
export class FallbackSpeechClient implements SpeechClient {
  readonly provider: string;
  constructor(private readonly clients: SpeechClient[]) {
    if (!clients.length) throw new Error('FallbackSpeechClient needs at least one speech client');
    this.provider = clients.map((c) => c.provider).join('>');
  }
  async transcribe(
    audio: Uint8Array,
    mime: string,
    opts: { languages?: string[]; signal?: AbortSignal } = {},
  ): Promise<Transcript & { provider: string }> {
    const failed: string[] = [];
    for (const c of this.clients) {
      opts.signal?.throwIfAborted();
      try {
        return { ...(await c.transcribe(audio, mime, opts)), provider: c.provider };
      } catch (e) {
        if (opts.signal?.aborted) throw e;
        failed.push(`${c.provider}: ${(e as Error).message}`);
      }
    }
    throw new Error(`No speech service could transcribe it (${failed.join('; ')})`);
  }
}
