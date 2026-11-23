// The owner's voice from the browser (Prompt 80): recorded with MediaRecorder (webm/opus where the
// browser has it), sent to the API to be transcribed and normalised; or typed, and normalised.
import { z } from 'zod';
/** The recording types to ask MediaRecorder for, best first (Amazon Transcribe takes all three). */
export const VOICE_MIMES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'];
/** The first type this browser records, or '' (let it choose). */
export function pickMime(isTypeSupported: (m: string) => boolean): string {
  return VOICE_MIMES.find((m) => isTypeSupported(m)) ?? '';
}
const HeardSchema = z.object({
  source: z.string(),
  language: z.string().nullable(),
  transcript: z.string(),
  normalised: z.string(),
});
export type Heard = z.infer<typeof HeardSchema>;
/** Bytes as base64, in chunks (String.fromCharCode on a whole recording overflows the stack). */
export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export async function sendVoice(
  api: string | undefined,
  body: { audio: { mime: string; bytes: Uint8Array } } | { text: string },
): Promise<({ ok: true } & Heard) | { ok: false; message: string }> {
  if (!api) return { ok: false, message: 'No API is set up for this site' };
  try {
    const res = await fetch(`${api.replace(/\/+$/, '')}/api/voice`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        'text' in body
          ? { text: body.text }
          : { audio: { mime: body.audio.mime, base64: toBase64(body.audio.bytes) } },
      ),
    });
    if (!res.ok)
      return {
        ok: false,
        message:
          ((await res.json().catch(() => ({}))) as { message?: string }).message ??
          `The API answered ${res.status}`,
      };
    const heard = HeardSchema.safeParse(await res.json());
    return heard.success
      ? { ok: true, ...heard.data }
      : { ok: false, message: 'The API sent an answer this page cannot read' };
  } catch {
    return { ok: false, message: 'The API cannot be reached' };
  }
}
/** Text in Arabic script is Urdu (right to left); anything else is shown left to right. */
export const isUrduScript = (s: string) => /[\u0600-\u06FF]/.test(s);
