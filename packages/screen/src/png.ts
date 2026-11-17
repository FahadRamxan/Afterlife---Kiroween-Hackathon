// A small PNG reader and writer for emulator screenshots: 8-bit RGB or RGBA, not interlaced.
// Pure (Uint8Array in, Uint8Array out), so it runs in the browser, the worker and tests.
import { unzlibSync, zlibSync } from 'fflate';

export class PngError extends Error {
  override name = 'PngError';
}

export type RgbaImage = { width: number; height: number; rgba: Uint8Array };

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Reads an 8-bit RGB or RGBA PNG. Throws PngError for anything else. */
export function decodePng(bytes: Uint8Array): RgbaImage {
  if (bytes.length < 8 || SIGNATURE.some((b, i) => bytes[i] !== b))
    throw new PngError('Not a PNG file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let channels = 0;
  const data: Uint8Array[] = [];
  let at = 8;
  let ended = false;
  while (at + 8 <= bytes.length) {
    const len = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (at + 12 + len > bytes.length) throw new PngError(`The ${type} chunk is cut short`);
    const body = bytes.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      const [depth, colour, , , interlace] = body.subarray(8, 13);
      if (depth !== 8 || interlace !== 0 || (colour !== 2 && colour !== 6))
        throw new PngError('Only 8-bit RGB or RGBA PNGs without interlacing are supported');
      channels = colour === 6 ? 4 : 3;
    } else if (type === 'IDAT') data.push(body);
    else if (type === 'IEND') {
      ended = true;
      break;
    }
    at += 12 + len;
  }
  if (!width || !ended) throw new PngError('The PNG has no header or no end');

  const joined = new Uint8Array(data.reduce((n, d) => n + d.length, 0));
  let o = 0;
  for (const d of data) {
    joined.set(d, o);
    o += d.length;
  }
  let raw: Uint8Array;
  try {
    raw = unzlibSync(joined);
  } catch {
    throw new PngError('The PNG image data is damaged');
  }
  const stride = width * channels;
  if (raw.length < height * (stride + 1)) throw new PngError('The PNG image data is too short');

  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? px[row + x - channels]! : 0;
      const b = y > 0 ? px[row - stride + x]! : 0;
      const c = x >= channels && y > 0 ? px[row - stride + x - channels]! : 0;
      const v = raw[src + x]!;
      let out: number;
      if (filter === 0) out = v;
      else if (filter === 1) out = v + a;
      else if (filter === 2) out = v + b;
      else if (filter === 3) out = v + ((a + b) >> 1);
      else if (filter === 4) out = v + paeth(a, b, c);
      else throw new PngError(`Unknown PNG row filter ${filter}`);
      px[row + x] = out & 0xff;
    }
  }
  if (channels === 4) return { width, height, rgba: px };
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < px.length; i += 3, j += 4) {
    rgba[j] = px[i]!;
    rgba[j + 1] = px[i + 1]!;
    rgba[j + 2] = px[i + 2]!;
    rgba[j + 3] = 0xff;
  }
  return { width, height, rgba };
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

/** Writes an 8-bit RGBA PNG (no row filters; the zlib pass does the work). */
export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  if (rgba.length !== width * height * 4)
    throw new PngError(`Expected ${width * height * 4} bytes of RGBA, got ${rgba.length}`);
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const stride = width * 4;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++)
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const parts = [
    new Uint8Array(SIGNATURE),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibSync(raw, { level: 6 })),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
