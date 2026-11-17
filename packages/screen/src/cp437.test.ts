import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CP437, cp437ToUnicode, unicodeToCp437 } from './cp437';

describe('CP437 table', () => {
  it('has exactly 256 single characters, all different', () => {
    expect(CP437).toHaveLength(256);
    expect(new Set(CP437).size).toBe(256);
    for (const c of CP437) expect([...c]).toHaveLength(1);
  });

  it('keeps printable ASCII as it is', () => {
    for (let b = 0x20; b < 0x7f; b++) expect(CP437[b]).toBe(String.fromCharCode(b));
  });

  it.each([
    [0xc4, '─'],
    [0xb3, '│'],
    [0xda, '┌'],
    [0xbf, '┐'],
    [0xc0, '└'],
    [0xd9, '┘'],
    [0xdb, '█'],
    [0xb0, '░'],
    [0x80, 'Ç'],
    [0x9c, '£'],
    [0xe1, 'ß'],
    [0xfe, '■'],
    [0x01, '☺'],
    [0x10, '►'],
    [0x7f, '⌂'],
  ])('maps 0x%s to %s', (byte, ch) => {
    expect(CP437[byte]).toBe(ch);
  });
});

describe('cp437ToUnicode / unicodeToCp437', () => {
  it('decodes the box Shifa draws around its menu', () => {
    expect(cp437ToUnicode(new Uint8Array([0xda, 0xc4, 0xc4, 0xbf]))).toBe('┌──┐');
  });

  it('property: round-trips every byte string', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 200 }), (bytes) => {
        expect(unicodeToCp437(cp437ToUnicode(bytes))).toEqual(bytes);
      }),
    );
  });

  it('refuses a character CP437 does not have', () => {
    expect(() => unicodeToCp437('€')).toThrow(/CP437/);
  });
});
