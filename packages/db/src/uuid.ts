import { randomFillSync } from 'node:crypto';

/**
 * A UUIDv7 (RFC 9562): 48 bits of Unix time in milliseconds, then random bits. Ids sort by
 * creation time, which keeps Postgres indexes compact (Prompt 35 uses the same ids).
 */
export function uuidv7(ms: number = Date.now()): string {
  const b = randomFillSync(new Uint8Array(16));
  let t = ms;
  for (let i = 5; i >= 0; i--) {
    b[i] = t % 256;
    t = Math.floor(t / 256);
  }
  b[6] = 0x70 | (b[6]! & 0x0f); // version 7
  b[8] = 0x80 | (b[8]! & 0x3f); // variant 10
  const h = Buffer.from(b).toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
