// Speech to text with Amazon Transcribe (tech.md), as a batch job: the recording goes to an S3
// bucket of ours, Transcribe writes its transcript next to it, and both are deleted after. Batch
// because it takes the browser's own recording (MediaRecorder's webm/opus) as it is; streaming
// takes only PCM, FLAC or Ogg Opus.
// Transcribe has no Urdu. Spoken Urdu is sent as Hindi (hi-IN), the language it is closest to, and
// comes back in Devanagari; `normaliseTranscript` reads its numbers. English is en-US. With both,
// Transcribe identifies which one was spoken.
import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  DeleteTranscriptionJobCommand,
  GetTranscriptionJobCommand,
  StartTranscriptionJobCommand,
  TranscribeClient,
  type LanguageCode,
  type MediaFormat,
} from '@aws-sdk/client-transcribe';
import { z } from 'zod';
import type { SpeechClient, Transcript } from './types';
/** What we ask Transcribe for each language we are given (it has no ur-PK). */
export const TRANSCRIBE_LANGUAGE: Record<string, LanguageCode> = {
  'ur-PK': 'hi-IN',
  'hi-IN': 'hi-IN',
  'en-US': 'en-US',
  'en-GB': 'en-GB',
  'en-IN': 'en-IN',
};
const FORMATS: Record<string, MediaFormat> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
};
/** "audio/webm;codecs=opus" → webm; null for a type Transcribe does not take. */
export function mediaFormatOf(mime: string): MediaFormat | null {
  return FORMATS[mime.split(';')[0]!.trim().toLowerCase()] ?? null;
}
type Sender = { send(cmd: unknown, opts?: { abortSignal?: AbortSignal }): Promise<unknown> };
const Output = z.object({
  results: z.object({
    transcripts: z.array(z.object({ transcript: z.string() })),
    audio_segments: z
      .array(z.object({ start_time: z.string(), end_time: z.string(), transcript: z.string() }))
      .optional(),
  }),
});
const ms = (s: string) => Math.round(Number(s) * 1000);
export class TranscribeSpeechClient implements SpeechClient {
  readonly provider = 'transcribe';
  private readonly s3: Sender;
  private readonly jobs: Sender;
  private readonly bucket: string;
  private readonly prefix: string;
  private readonly pollMs: number;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  constructor(opts: {
    bucket: string;
    region?: string;
    prefix?: string;
    /** For tests: fake SDK clients (they never call the network). */
    s3?: Sender;
    transcribe?: Sender;
    pollMs?: number;
    timeoutMs?: number;
    sleep?: (ms: number) => Promise<void>;
  }) {
    this.bucket = opts.bucket;
    this.prefix = opts.prefix ?? 'afterlife/voice/';
    const region = opts.region ? { region: opts.region } : {};
    this.s3 = opts.s3 ?? (new S3Client(region) as unknown as Sender);
    this.jobs = opts.transcribe ?? (new TranscribeClient(region) as unknown as Sender);
    this.pollMs = opts.pollMs ?? 1000;
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.sleep = opts.sleep ?? ((n) => new Promise((r) => setTimeout(r, n)));
  }
  async transcribe(
    audio: Uint8Array,
    mime: string,
    opts: { languages?: string[]; signal?: AbortSignal } = {},
  ): Promise<Transcript> {
    const format = mediaFormatOf(mime);
    if (!format) throw new Error(`Amazon Transcribe does not take ${mime} recordings`);
    const languages = [
      ...new Set((opts.languages?.length ? opts.languages : ['ur-PK', 'en-US']).map(toTranscribe)),
    ];
    const id = randomUUID();
    const job = `afterlife-${id}`;
    const media = `${this.prefix}${id}.${format}`;
    const out = `${this.prefix}${id}.json`;
    const signal = opts.signal;
    const send = (cmd: unknown, via: Sender) =>
      via.send(cmd, signal ? { abortSignal: signal } : undefined);
    await send(
      new PutObjectCommand({ Bucket: this.bucket, Key: media, Body: audio, ContentType: mime }),
      this.s3,
    );
    try {
      await send(
        new StartTranscriptionJobCommand({
          TranscriptionJobName: job,
          Media: { MediaFileUri: `s3://${this.bucket}/${media}` },
          MediaFormat: format,
          OutputBucketName: this.bucket,
          OutputKey: out,
          ...(languages.length > 1
            ? { IdentifyLanguage: true, LanguageOptions: languages }
            : { LanguageCode: languages[0] }),
        }),
        this.jobs,
      );
      const started = Date.now();
      let language: string | undefined;
      for (;;) {
        signal?.throwIfAborted();
        const r = (await send(
          new GetTranscriptionJobCommand({ TranscriptionJobName: job }),
          this.jobs,
        )) as {
          TranscriptionJob?: {
            TranscriptionJobStatus?: string;
            FailureReason?: string;
            LanguageCode?: string;
          };
        };
        const j = r.TranscriptionJob;
        if (j?.TranscriptionJobStatus === 'COMPLETED') {
          language = j.LanguageCode;
          break;
        }
        if (j?.TranscriptionJobStatus === 'FAILED')
          throw new Error(`Amazon Transcribe could not transcribe it: ${j.FailureReason ?? '?'}`);
        if (Date.now() - started > this.timeoutMs)
          throw new Error(`Amazon Transcribe took longer than ${this.timeoutMs / 1000} s`);
        await this.sleep(this.pollMs);
      }
      const obj = (await send(
        new GetObjectCommand({ Bucket: this.bucket, Key: out }),
        this.s3,
      )) as { Body?: { transformToString(): Promise<string> } };
      const parsed = Output.parse(JSON.parse((await obj.Body?.transformToString()) ?? '{}'));
      const text = parsed.results.transcripts
        .map((t) => t.transcript)
        .join(' ')
        .trim();
      const segments = (parsed.results.audio_segments ?? []).map((s) => ({
        startMs: ms(s.start_time),
        endMs: ms(s.end_time),
        text: s.transcript,
      }));
      return { language: language ?? languages[0]!, text, segments };
    } finally {
      // Nobody's voice is kept: the recording, the transcript file and the job go.
      await Promise.allSettled([
        this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: media })),
        this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: out })),
        this.jobs.send(new DeleteTranscriptionJobCommand({ TranscriptionJobName: job })),
      ]);
    }
  }
}
function toTranscribe(lang: string): LanguageCode {
  const l = TRANSCRIBE_LANGUAGE[lang];
  if (!l) throw new Error(`Amazon Transcribe is not set up for ${lang}`);
  return l;
}
