// @spec living-soul#1.1 The Amazon Transcribe client (Prompt 80), against fake S3 and Transcribe
// clients: it never calls the network.
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  DeleteTranscriptionJobCommand,
  GetTranscriptionJobCommand,
  StartTranscriptionJobCommand,
} from '@aws-sdk/client-transcribe';
import { describe, expect, it } from 'vitest';
import { TranscribeSpeechClient, mediaFormatOf } from './transcribe';
type Cmd = { constructor: { name: string }; input: Record<string, unknown> };
const OUTPUT = {
  results: {
    transcripts: [{ transcript: 'पाँच प्रतिशत छूट दो' }],
    audio_segments: [{ start_time: '0.12', end_time: '1.9', transcript: 'पाँच प्रतिशत छूट दो' }],
  },
};
function fakes(statuses: string[], output: unknown = OUTPUT, failure?: string) {
  const s3: Cmd[] = [];
  const tr: Cmd[] = [];
  const stored = new Map<string, unknown>();
  let polls = 0;
  return {
    s3Calls: s3,
    trCalls: tr,
    stored,
    s3: {
      async send(c: unknown) {
        const cmd = c as Cmd;
        s3.push(cmd);
        if (cmd instanceof PutObjectCommand) stored.set(String(cmd.input.Key), cmd.input.Body);
        if (cmd instanceof GetObjectCommand)
          return { Body: { transformToString: async () => JSON.stringify(output) } };
        if (cmd instanceof DeleteObjectCommand) stored.delete(String(cmd.input.Key));
        return {};
      },
    },
    transcribe: {
      async send(c: unknown) {
        const cmd = c as Cmd;
        tr.push(cmd);
        if (cmd instanceof GetTranscriptionJobCommand) {
          const status = statuses[Math.min(polls++, statuses.length - 1)];
          return {
            TranscriptionJob: {
              TranscriptionJobStatus: status,
              LanguageCode: 'hi-IN',
              ...(failure ? { FailureReason: failure } : {}),
            },
          };
        }
        return {};
      },
    },
  };
}
const AUDIO = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]);
const client = (f: ReturnType<typeof fakes>, extra = {}) =>
  new TranscribeSpeechClient({
    bucket: 'shop-voice',
    s3: f.s3,
    transcribe: f.transcribe,
    sleep: async () => {},
    ...extra,
  });
describe('TranscribeSpeechClient', () => {
  it('uploads the recording, runs a job that identifies Urdu (as hi-IN) or English, reads the transcript', async () => {
    const f = fakes(['IN_PROGRESS', 'IN_PROGRESS', 'COMPLETED']);
    const t = await client(f).transcribe(AUDIO, 'audio/webm;codecs=opus', {
      languages: ['ur-PK', 'en-US'],
    });
    expect(t).toEqual({
      language: 'hi-IN',
      text: 'पाँच प्रतिशत छूट दो',
      segments: [{ startMs: 120, endMs: 1900, text: 'पाँच प्रतिशत छूट दो' }],
    });
    const put = f.s3Calls.find((c) => c instanceof PutObjectCommand)!;
    expect(put.input).toMatchObject({
      Bucket: 'shop-voice',
      ContentType: 'audio/webm;codecs=opus',
    });
    expect(String(put.input.Key)).toMatch(/^afterlife\/voice\/[0-9a-f-]{36}\.webm$/);
    const start = f.trCalls.find((c) => c instanceof StartTranscriptionJobCommand)!;
    expect(start.input).toMatchObject({
      MediaFormat: 'webm',
      Media: { MediaFileUri: `s3://shop-voice/${put.input.Key}` },
      IdentifyLanguage: true,
      LanguageOptions: ['hi-IN', 'en-US'],
      OutputBucketName: 'shop-voice',
    });
    expect(f.trCalls.filter((c) => c instanceof GetTranscriptionJobCommand)).toHaveLength(3);
  });
  it('keeps nobody’s voice: the recording, the transcript file and the job are deleted', async () => {
    const f = fakes(['COMPLETED']);
    await client(f).transcribe(AUDIO, 'audio/webm');
    expect(f.stored.size).toBe(0);
    expect(f.s3Calls.filter((c) => c instanceof DeleteObjectCommand)).toHaveLength(2);
    expect(f.trCalls.some((c) => c instanceof DeleteTranscriptionJobCommand)).toBe(true);
  });
  it('one language: no identification, that language only', async () => {
    const f = fakes(['COMPLETED']);
    await client(f).transcribe(AUDIO, 'audio/ogg', { languages: ['en-US'] });
    const start = f.trCalls.find((c) => c instanceof StartTranscriptionJobCommand)!;
    expect(start.input).toMatchObject({ LanguageCode: 'en-US', MediaFormat: 'ogg' });
    expect(start.input.IdentifyLanguage).toBeUndefined();
  });
  it('says why a job failed, and still cleans up', async () => {
    const f = fakes(['FAILED'], OUTPUT, 'The media is too short');
    await expect(client(f).transcribe(AUDIO, 'audio/webm')).rejects.toThrow(
      'Amazon Transcribe could not transcribe it: The media is too short',
    );
    expect(f.stored.size).toBe(0);
  });
  it('gives up after its timeout', async () => {
    const f = fakes(['IN_PROGRESS']);
    let now = 0;
    const c = client(f, {
      timeoutMs: 1000,
      pollMs: 400,
      sleep: async (ms: number) => void (now += ms),
    });
    const real = Date.now;
    Date.now = () => real() + now;
    try {
      await expect(c.transcribe(AUDIO, 'audio/webm')).rejects.toThrow('longer than 1 s');
    } finally {
      Date.now = real;
    }
  });
  it('refuses a recording type Transcribe does not take, before uploading anything', async () => {
    const f = fakes(['COMPLETED']);
    await expect(client(f).transcribe(AUDIO, 'video/x-msvideo')).rejects.toThrow(
      'does not take video/x-msvideo',
    );
    expect(f.s3Calls).toHaveLength(0);
    expect(mediaFormatOf('audio/mp4')).toBe('mp4');
    expect(mediaFormatOf('AUDIO/WEBM; codecs=opus')).toBe('webm');
  });
  it('stops when the request is aborted', async () => {
    const f = fakes(['IN_PROGRESS']);
    const ac = new AbortController();
    const c = client(f, { sleep: async () => ac.abort() });
    await expect(c.transcribe(AUDIO, 'audio/webm', { signal: ac.signal })).rejects.toThrow();
    expect(f.stored.size).toBe(0);
  });
});
