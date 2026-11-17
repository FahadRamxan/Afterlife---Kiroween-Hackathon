/** The inspect API (Prompt 21) refuses anything larger, so the browser checks first. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export type UploadCheck = { ok: true } | { ok: false; reason: 'not-zip' | 'empty' | 'too-big' };

/** First check of a chosen file, before anything is sent anywhere. */
export function checkUpload(file: { name: string; size: number }): UploadCheck {
  if (!/\.zip$/i.test(file.name)) return { ok: false, reason: 'not-zip' };
  if (file.size < 1) return { ok: false, reason: 'empty' };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, reason: 'too-big' };
  return { ok: true };
}
