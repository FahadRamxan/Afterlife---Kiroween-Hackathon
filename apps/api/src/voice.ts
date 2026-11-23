// The owner's voice on the API (Prompt 80): a recording from the browser (MediaRecorder,
// webm/opus) is transcribed by the speech service, Urdu or English, and normalised for the rule
// language (number words to digits, "feesad" to %). A typed request is normalised the same way:
// the fallback when there is no speech service, no microphone, or the owner prefers to type.
// Nothing is kept here; turning the request into a rule change is Prompt 81.
import { normaliseTranscript, SEANCE_LANGUAGES, type SpeechClient } from '@afterlife/crew';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
/** About 60 s of opus at 64 kbit/s is 0.5 MB; 4 MB is plenty, and base64 makes it a third more. */
export const MAX_VOICE_BYTES = 4 * 1024 * 1024;
const Body = z.union([
  z
    .object({
      audio: z.object({
        mime: z.string().regex(/^audio\/[\w.+-]+(;\s*codecs=[\w.,-]+)?$/i, 'an audio type'),
        base64: z
          .string()
          .min(1)
          .regex(/^[A-Za-z0-9+/]+=*$/, 'base64'),
      }),
    })
    .strict(),
  z.object({ text: z.string().trim().min(1).max(500) }).strict(),
]);
export function voiceRoutes(speech: SpeechClient | null, opts: { perMinute: number }) {
  return async (app: FastifyInstance) => {
    app.post<{ Body: unknown }>(
      '/api/voice',
      {
        bodyLimit: Math.ceil((MAX_VOICE_BYTES * 4) / 3) + 1024,
        // A transcription costs money and there is no login: the raise limit, per address.
        config: { rateLimit: { max: opts.perMinute, timeWindow: '1 minute' } },
      },
      async (req, reply) => {
        const body = Body.safeParse(req.body);
        if (!body.success)
          return reply.code(400).send({
            error: 'BAD_VOICE',
            message: 'Send { "audio": { "mime", "base64" } } or { "text" }',
          });
        if ('text' in body.data)
          return {
            source: 'typed',
            language: null,
            transcript: body.data.text,
            normalised: normaliseTranscript(body.data.text),
          };
        if (!speech)
          return reply.code(503).send({
            error: 'NO_SPEECH',
            message: 'No speech service is set up on this API: type the change instead',
          });
        const audio = new Uint8Array(Buffer.from(body.data.audio.base64, 'base64'));
        if (audio.length > MAX_VOICE_BYTES)
          return reply.code(413).send({ error: 'TOO_LONG', message: 'Keep it under a minute' });
        try {
          const t = await speech.transcribe(audio, body.data.audio.mime, {
            languages: SEANCE_LANGUAGES,
          });
          return {
            source: (t as { provider?: string }).provider ?? speech.provider,
            language: t.language,
            transcript: t.text,
            normalised: normaliseTranscript(t.text),
          };
        } catch (e) {
          req.log.warn({ err: e }, 'speech service failed');
          return reply.code(502).send({
            error: 'SPEECH_FAILED',
            message: 'The speech service could not transcribe it: try again, or type it',
          });
        }
      },
    );
  };
}
