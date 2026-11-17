import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PngError, decodePng, encodePng } from './png';

const fixture = (name: string) =>
  new Uint8Array(readFileSync(resolve(__dirname, '../fixtures', name)));

describe('decodePng', () => {
  it("reads a js-dos screenshot saved by Chromium's canvas (RGBA, filtered rows)", () => {
    const img = decodePng(fixture('shifa-menu-menu-640.png'));
    expect([img.width, img.height]).toEqual([640, 400]);
    expect(img.rgba).toHaveLength(640 * 400 * 4);
    // Top-left pixel: the cyan title bar (VGA colour 3, #00AAAA), fully opaque.
    expect(Array.from(img.rgba.subarray(0, 4))).toEqual([0x00, 0xaa, 0xaa, 0xff]);
  });

  it.each([
    ['bytes that are not a PNG', new TextEncoder().encode('GIF89a not a png')],
    ['a PNG cut short', fixture('shifa-menu-menu-640.png').subarray(0, 100)],
  ])('refuses %s with a PngError', (_label, bytes) => {
    expect(() => decodePng(bytes)).toThrow(PngError);
  });
});

describe('encodePng', () => {
  it('round-trips any RGBA image', () => {
    const image = fc
      .record({ width: fc.integer({ min: 1, max: 24 }), height: fc.integer({ min: 1, max: 24 }) })
      .chain(({ width, height }) =>
        fc.record({
          width: fc.constant(width),
          height: fc.constant(height),
          rgba: fc.uint8Array({ minLength: width * height * 4, maxLength: width * height * 4 }),
        }),
      );
    fc.assert(
      fc.property(image, ({ width, height, rgba }) => {
        const back = decodePng(encodePng(width, height, rgba));
        expect(back.width).toBe(width);
        expect(back.height).toBe(height);
        expect(back.rgba).toEqual(rgba);
      }),
    );
  });

  it('re-encodes a real screenshot to the same pixels', () => {
    const img = decodePng(fixture('barkat-ledger-ledger-720.png'));
    expect(decodePng(encodePng(img.width, img.height, img.rgba)).rgba).toEqual(img.rgba);
  });
});
