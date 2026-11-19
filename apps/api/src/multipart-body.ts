// Test helper: a multipart/form-data body for app.inject (fields first, then files).
export function multipartBody(
  parts: (
    { name: string; value: string } | { name: string; filename: string; bytes: Uint8Array }
  )[],
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = `----afterlife${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const p of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if ('value' in p) {
      chunks.push(
        Buffer.from(`Content-Disposition: form-data; name="${p.name}"\r\n\r\n${p.value}\r\n`),
      );
    } else {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${p.name}"; filename="${p.filename}"\r\nContent-Type: application/zip\r\n\r\n`,
        ),
        Buffer.from(p.bytes),
        Buffer.from('\r\n'),
      );
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}
