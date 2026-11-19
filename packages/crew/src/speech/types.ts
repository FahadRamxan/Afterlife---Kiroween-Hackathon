// Speech to text behind one interface (tech.md: Amazon Transcribe, Urdu and English, behind
// `SpeechClient`). The owner talks while showing the old app in a séance; the transcript becomes
// hints for the Archaeologist. Unit tests use the fake; they never call the network.

/** A stretch of speech, with its time in the recording (ms from its start). */
export type SpeechSegment = { startMs: number; endMs: number; text: string };

export type Transcript = {
  /** `ur-PK` or `en-US`: the language that was spoken. */
  language: string;
  text: string;
  segments: SpeechSegment[];
};

export interface SpeechClient {
  readonly provider: string;
  transcribe(
    audio: Uint8Array,
    mime: string,
    opts?: { languages?: string[]; signal?: AbortSignal },
  ): Promise<Transcript>;
}

/** The languages a shop owner in Pakistan speaks to the app (crew.md). */
export const SEANCE_LANGUAGES = ['ur-PK', 'en-US'];

/** A scripted transcriber for tests: always answers the same transcript, and keeps each call. */
export class FakeSpeechClient implements SpeechClient {
  readonly provider = 'fake';
  readonly calls: { bytes: number; mime: string; languages: string[] }[] = [];
  constructor(private readonly answer: Transcript | Error) {}

  async transcribe(
    audio: Uint8Array,
    mime: string,
    opts: { languages?: string[]; signal?: AbortSignal } = {},
  ) {
    opts.signal?.throwIfAborted();
    this.calls.push({ bytes: audio.length, mime, languages: opts.languages ?? [] });
    if (this.answer instanceof Error) throw this.answer;
    return structuredClone(this.answer);
  }
}
